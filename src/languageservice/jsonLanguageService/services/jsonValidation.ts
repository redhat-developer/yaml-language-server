/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Forked from vscode-json-languageservice@6.0.0-next.1
// Source: https://github.com/microsoft/vscode-json-languageservice/blob/810471bbb462bb6b87351c2232e209a3bb4062ca/src/services/jsonValidation.ts

import { IJSONSchemaService, ResolvedSchema } from './jsonSchemaService';
import type { JSONDocument } from '../../parser/jsonDocument';
import {
  TextDocument,
  ErrorCode,
  PromiseConstructor,
  LanguageSettings,
  DocumentLanguageSettings,
  SeverityLevel,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  JSONLanguageStatus,
} from '../jsonLanguageTypes';
import * as l10n from '@vscode/l10n';
import { JSONSchemaRef, JSONSchema } from '../../jsonSchema';
import { isBoolean } from '../../utils/objects';
import { DiagnosticRelatedInformation } from 'vscode-languageserver-types';

export class JSONValidation {
  private jsonSchemaService: IJSONSchemaService;
  private promise: PromiseConstructor;

  private validationEnabled: boolean | undefined;
  private commentSeverity: DiagnosticSeverity | undefined;

  public constructor(jsonSchemaService: IJSONSchemaService, promiseConstructor: PromiseConstructor) {
    this.jsonSchemaService = jsonSchemaService;
    this.promise = promiseConstructor;
    this.validationEnabled = true;
  }

  public configure(raw: LanguageSettings | undefined): void {
    if (raw) {
      this.validationEnabled = raw.validate !== false;
      this.commentSeverity = raw.allowComments ? undefined : DiagnosticSeverity.Error;
    }
  }

  public doValidation(
    textDocument: TextDocument,
    jsonDocument: JSONDocument,
    documentSettings?: DocumentLanguageSettings,
    schema?: JSONSchema
  ): PromiseLike<Diagnostic[]> {
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
      let trailingCommaSeverity = documentSettings?.trailingCommas
        ? toDiagnosticSeverity(documentSettings.trailingCommas)
        : DiagnosticSeverity.Error;
      let commentSeverity = documentSettings?.comments ? toDiagnosticSeverity(documentSettings.comments) : this.commentSeverity;
      const schemaValidation = documentSettings?.schemaValidation
        ? toDiagnosticSeverity(documentSettings.schemaValidation)
        : DiagnosticSeverity.Warning;
      const schemaRequest = documentSettings?.schemaRequest
        ? toDiagnosticSeverity(documentSettings.schemaRequest)
        : DiagnosticSeverity.Warning;

      if (schema) {
        const addSchemaProblem = (
          errorMessage: string,
          errorCode: ErrorCode,
          relatedInformation?: DiagnosticRelatedInformation[]
        ): void => {
          if (jsonDocument.root && schemaRequest) {
            const astRoot = jsonDocument.root;
            const property = astRoot.type === 'object' ? astRoot.properties[0] : undefined;
            if (property && property.keyNode.value === '$schema') {
              const node = property.valueNode || property;
              const range = Range.create(
                textDocument.positionAt(node.offset),
                textDocument.positionAt(node.offset + node.length)
              );
              addProblem(Diagnostic.create(range, errorMessage, schemaRequest, errorCode, 'json', relatedInformation));
            } else {
              const range = Range.create(textDocument.positionAt(astRoot.offset), textDocument.positionAt(astRoot.offset + 1));
              addProblem(Diagnostic.create(range, errorMessage, schemaRequest, errorCode, 'json', relatedInformation));
            }
          }
        };
        if (schema.errors.length) {
          const error = schema.errors[0];
          addSchemaProblem(error.message, error.code, error.relatedInformation);
        } else if (schemaValidation) {
          for (const warning of schema.warnings) {
            addSchemaProblem(warning.message, warning.code, warning.relatedInformation);
          }
          const semanticErrors = jsonDocument.validate(textDocument, schema.schema);
          if (semanticErrors) {
            semanticErrors.forEach(addProblem);
          }
        }
        if (schemaAllowsComments(schema.schema)) {
          commentSeverity = undefined;
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
        addProblem(p);
      }

      if (typeof commentSeverity === 'number') {
        const message = l10n.t('Comments are not permitted in JSON.');
        jsonDocument.comments.forEach((c) => {
          addProblem(Diagnostic.create(c, message, commentSeverity, ErrorCode.CommentNotPermitted));
        });
      }
      return diagnostics;
    };

    if (schema) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      const uri = schema.id || 'schemaservice://untitled/' + idCounter++;
      const handle = this.jsonSchemaService.registerExternalSchema({ uri, schema });
      return handle.getResolvedSchema().then((resolvedSchema) => {
        return getDiagnostics(resolvedSchema);
      });
    }
    return this.jsonSchemaService.getSchemaForResource(textDocument.uri, jsonDocument).then((schema) => {
      return getDiagnostics(schema);
    });
  }

  public getLanguageStatus(textDocument: TextDocument, jsonDocument: JSONDocument): JSONLanguageStatus {
    return { schemas: this.jsonSchemaService.getSchemaURIsForResource(textDocument.uri, jsonDocument) };
  }
}

let idCounter = 0;

function schemaAllowsComments(schemaRef: JSONSchemaRef): boolean | undefined {
  if (schemaRef && typeof schemaRef === 'object') {
    if (isBoolean(schemaRef.allowComments)) {
      return schemaRef.allowComments;
    }
    if (schemaRef.allOf) {
      for (const schema of schemaRef.allOf) {
        const allow = schemaAllowsComments(schema);
        if (isBoolean(allow)) {
          return allow;
        }
      }
    }
  }
  return undefined;
}

function schemaAllowsTrailingCommas(schemaRef: JSONSchemaRef): boolean | undefined {
  if (schemaRef && typeof schemaRef === 'object') {
    if (isBoolean(schemaRef.allowTrailingCommas)) {
      return schemaRef.allowTrailingCommas;
    }
    const deprSchemaRef = schemaRef;
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

function toDiagnosticSeverity(severityLevel: SeverityLevel | undefined): DiagnosticSeverity | undefined {
  switch (severityLevel) {
    case 'error':
      return DiagnosticSeverity.Error;
    case 'warning':
      return DiagnosticSeverity.Warning;
    case 'ignore':
      return undefined;
  }
  return undefined;
}
