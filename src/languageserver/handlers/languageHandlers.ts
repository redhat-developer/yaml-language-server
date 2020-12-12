/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CompletionList, DidChangeWatchedFilesParams, DocumentFormattingParams, DocumentLink, DocumentLinkParams, DocumentSymbolParams, IConnection, TextDocumentPositionParams } from 'vscode-languageserver';
import { DocumentSymbol, Hover, SymbolInformation, TextEdit } from 'vscode-languageserver-types';
import { isKubernetesAssociatedDocument } from '../../languageservice/parser/isKubernetes';
import { LanguageService } from '../../languageservice/yamlLanguageService';
import { SettingsState } from '../../yamlSettings';
import { ValidationHandler } from './validationHandlers';

export class LanguageHandlers {

  private languageService: LanguageService;
  private yamlSettings: SettingsState;
  private validationHandler: ValidationHandler;

  constructor(private readonly connection: IConnection, languageService: LanguageService, yamlSettings: SettingsState, validationHandler: ValidationHandler) {
    this.languageService = languageService;
    this.yamlSettings = yamlSettings;
    this.validationHandler = validationHandler;
  }

  public registerHandlers() {
    this.connection.onDocumentLinks(params => this.documentLinkHandler(params));
    this.connection.onDocumentSymbol(documentSymbolParams => this.documentSymbolHandler(documentSymbolParams));
    this.connection.onDocumentFormatting(formatParams => this.formatterHandler(formatParams));
    this.connection.onHover(textDocumentPositionParams => this.hoverHandler(textDocumentPositionParams));
    this.connection.onCompletion(textDocumentPosition => this.completionHandler(textDocumentPosition));
    this.connection.onDidChangeWatchedFiles(change => this.watchedFilesHandler(change));
  }

  documentLinkHandler(params: DocumentLinkParams): Promise<DocumentLink[]> {
    const document = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!document) {
      return Promise.resolve([]);
    }

    return this.languageService.findLinks(document);
  };

  /**
   * Called when the code outline in an editor needs to be populated
   * Returns a list of symbols that is then shown in the code outline
   */
  documentSymbolHandler(documentSymbolParams: DocumentSymbolParams): DocumentSymbol[] | SymbolInformation[] {
    const document = this.yamlSettings.documents.get(documentSymbolParams.textDocument.uri);

    if (!document) {
      return;
    }

    if (this.yamlSettings.hierarchicalDocumentSymbolSupport) {
      return this.languageService.findDocumentSymbols2(document);
    } else {
      return this.languageService.findDocumentSymbols(document);
    }
  }

  /**
   * Called when the formatter is invoked
   * Returns the formatted document content using prettier
   */
  formatterHandler(formatParams: DocumentFormattingParams): TextEdit[] {
    const document = this.yamlSettings.documents.get(formatParams.textDocument.uri);

    if (!document) {
      return;
    }

    const customFormatterSettings = {
      tabWidth: formatParams.options.tabSize,
      ...this.yamlSettings.yamlFormatterSettings,
    };

    return this.languageService.doFormat(document, customFormatterSettings);
  }

  /**
   * Called when the user hovers with their mouse over a keyword
   * Returns an informational tooltip
   */
  hoverHandler(textDocumentPositionParams: TextDocumentPositionParams): Promise<Hover> {
    const document = this.yamlSettings.documents.get(textDocumentPositionParams.textDocument.uri);

    if (!document) {
      return Promise.resolve(undefined);
    }

    return this.languageService.doHover(document, textDocumentPositionParams.position);
  }

  /**
   * Called when auto-complete is triggered in an editor
   * Returns a list of valid completion items
   */
  completionHandler(textDocumentPosition: TextDocumentPositionParams): Promise<CompletionList> {
    const textDocument = this.yamlSettings.documents.get(textDocumentPosition.textDocument.uri);

    const result: CompletionList = {
      items: [],
      isIncomplete: false,
    };

    if (!textDocument) {
      return Promise.resolve(result);
    }
    return this.languageService.doComplete(textDocument, textDocumentPosition.position, isKubernetesAssociatedDocument(textDocument, this.yamlSettings.specificValidatorPaths));
  }

  /**
   * Called when a monitored file is changed in an editor
   * Re-validates the entire document
   */
  watchedFilesHandler(change: DidChangeWatchedFilesParams): void {
    let hasChanges = false;

    change.changes.forEach((c) => {
      if (this.languageService.resetSchema(c.uri)) {
        hasChanges = true;
      }
    });

    if (hasChanges) {
      this.yamlSettings.documents.all().forEach(document => this.validationHandler.validate(document));
    }
  }

}
