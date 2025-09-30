/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Connection, TextDocumentPositionParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  MODIFICATION_ACTIONS,
  SchemaAdditions,
  SchemaDeletions,
  SchemaDeletionsAll,
} from '../../languageservice/services/yamlSchemaService';
import { LanguageService } from '../../languageservice/yamlLanguageService';
import {
  CompletionYamlRequest,
  GetDiagnosticRequest,
  HoverDetailRequest,
  HoverYamlRequest,
  RevalidateBySchemaRequest,
  RevalidateRequest,
  SchemaModificationNotification,
  VSCodeContentRequest,
} from '../../requestTypes';
import { SettingsState } from '../../yamlSettings';
import { ValidationHandler } from './validationHandlers';
import { yamlDocumentsCache } from '../../languageservice/parser/yaml-documents';

export class RequestHandlers {
  private languageService: LanguageService;
  constructor(
    private readonly connection: Connection,
    languageService: LanguageService,
    private yamlSettings: SettingsState,
    private validationHandler: ValidationHandler
  ) {
    this.languageService = languageService;
  }

  public registerHandlers(): void {
    this.connection.onRequest(SchemaModificationNotification.type, (modifications) =>
      this.registerSchemaModificationNotificationHandler(modifications)
    );

    /**
     * Received request from the client that detail info is needed.
     */
    this.connection.onRequest(HoverDetailRequest.type, (params: TextDocumentPositionParams) => {
      const document = this.yamlSettings.documents.get(params.textDocument.uri);
      // return this.languageService.doHover(document, params.position);
      return this.languageService.doHoverDetail(document, params.position);
    });

    /**
     * Received request from the client that revalidation is needed.
     */
    this.connection.onRequest(RevalidateRequest.type, async (uri: string) => {
      const document = this.yamlSettings.documents.get(uri);
      if (!document) {
        console.log('Revalidate: No document found for uri: ' + uri);
      }
      await this.validationHandler.validate(document);
    });

    /**
     * Received request from the client that the diagnostic is needed.
     * If the file hasn't been opened yet, we need to get the content from the client.
     * It's used fot the builder solution diagnostic.
     */
    this.connection.onRequest(GetDiagnosticRequest.type, async (uri: string) => {
      let document = this.yamlSettings.documents.get(uri);
      if (!document) {
        const content = await this.connection.sendRequest(VSCodeContentRequest.type, uri);
        if (typeof content !== 'string') {
          console.log('Revalidate: No content found for uri: ' + uri);
          return;
        }
        document = TextDocument.create(uri, 'yaml', 0, content);
      }
      const result = await this.languageService.doValidation(document, false);
      return result;
    });

    /**
     * Received request from the client that revalidation is needed.
     */
    this.connection.onRequest(RevalidateBySchemaRequest.type, async (params: { yaml: string; schema: unknown }) => {
      const yamlName = Math.random().toString(36).substring(2) + '.yaml';
      const document = TextDocument.create(yamlName, 'yaml', 0, params.yaml);
      this.languageService.addSchema(yamlName, params.schema);
      try {
        const result = await this.languageService.doValidation(document, false);
        return result;
      } finally {
        yamlDocumentsCache.delete(document);
        this.languageService.deleteSchema(yamlName);
      }
    });

    /**
     * Received request from the client that do completion for expression.
     */
    this.connection.onRequest(
      CompletionYamlRequest.type,
      async (params: { yaml: string; position: TextDocumentPositionParams['position']; fileName: string }) => {
        const { yaml, fileName, position } = params;
        const document = TextDocument.create(fileName, 'yaml', 0, yaml);
        try {
          const result = await this.languageService.doComplete(document, position, false);
          return result;
        } finally {
          yamlDocumentsCache.delete(document);
        }
      }
    );

    /**
     * Received request from the client that do completion for expression.
     */
    this.connection.onRequest(
      HoverYamlRequest.type,
      async (params: { yaml: string; position: TextDocumentPositionParams['position']; fileName: string }) => {
        const { yaml, fileName, position } = params;
        const document = TextDocument.create(fileName, 'yaml', 0, yaml);
        try {
          const result = await this.languageService.doHoverDetail(document, position);
          return result;
        } finally {
          yamlDocumentsCache.delete(document);
        }
      }
    );
  }

  private registerSchemaModificationNotificationHandler(
    modifications: SchemaAdditions | SchemaDeletions | SchemaDeletionsAll
  ): void {
    if (modifications.action === MODIFICATION_ACTIONS.add) {
      this.languageService.modifySchemaContent(modifications);
    } else if (modifications.action === MODIFICATION_ACTIONS.delete) {
      this.languageService.deleteSchemaContent(modifications);
    } else if (modifications.action === MODIFICATION_ACTIONS.deleteAll) {
      this.languageService.deleteSchemasWhole(modifications);
    }
  }
}
