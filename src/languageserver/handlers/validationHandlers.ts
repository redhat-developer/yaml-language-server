/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Connection } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver-types';
import { isKubernetesAssociatedDocument } from '../../languageservice/parser/isKubernetes';
import { removeDuplicatesObj } from '../../languageservice/utils/arrUtils';
import { LanguageService } from '../../languageservice/yamlLanguageService';
import { SettingsState } from '../../yamlSettings';

export class ValidationHandler {
  private languageService: LanguageService;
  private yamlSettings: SettingsState;

  constructor(
    private readonly connection: Connection,
    languageService: LanguageService,
    yamlSettings: SettingsState
  ) {
    this.languageService = languageService;
    this.yamlSettings = yamlSettings;

    this.yamlSettings.documents.onDidChangeContent((change) => {
      this.validate(change.document);
    });
    this.yamlSettings.documents.onDidClose((event) => {
      this.cleanPendingValidation(event.document);
      this.connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
    });
  }

  validate(textDocument: TextDocument): void {
    this.cleanPendingValidation(textDocument);
    this.yamlSettings.pendingValidationRequests[textDocument.uri] = setTimeout(() => {
      delete this.yamlSettings.pendingValidationRequests[textDocument.uri];
      this.validateTextDocument(textDocument);
    }, this.yamlSettings.validationDelayMs);
  }

  private cleanPendingValidation(textDocument: TextDocument): void {
    const request = this.yamlSettings.pendingValidationRequests[textDocument.uri];

    if (request) {
      clearTimeout(request);
      delete this.yamlSettings.pendingValidationRequests[textDocument.uri];
    }
  }

  validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
    if (!textDocument) {
      return;
    }

    return this.resolveValidationState(textDocument).then((validationEnabled) => {
      if (!validationEnabled) {
        this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
        return [];
      }

      return this.languageService
        .doValidation(textDocument, isKubernetesAssociatedDocument(textDocument, this.yamlSettings.specificValidatorPaths))
        .then((diagnosticResults) => {
          const diagnostics: Diagnostic[] = [];
          for (const diagnosticItem of diagnosticResults) {
            // Convert all warnings to errors
            if (diagnosticItem.severity === 2) {
              diagnosticItem.severity = 1;
            }
            diagnostics.push(diagnosticItem);
          }

          const removeDuplicatesDiagnostics = removeDuplicatesObj(diagnostics);
          this.connection.sendDiagnostics({
            uri: textDocument.uri,
            diagnostics: removeDuplicatesDiagnostics,
          });
          return removeDuplicatesDiagnostics;
        });
    });
  }

  private async resolveValidationState(document: TextDocument): Promise<boolean> {
    if (this.yamlSettings.hasConfigurationCapability && this.connection.workspace?.getConfiguration) {
      try {
        const scopedLanguageSettings = await this.connection.workspace.getConfiguration({
          section: `[${document.languageId}]`,
          scopeUri: document.uri,
        });

        if (typeof scopedLanguageSettings?.['yaml.validate'] === 'boolean') {
          return scopedLanguageSettings['yaml.validate'];
        }
      } catch {
        // ignore and fall back to global setting
      }
    }
    return this.yamlSettings.yamlShouldValidate;
  }
}
