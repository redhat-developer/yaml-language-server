/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Diagnostic, DiagnosticSeverity, Position, Range } from 'vscode-languageserver-types';
import type { DiagnosticRelatedInformation } from 'vscode-languageserver-types';
import type { LanguageSettings } from '../yamlLanguageService';
import type { YamlVersion, SingleYAMLDocument } from '../parser/yamlParser07';
import type { YAMLSchemaService } from './yamlSchemaService';
import type { YAMLDocDiagnostic } from '../utils/parseUtils';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { YAML_SOURCE } from '../parser/schemaValidation/baseValidator';
import { TextBuffer } from '../utils/textBuffer';
import { filterSuppressedDiagnostics } from '../utils/diagnostic-filter';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import type { Telemetry } from '../telemetry';
import type { AdditionalValidator } from './validation/types';
import { UnusedAnchorsValidator } from './validation/unused-anchors';
import { YAMLStyleValidator } from './validation/yaml-style';
import { MapKeyOrderValidator } from './validation/map-key-order';
import { getSchemaFromModeline } from './modelineUtil';
import { isKubernetes as isKubernetesSchemaURI } from '../utils/schemaUrls';
import type { ErrorCode } from '../jsonLanguageTypes';

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
  private validationEnabled = true;
  private customTags: string[];
  private disableAdditionalProperties: boolean;
  private yamlVersion: YamlVersion;
  private validators: AdditionalValidator[] = [];

  private MATCHES_MULTIPLE = 'Matches multiple schemas when only one must validate.';

  constructor(
    private readonly schemaService: YAMLSchemaService,
    private readonly telemetry?: Telemetry
  ) {}

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
      return [];
    }

    const validationResult: (Diagnostic | YAMLDocDiagnostic)[] = [];
    let suppressKubernetesMatchesMultiple = isKubernetes;
    try {
      const yamlDocument = yamlDocumentsCache.getYamlDocument(
        textDocument,
        { customTags: this.customTags, yamlVersion: this.yamlVersion },
        true
      );

      for (const [index, currentYAMLDoc] of yamlDocument.documents.entries()) {
        const currentDocumentIsKubernetes = isKubernetes || this.hasKubernetesModelineSchema(currentYAMLDoc);
        currentYAMLDoc.isKubernetes = currentDocumentIsKubernetes;
        suppressKubernetesMatchesMultiple = suppressKubernetesMatchesMultiple || currentDocumentIsKubernetes;
        currentYAMLDoc.currentDocIndex = index;
        currentYAMLDoc.disableAdditionalProperties = this.disableAdditionalProperties;
        currentYAMLDoc.uri = textDocument.uri;

        validationResult.push(
          ...currentYAMLDoc.errors,
          ...currentYAMLDoc.warnings,
          ...(await this.getSchemaDiagnostics(textDocument, currentYAMLDoc)),
          ...this.runAdditionalValidators(textDocument, currentYAMLDoc)
        );
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
      if (suppressKubernetesMatchesMultiple && err.message === this.MATCHES_MULTIPLE) {
        continue;
      }

      if (isYAMLDocDiagnostic(err)) {
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

    const textBuffer = new TextBuffer(textDocument);
    return filterSuppressedDiagnostics(
      duplicateMessagesRemoved,
      (d) => d.range.start.line,
      (d) => d.message,
      (line) => {
        if (line < 0 || line >= textBuffer.getLineCount()) {
          return undefined;
        }
        return textBuffer.getLineContent(line).replace(/[\r\n]+$/, '');
      }
    );
  }

  private hasKubernetesModelineSchema(currentYAMLDoc: SingleYAMLDocument): boolean {
    const schemaFromModeline = getSchemaFromModeline(currentYAMLDoc);
    return typeof schemaFromModeline === 'string' && isKubernetesSchemaURI(schemaFromModeline);
  }

  private async getSchemaDiagnostics(textDocument: TextDocument, yamlDocument: SingleYAMLDocument): Promise<Diagnostic[]> {
    const resolvedSchema = await this.schemaService.getSchemaForResource(textDocument.uri, yamlDocument);
    if (!resolvedSchema) {
      return [];
    }

    const diagnostics: Diagnostic[] = [];
    const addSchemaProblem = (
      errorMessage: string,
      errorCode: ErrorCode,
      relatedInformation?: DiagnosticRelatedInformation[]
    ): void => {
      if (!yamlDocument.root) {
        return;
      }

      const astRoot = yamlDocument.root;
      const property = astRoot.type === 'object' ? astRoot.properties[0] : undefined;
      if (property && property.keyNode.value === '$schema') {
        const node = property.valueNode || property;
        const range = Range.create(textDocument.positionAt(node.offset), textDocument.positionAt(node.offset + node.length));
        diagnostics.push(
          Diagnostic.create(range, errorMessage, DiagnosticSeverity.Warning, errorCode, YAML_SOURCE, relatedInformation)
        );
      } else {
        const range = Range.create(textDocument.positionAt(astRoot.offset), textDocument.positionAt(astRoot.offset + 1));
        diagnostics.push(
          Diagnostic.create(range, errorMessage, DiagnosticSeverity.Warning, errorCode, YAML_SOURCE, relatedInformation)
        );
      }
    };

    if (resolvedSchema.errors.length) {
      const error = resolvedSchema.errors[0];
      addSchemaProblem(error.message, error.code, error.relatedInformation);
    } else {
      for (const warning of resolvedSchema.warnings) {
        addSchemaProblem(warning.message, warning.code, warning.relatedInformation);
      }
      const semanticErrors = yamlDocument.validate(textDocument, resolvedSchema.schema);
      if (semanticErrors) {
        diagnostics.push(...semanticErrors);
      }
    }

    return diagnostics;
  }

  private runAdditionalValidators(document: TextDocument, yarnDoc: SingleYAMLDocument): Diagnostic[] {
    return this.validators.flatMap((validator) => validator.validate(document, yarnDoc));
  }
}

function isYAMLDocDiagnostic(diagnostic: Diagnostic | YAMLDocDiagnostic): diagnostic is YAMLDocDiagnostic {
  return 'location' in diagnostic;
}
