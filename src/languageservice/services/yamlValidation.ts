/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Diagnostic } from 'vscode-languageserver-types';
import { PromiseConstructor, LanguageSettings } from '../yamlLanguageService';
import { parse as parseYAML, YAMLDocument } from '../parser/yamlParser07';
import { SingleYAMLDocument } from '../parser/yamlParser07';
import { YAMLSchemaService } from './yamlSchemaService';
import { YAMLDocDiagnostic } from '../utils/parseUtils';
import { DiagnosticSeverity, Range, TextDocument } from 'vscode-languageserver';
import { ErrorCode } from 'vscode-json-languageservice';
import { ResolvedSchema } from 'vscode-json-languageservice/lib/umd/services/jsonSchemaService';
import { JSONSchemaRef } from 'vscode-json-languageservice/lib/umd/jsonSchema';
import { isBoolean } from 'vscode-json-languageservice/lib/umd/utils/objects';
import { URI } from 'vscode-uri';

const YAML_SOURCE = 'yaml';
/**
 * Convert a YAMLDocDiagnostic to a language server Diagnostic
 * @param yamlDiag A YAMLDocDiagnostic from the parser
 * @param textDocument TextDocument from the language server client
 */
export const yamlDiagToLSDiag = (yamlDiag: YAMLDocDiagnostic, textDocument: TextDocument): Diagnostic => {
  const range = {
    start: textDocument.positionAt(yamlDiag.location.start),
    end: textDocument.positionAt(yamlDiag.location.end),
  };

  return Diagnostic.create(range, yamlDiag.message, yamlDiag.severity, undefined, YAML_SOURCE);
};

export class YAMLValidation {
  private promise: PromiseConstructor;
  private validationEnabled: boolean;
  private customTags: string[];

  private MATCHES_MULTIPLE = 'Matches multiple schemas when only one must validate.';

  public constructor(private schemaService: YAMLSchemaService, promiseConstructor: PromiseConstructor) {
    this.promise = promiseConstructor || Promise;
    this.validationEnabled = true;
  }

  public configure(settings: LanguageSettings): void {
    if (settings) {
      this.validationEnabled = settings.validate;
      this.customTags = settings.customTags;
    }
  }

  public async doValidation(textDocument: TextDocument, isKubernetes = false): Promise<Diagnostic[]> {
    if (!this.validationEnabled) {
      return this.promise.resolve([]);
    }

    const yamlDocument: YAMLDocument = parseYAML(textDocument.getText(), this.customTags);
    const validationResult = [];

    let index = 0;
    for (const currentYAMLDoc of yamlDocument.documents) {
      currentYAMLDoc.isKubernetes = isKubernetes;
      currentYAMLDoc.currentDocIndex = index;

      const validation = await this.validate(textDocument, currentYAMLDoc);
      const syd = (currentYAMLDoc as unknown) as SingleYAMLDocument;
      if (syd.errors.length > 0) {
        // TODO: Get rid of these type assertions (shouldn't need them)
        validationResult.push(...syd.errors);
      }
      if (syd.warnings.length > 0) {
        validationResult.push(...syd.warnings);
      }

      validationResult.push(...validation);
      index++;
    }

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

      const errSig = err.range.start.line + ' ' + err.range.start.character + ' ' + err.message;
      if (!foundSignatures.has(errSig)) {
        duplicateMessagesRemoved.push(err);
        foundSignatures.add(errSig);
      }
    }

    return duplicateMessagesRemoved;
  }

  validate(textDocument: TextDocument, jsonDocument: SingleYAMLDocument): Thenable<Diagnostic[]> {
    if (!this.validationEnabled) {
      return this.promise.resolve([]);
    }
    const diagnostics: Diagnostic[] = [];
    const added: { [signature: string]: boolean } = {};
    const addProblem = (problem: Diagnostic): void => {
      // remove duplicated messages
      const signature = problem.range.start.line + ' ' + problem.range.start.character + ' ' + problem.message;
      if (!added[signature]) {
        added[signature] = true;
        diagnostics.push(problem);
      }
    };
    const getDiagnostics = (schema: ResolvedSchema | undefined): Diagnostic[] => {
      let trailingCommaSeverity = DiagnosticSeverity.Error;
      const source = getSchemaSource(schema?.schema);

      if (schema) {
        if (schema.errors.length && jsonDocument.root) {
          const astRoot = jsonDocument.root;
          const property = astRoot.type === 'object' ? astRoot.properties[0] : undefined;
          if (property && property.keyNode.value === '$schema') {
            const node = property.valueNode || property;
            const range = Range.create(textDocument.positionAt(node.offset), textDocument.positionAt(node.offset + node.length));
            addProblem(
              Diagnostic.create(range, schema.errors[0], DiagnosticSeverity.Warning, ErrorCode.SchemaResolveError, source)
            );
          } else {
            const range = Range.create(textDocument.positionAt(astRoot.offset), textDocument.positionAt(astRoot.offset + 1));
            addProblem(
              Diagnostic.create(range, schema.errors[0], DiagnosticSeverity.Warning, ErrorCode.SchemaResolveError, source)
            );
          }
        } else {
          const semanticErrors = jsonDocument.validate(textDocument, schema.schema);
          if (semanticErrors) {
            semanticErrors.forEach((p) => {
              p.source = source;
              addProblem(p);
            });
          }
        }

        if (schemaAllowsTrailingCommas(schema.schema)) {
          trailingCommaSeverity = undefined;
        }
      }

      for (const p of jsonDocument.syntaxErrors) {
        if (p.code === ErrorCode.TrailingComma) {
          if (typeof trailingCommaSeverity !== 'number') {
            continue;
          }
          p.severity = trailingCommaSeverity;
        }
        p.source = source;
        addProblem(p);
      }

      return diagnostics;
    };

    return this.schemaService.getSchemaForResource(textDocument.uri, jsonDocument).then((schema) => {
      return getDiagnostics(schema);
    });
  }
}

function getSchemaSource(schema: ResolvedSchema): string | undefined {
  if (schema) {
    let label = '';
    if (schema.title) {
      label = schema.title;
    } else if (schema.url) {
      const url = URI.parse(schema.url);
      if (url.scheme === 'file') {
        label = url.fsPath;
      }
      label = url.toString();
    }

    return `yaml-schema: ${label}`;
  }

  return YAML_SOURCE;
}

function schemaAllowsTrailingCommas(schemaRef: JSONSchemaRef): boolean | undefined {
  if (schemaRef && typeof schemaRef === 'object') {
    if (isBoolean(schemaRef.allowTrailingCommas)) {
      return schemaRef.allowTrailingCommas;
    }
    const deprSchemaRef = schemaRef as any;
    if (isBoolean(deprSchemaRef['allowsTrailingCommas'])) {
      // deprecated
      return deprSchemaRef['allowsTrailingCommas'];
    }
    if (schemaRef.allOf) {
      for (const schema of schemaRef.allOf) {
        const allow = schemaAllowsTrailingCommas(schema);
        if (isBoolean(allow)) {
          return allow;
        }
      }
    }
  }
  return undefined;
}
