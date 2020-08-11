/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Diagnostic, TextDocument } from 'vscode-languageserver-types';
import { PromiseConstructor, LanguageSettings } from '../yamlLanguageService';
import { parse as parseYAML, YAMLDocument } from '../parser/yamlParser07';
import { SingleYAMLDocument } from '../parser/yamlParser07';
import { YAMLSchemaService } from './yamlSchemaService';
import { JSONValidation } from 'vscode-json-languageservice/lib/umd/services/jsonValidation';
import { YAMLDocDiagnostic } from '../utils/parseUtils';

/**
 * Convert a YAMLDocDiagnostic to a language server Diagnostic
 * @param yamlDiag A YAMLDocDiagnostic from the parser
 * @param textDocument TextDocument from the language server client
 */
export const yamlDiagToLSDiag = (
  yamlDiag: YAMLDocDiagnostic,
  textDocument: TextDocument
): Diagnostic => {
  const range = {
    start: textDocument.positionAt(yamlDiag.location.start),
    end: textDocument.positionAt(yamlDiag.location.end),
  };

  return {
    message: yamlDiag.message,
    range,
    severity: yamlDiag.severity,
  };
};

export class YAMLValidation {
  private promise: PromiseConstructor;
  private validationEnabled: boolean;
  private customTags: string[];
  private jsonValidation;

  private MATCHES_MULTIPLE = 'Matches multiple schemas when only one must validate.';

  public constructor(schemaService: YAMLSchemaService, promiseConstructor: PromiseConstructor) {
    this.promise = promiseConstructor || Promise;
    this.validationEnabled = true;
    this.jsonValidation = new JSONValidation(schemaService, this.promise);
  }

  public configure(settings: LanguageSettings) {
    if (settings) {
      this.validationEnabled = settings.validate;
      this.customTags = settings.customTags;
    }
  }

  public async doValidation(
    textDocument: TextDocument,
    isKubernetes = false
  ): Promise<Diagnostic[]> {
    if (!this.validationEnabled) {
      return this.promise.resolve([]);
    }

    const yamlDocument: YAMLDocument = parseYAML(textDocument.getText(), this.customTags);
    const validationResult = [];

    let index = 0;
    for (const currentYAMLDoc of yamlDocument.documents) {
      currentYAMLDoc.isKubernetes = isKubernetes;
      currentYAMLDoc.currentDocIndex = index;

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
}
