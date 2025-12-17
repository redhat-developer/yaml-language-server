/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OutputUnit, validate } from '@hyperjump/json-schema/draft-07';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Position, Range } from 'vscode-languageserver-types';
import { parse } from 'yaml';
import { ArrayASTNode, PropertyASTNode } from '../jsonASTTypes';
import { YAML_SOURCE } from '../parser/jsonParser07';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { SingleYAMLDocument, YAMLDocument, YamlVersion } from '../parser/yamlParser07';
import { Telemetry } from '../telemetry';
import { YAMLDocDiagnostic } from '../utils/parseUtils';
import { TextBuffer } from '../utils/textBuffer';
import { LanguageSettings } from '../yamlLanguageService';
import { MapKeyOrderValidator } from './validation/map-key-order';
import { AdditionalValidator } from './validation/types';
import { UnusedAnchorsValidator } from './validation/unused-anchors';
import { YAMLStyleValidator } from './validation/yaml-style';
import { YAMLSchemaService } from './yamlSchemaService';

/**
 * Convert a YAMLDocDiagnostic to a language server Diagnostic
 * @param yamlDiag A YAMLDocDiagnostic from the parser
 * @param textDocument TextDocument from the language server client
 */
export const yamlDiagToLSDiag = (yamlDiag: YAMLDocDiagnostic, textDocument: TextDocument): Diagnostic => {
  const start = textDocument.positionAt(yamlDiag.location.start);
  const range = {
    start,
    end: yamlDiag.location.toLineEnd
      ? Position.create(start.line, new TextBuffer(textDocument).getLineLength(start.line))
      : textDocument.positionAt(yamlDiag.location.end),
  };

  return Diagnostic.create(range, yamlDiag.message, yamlDiag.severity, yamlDiag.code, YAML_SOURCE);
};

export class YAMLValidation {
  private validationEnabled: boolean;
  private customTags: string[];
  private jsonValidation;
  private disableAdditionalProperties: boolean;
  private yamlVersion: YamlVersion;
  private validators: AdditionalValidator[] = [];
  private schemaService: YAMLSchemaService;

  private MATCHES_MULTIPLE = 'Matches multiple schemas when only one must validate.';

  constructor(
    schemaService: YAMLSchemaService,
    private readonly telemetry?: Telemetry
  ) {
    this.validationEnabled = true;
    this.schemaService = schemaService;
    // this.jsonValidation = new JSONValidation(schemaService, Promise);
  }

  public configure(settings: LanguageSettings): void {
    this.validators = [];
    if (settings) {
      this.validationEnabled = settings.validate;
      this.customTags = settings.customTags;
      this.disableAdditionalProperties = settings.disableAdditionalProperties;
      this.yamlVersion = settings.yamlVersion;
      // Add style validator if flow style is set to forbid only.
      if (settings.flowMapping === 'forbid' || settings.flowSequence === 'forbid') {
        this.validators.push(new YAMLStyleValidator(settings));
      }
      if (settings.keyOrdering) {
        this.validators.push(new MapKeyOrderValidator());
      }
    }
    this.validators.push(new UnusedAnchorsValidator());
  }

  public async doValidation(textDocument: TextDocument, isKubernetes = false): Promise<Diagnostic[]> {
    if (!this.validationEnabled) {
      return Promise.resolve([]);
    }

    const validationResult = [];
    try {
      const yamlDocument: YAMLDocument = yamlDocumentsCache.getYamlDocument(
        textDocument,
        { customTags: this.customTags, yamlVersion: this.yamlVersion },
        true
      );

      let index = 0;
      for (const currentYAMLDoc of yamlDocument.documents) {
        currentYAMLDoc.isKubernetes = isKubernetes;
        currentYAMLDoc.currentDocIndex = index;
        currentYAMLDoc.disableAdditionalProperties = this.disableAdditionalProperties;
        currentYAMLDoc.uri = textDocument.uri;

        const schema = await this.schemaService.getSchemaForResource(textDocument.uri, currentYAMLDoc);
        const hyperschemaResult = await validate(schema.schema.url, parse(textDocument.getText()), 'BASIC');
        const validation: Diagnostic[] = [];
        if (!hyperschemaResult.valid) {
          const errors = (hyperschemaResult as { errors: OutputUnit[] }).errors;
          for (const error of errors) {
            const segments = error.instanceLocation.split('/');
            let pointer = currentYAMLDoc.root;
            // skip leading `#`
            for (let i = 1; i < segments.length; i++) {
              const toGet = segments[i];
              const toGetNumber = parseInt(toGet);
              if (!isNaN(toGetNumber)) {
                pointer = ((pointer as PropertyASTNode).valueNode as ArrayASTNode).items[toGetNumber];
              } else {
                pointer = pointer.children.find((child) => (child as PropertyASTNode).keyNode.value === toGet);
              }
            }
            pointer = pointer.type === 'property' ? (pointer as PropertyASTNode).valueNode : pointer;
            validation.push({
              message: error.keyword,
              range: Range.create(
                textDocument.positionAt(pointer.offset),
                textDocument.positionAt(pointer.offset + pointer.length)
              ),
              severity: DiagnosticSeverity.Error,
              code: error.keyword,
            });
          }
        }

        // const validation = await this.jsonValidation.doValidation(textDocument, currentYAMLDoc);

        const syd = currentYAMLDoc as unknown as SingleYAMLDocument;
        if (syd.errors.length > 0) {
          // TODO: Get rid of these type assertions (shouldn't need them)
          validationResult.push(...syd.errors);
        }
        if (syd.warnings.length > 0) {
          validationResult.push(...syd.warnings);
        }

        validationResult.push(...validation);
        validationResult.push(...this.runAdditionalValidators(textDocument, currentYAMLDoc));
        index++;
      }
    } catch (err) {
      this.telemetry?.sendError('yaml.validation.error', err);
    }

    let previousErr: Diagnostic;
    const foundSignatures = new Set();
    const duplicateMessagesRemoved: Diagnostic[] = [];
    for (let err of validationResult) {
      /**
       * A patch ontop of the validation that removes the
       * 'Matches many schemas' error for kubernetes
       * for a better user experience.
       */
      if (isKubernetes && err.message === this.MATCHES_MULTIPLE) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(err, 'location')) {
        err = yamlDiagToLSDiag(err, textDocument);
      }

      if (!err.source) {
        err.source = YAML_SOURCE;
      }

      if (
        previousErr &&
        previousErr.message === err.message &&
        previousErr.range.end.line === err.range.start.line &&
        Math.abs(previousErr.range.end.character - err.range.end.character) >= 1
      ) {
        previousErr.range.end = err.range.end;
        continue;
      } else {
        previousErr = err;
      }

      const errSig = err.range.start.line + ' ' + err.range.start.character + ' ' + err.message;
      if (!foundSignatures.has(errSig)) {
        duplicateMessagesRemoved.push(err);
        foundSignatures.add(errSig);
      }
    }

    return duplicateMessagesRemoved;
  }
  private runAdditionalValidators(document: TextDocument, yarnDoc: SingleYAMLDocument): Diagnostic[] {
    const result = [];

    for (const validator of this.validators) {
      result.push(...validator.validate(document, yarnDoc));
    }
    return result;
  }
}
