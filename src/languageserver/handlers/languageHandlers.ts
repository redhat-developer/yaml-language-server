/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Connection } from 'vscode-languageserver';
import {
  CodeActionParams,
  CodeLensParams,
  DefinitionParams,
  DidChangeWatchedFilesParams,
  DocumentFormattingParams,
  DocumentLinkParams,
  DocumentOnTypeFormattingParams,
  DocumentSymbolParams,
  FoldingRangeParams,
  SelectionRangeParams,
  SignatureHelpParams,
  TextDocumentPositionParams,
} from 'vscode-languageserver-protocol';
import {
  CodeAction,
  CodeLens,
  CompletionItem,
  CompletionList,
  Definition,
  DefinitionLink,
  DocumentLink,
  DocumentSymbol,
  FoldingRange,
  Hover,
  SelectionRange,
  SignatureHelp,
  SymbolInformation,
  TextEdit,
} from 'vscode-languageserver-types';
import { LanguageModes, getLanguageModes, isCompletionItemData } from '../../embeddedlanguage/modes/languageModes';
import { isKubernetesAssociatedDocument } from '../../languageservice/parser/isKubernetes';
import { Telemetry } from '../../languageservice/telemetry';
import { LanguageService } from '../../languageservice/yamlLanguageService';
import { ResultLimitReachedNotification } from '../../requestTypes';
import { SettingsState } from '../../yamlSettings';
import { ValidationHandler } from './validationHandlers';

export class LanguageHandlers {
  private languageService: LanguageService;
  private yamlSettings: SettingsState;
  private validationHandler: ValidationHandler;
  private languageModes: LanguageModes;

  pendingLimitExceededWarnings: { [uri: string]: { features: { [name: string]: string }; timeout?: NodeJS.Timeout } };

  constructor(
    private readonly connection: Connection,
    languageService: LanguageService,
    yamlSettings: SettingsState,
    validationHandler: ValidationHandler,
    telemetry: Telemetry
  ) {
    this.languageService = languageService;
    this.yamlSettings = yamlSettings;
    this.validationHandler = validationHandler;
    this.pendingLimitExceededWarnings = {};

    const workspace = {
      get settings() {
        return {};
      },
      get folders() {
        return yamlSettings.workspaceFolders;
      },
      get root() {
        return yamlSettings.workspaceRoot.fsPath;
      },
    };

    this.languageModes = getLanguageModes(workspace, telemetry);
  }

  public registerHandlers(): void {
    this.connection.onDocumentLinks((params) => this.documentLinkHandler(params));
    this.connection.onDocumentSymbol((documentSymbolParams) => this.documentSymbolHandler(documentSymbolParams));
    this.connection.onDocumentFormatting((formatParams) => this.formatterHandler(formatParams));
    this.connection.onHover((textDocumentPositionParams) => this.hoverHandler(textDocumentPositionParams));
    this.connection.onCompletionResolve((completionResolveParams) => this.completionResolveHandler(completionResolveParams));
    this.connection.onSignatureHelp((signatureHelpParams) => this.signatureHelpHandler(signatureHelpParams));
    this.connection.onCompletion((textDocumentPosition) => this.completionHandler(textDocumentPosition));
    this.connection.onDidChangeWatchedFiles((change) => this.watchedFilesHandler(change));
    this.connection.onFoldingRanges((params) => this.foldingRangeHandler(params));
    this.connection.onSelectionRanges((params) => this.selectionRangeHandler(params));
    this.connection.onCodeAction((params) => this.codeActionHandler(params));
    this.connection.onDocumentOnTypeFormatting((params) => this.formatOnTypeHandler(params));
    this.connection.onCodeLens((params) => this.codeLensHandler(params));
    this.connection.onCodeLensResolve((params) => this.codeLensResolveHandler(params));
    this.connection.onDefinition((params) => this.definitionHandler(params));
    this.connection.onShutdown(() => this.languageModes.dispose());

    this.yamlSettings.documents.onDidChangeContent((change) => this.cancelLimitExceededWarnings(change.document.uri));
    this.yamlSettings.documents.onDidClose((event) => {
      this.cancelLimitExceededWarnings(event.document.uri);
      this.languageModes.onDocumentRemoved(event.document);
    });
  }

  documentLinkHandler(params: DocumentLinkParams): Promise<DocumentLink[]> {
    const document = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!document) {
      return Promise.resolve([]);
    }

    return this.languageService.findLinks(document);
  }

  /**
   * Called when the code outline in an editor needs to be populated
   * Returns a list of symbols that is then shown in the code outline
   */
  documentSymbolHandler(documentSymbolParams: DocumentSymbolParams): DocumentSymbol[] | SymbolInformation[] {
    const document = this.yamlSettings.documents.get(documentSymbolParams.textDocument.uri);

    if (!document) {
      return;
    }

    const onResultLimitExceeded = this.onResultLimitExceeded(
      document.uri,
      this.yamlSettings.maxItemsComputed,
      'document symbols'
    );

    const context = { resultLimit: this.yamlSettings.maxItemsComputed, onResultLimitExceeded };

    if (this.yamlSettings.hierarchicalDocumentSymbolSupport) {
      return this.languageService.findDocumentSymbols2(document, context);
    } else {
      return this.languageService.findDocumentSymbols(document, context);
    }
  }

  /**
   * Called when the formatter is invoked
   * Returns the formatted document content using prettier
   */
  formatterHandler(formatParams: DocumentFormattingParams): Promise<TextEdit[]> {
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

  formatOnTypeHandler(params: DocumentOnTypeFormattingParams): Promise<TextEdit[] | undefined> | TextEdit[] | undefined {
    const document = this.yamlSettings.documents.get(params.textDocument.uri);

    if (!document) {
      return;
    }
    return this.languageService.doDocumentOnTypeFormatting(document, params);
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

    const mode = this.languageModes.getModeAtPosition(document, textDocumentPositionParams.position);
    if (mode?.doHover) {
      return mode.doHover(document, textDocumentPositionParams.position);
    }

    return this.languageService.doHover(document, textDocumentPositionParams.position);
  }

  async signatureHelpHandler(signatureHelp: SignatureHelpParams): Promise<SignatureHelp | null> {
    const textDocument = this.yamlSettings.documents.get(signatureHelp.textDocument.uri);

    if (!textDocument) {
      return null;
    }

    const mode = this.languageModes.getModeAtPosition(textDocument, signatureHelp.position);
    if (mode?.doSignatureHelp) {
      return mode.doSignatureHelp(textDocument, signatureHelp.position);
    }

    return null;
  }

  /**
   * Called when auto-complete is triggered in an editor
   * Returns a list of valid completion items
   */
  async completionHandler(textDocumentPosition: TextDocumentPositionParams): Promise<CompletionList> {
    const textDocument = this.yamlSettings.documents.get(textDocumentPosition.textDocument.uri);

    const result: CompletionList = {
      items: [],
      isIncomplete: false,
    };

    if (!textDocument) {
      return Promise.resolve(result);
    }

    const mode = this.languageModes.getModeAtPosition(textDocument, textDocumentPosition.position);
    if (mode?.doComplete) {
      return mode.doComplete(textDocument, textDocumentPosition.position);
    }

    return this.languageService.doComplete(
      textDocument,
      textDocumentPosition.position,
      isKubernetesAssociatedDocument(textDocument, this.yamlSettings.specificValidatorPaths)
    );
  }

  async completionResolveHandler(item: CompletionItem): Promise<CompletionItem | null> {
    const data = item.data;
    if (isCompletionItemData(data)) {
      const document = this.yamlSettings.documents.get(data.uri);

      if (!document) {
        return null;
      }

      const mode = this.languageModes.getModeAtPosition(document, document.positionAt(data.offset));
      if (mode && mode.doResolve) {
        return mode.doResolve(document, item);
      }
    }
    return item;
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
      this.yamlSettings.documents.all().forEach((document) => this.validationHandler.validate(document));
    }
  }

  foldingRangeHandler(params: FoldingRangeParams): Promise<FoldingRange[] | undefined> | FoldingRange[] | undefined {
    const textDocument = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!textDocument) {
      return;
    }

    const capabilities = this.yamlSettings.capabilities.textDocument.foldingRange;
    const rangeLimit = this.yamlSettings.maxItemsComputed || capabilities.rangeLimit;
    const onRangeLimitExceeded = this.onResultLimitExceeded(textDocument.uri, rangeLimit, 'folding ranges');

    const context = {
      rangeLimit,
      onRangeLimitExceeded,
      lineFoldingOnly: capabilities.lineFoldingOnly,
    };

    return this.languageService.getFoldingRanges(textDocument, context);
  }

  selectionRangeHandler(params: SelectionRangeParams): SelectionRange[] | undefined {
    const textDocument = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!textDocument) {
      return;
    }

    return this.languageService.getSelectionRanges(textDocument, params.positions);
  }

  codeActionHandler(params: CodeActionParams): CodeAction[] | undefined {
    const textDocument = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!textDocument) {
      return;
    }

    return this.languageService.getCodeAction(textDocument, params);
  }

  codeLensHandler(params: CodeLensParams): PromiseLike<CodeLens[] | undefined> | CodeLens[] | undefined {
    const textDocument = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!textDocument) {
      return;
    }
    return this.languageService.getCodeLens(textDocument);
  }

  codeLensResolveHandler(param: CodeLens): PromiseLike<CodeLens> | CodeLens {
    return this.languageService.resolveCodeLens(param);
  }

  definitionHandler(params: DefinitionParams): DefinitionLink[] | Promise<Definition> {
    const textDocument = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!textDocument) {
      return;
    }

    const mode = this.languageModes.getModeAtPosition(textDocument, params.position);
    if (mode?.findDefinition) {
      return mode.findDefinition(textDocument, params.position);
    }

    return this.languageService.doDefinition(textDocument, params);
  }

  // Adapted from:
  // https://github.com/microsoft/vscode/blob/94c9ea46838a9a619aeafb7e8afd1170c967bb55/extensions/json-language-features/server/src/jsonServer.ts#L172
  private cancelLimitExceededWarnings(uri: string): void {
    const warning = this.pendingLimitExceededWarnings[uri];
    if (warning && warning.timeout) {
      clearTimeout(warning.timeout);
      delete this.pendingLimitExceededWarnings[uri];
    }
  }

  private onResultLimitExceeded(uri: string, resultLimit: number, name: string) {
    return () => {
      let warning = this.pendingLimitExceededWarnings[uri];
      if (warning) {
        if (!warning.timeout) {
          // already shown
          return;
        }
        warning.features[name] = name;
        warning.timeout.refresh();
      } else {
        warning = { features: { [name]: name } };
        warning.timeout = setTimeout(() => {
          this.connection.sendNotification(
            ResultLimitReachedNotification.type,
            `${path.basename(uri)}: For performance reasons, ${Object.keys(warning.features).join(
              ' and '
            )} have been limited to ${resultLimit} items.`
          );
          warning.timeout = undefined;
        }, 2000);
        this.pendingLimitExceededWarnings[uri] = warning;
      }
    };
  }
}
