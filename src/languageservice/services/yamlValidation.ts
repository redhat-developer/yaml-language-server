/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Diagnostic, Position } from 'vscode-languageserver';
import { LanguageSettings } from '../yamlLanguageService';
import { YAMLDocument } from '../parser/yamlParser07';
import { SingleYAMLDocument } from '../parser/yamlParser07';
import { YAMLSchemaService } from './yamlSchemaService';
import { YAMLDocDiagnostic } from '../utils/parseUtils';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { JSONValidation } from 'vscode-json-languageservice/lib/umd/services/jsonValidation';
import { YAML_SOURCE } from '../parser/jsonParser07';
import { TextBuffer } from '../utils/textBuffer';
import { yamlDocumentsCache } from '../parser/yaml-documents';

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
      ? Position.create(start.line, new TextBuffer(textDocument).getLineLength(yamlDiag.location.start))
      : textDocument.positionAt(yamlDiag.location.end),
  };

  return Diagnostic.create(range, yamlDiag.message, yamlDiag.severity, yamlDiag.code, YAML_SOURCE);
};

export class YAMLValidation {
  private validationEnabled: boolean;
  private customTags: string[];
  private jsonValidation;
  private disableAdditionalProperties: boolean;

  private MATCHES_MULTIPLE = 'Matches multiple schemas when only one must validate.';

  public constructor(schemaService: YAMLSchemaService) {
    this.validationEnabled = true;
    this.jsonValidation = new JSONValidation(schemaService, Promise);
  }

  public configure(settings: LanguageSettings): void {
    if (settings) {
      this.validationEnabled = settings.validate;
      this.customTags = settings.customTags;
      this.disableAdditionalProperties = settings.disableAdditionalProperties;
    }
  }

  public async doValidation(textDocument: TextDocument, isKubernetes = false): Promise<Diagnostic[]> {
    if (!this.validationEnabled) {
      return Promise.resolve([]);
    }

    const yamlDocument: YAMLDocument = yamlDocumentsCache.getYamlDocument(textDocument, this.customTags, true);
    const validationResult = [];

    let index = 0;
    for (const currentYAMLDoc of yamlDocument.documents) {
      currentYAMLDoc.isKubernetes = isKubernetes;
      currentYAMLDoc.currentDocIndex = index;
      currentYAMLDoc.disableAdditionalProperties = this.disableAdditionalProperties;

      const validation = await this.jsonValidation.doValidation(textDocument, currentYAMLDoc);

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
}
