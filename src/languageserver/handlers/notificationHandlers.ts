/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { Connection } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { CustomSchemaProvider } from '../../languageservice/services/yamlSchemaService';
import { LanguageService, SchemaConfiguration } from '../../languageservice/yamlLanguageService';
import {
  CustomSchemaRequest,
  DynamicCustomSchemaRequestRegistration,
  SchemaAssociationNotification,
  SchemaSelectionRequests,
  VSCodeContentRequestRegistration,
} from '../../requestTypes';
import { SettingsState } from '../../yamlSettings';
import { SettingsHandler } from './settingsHandlers';

export class NotificationHandlers {
  private languageService: LanguageService;
  private yamlSettings: SettingsState;
  private settingsHandler: SettingsHandler;

  constructor(
    private readonly connection: Connection,
    languageService: LanguageService,
    yamlSettings: SettingsState,
    settingsHandler: SettingsHandler
  ) {
    this.languageService = languageService;
    this.yamlSettings = yamlSettings;
    this.settingsHandler = settingsHandler;
  }

  public registerHandlers(): void {
    this.connection.onNotification(SchemaAssociationNotification.type, (associations) =>
      this.schemaAssociationNotificationHandler(associations)
    );
    this.connection.onNotification(DynamicCustomSchemaRequestRegistration.type, () => this.dynamicSchemaRequestHandler());
    this.connection.onNotification(VSCodeContentRequestRegistration.type, () => this.vscodeContentRequestHandler());
    this.connection.onNotification(SchemaSelectionRequests.type, () => this.schemaSelectionRequestHandler());
  }

  /**
   * Received a notification from the client with schema associations from other extensions
   * Update the associations in the server
   */
  private schemaAssociationNotificationHandler(associations: Record<string, string[]> | SchemaConfiguration[]): void {
    this.yamlSettings.schemaAssociations = associations;
    this.yamlSettings.specificValidatorPaths = [];
    this.settingsHandler.pullConfiguration().catch((error) => console.log(error));
  }

  /**
   * Received a notification from the client that it can accept custom schema requests
   * Register the custom schema provider and use it for requests of unknown scheme
   */
  private dynamicSchemaRequestHandler(): void {
    const schemaProvider = (async (resource) => {
      const schemaFromClient = await this.connection.sendRequest(CustomSchemaRequest.type, resource);

      if (
        (Array.isArray(schemaFromClient) && schemaFromClient.length) ||
        (typeof schemaFromClient === 'string' && schemaFromClient)
      ) {
        return schemaFromClient;
      }

      const rootDir = this.yamlSettings.workspaceRoot.fsPath;
      const relativePath = path.relative(rootDir, URI.parse(resource).fsPath);
      const baseURL = 'https://ebuilder.macrosreply.info/schemas';

      if (/^components\/.*\.ya?ml$/gi.test(relativePath)) {
        return [`${baseURL}/ebuilder.component.schema.json`];
      }

      if (/^configs\/app\.ya?ml$/gi.test(relativePath)) {
        return [`${baseURL}/ebuilder.configs.app.schema.json`];
      }

      if (/^configs\/constant(\.\S+)*\.ya?ml$/gi.test(relativePath)) {
        return [`${baseURL}/ebuilder.configs.constant.schema.json`];
      }

      if (/^configs\/security\.ya?ml$/gi.test(relativePath)) {
        return [`${baseURL}/ebuilder.configs.security.schema.json`];
      }

      if (/^configs\/sql(\.\S+)*\.ya?ml$/gi.test(relativePath)) {
        return [`${baseURL}/ebuilder.configs.sql.schema.json`];
      }

      if (/^configs\/task(\.\S+)*\.ya?ml$/gi.test(relativePath)) {
        return [`${baseURL}/ebuilder.configs.task.schema.json`];
      }

      if (/^configs\/ui\.ya?ml$/gi.test(relativePath)) {
        return [`${baseURL}/ebuilder.configs.ui.schema.json`];
      }

      if (/^locale\/.*\.ya?ml$/gi.test(relativePath)) {
        return [`${baseURL}/ebuilder.locale.schema.json`];
      }

      return [];
    }) as CustomSchemaProvider;
    this.languageService.registerCustomSchemaProvider(schemaProvider);
  }

  /**
   * Received a notification from the client that it can accept content requests
   * This means that the server sends schemas back to the client side to get resolved rather
   * than resolving them on the extension side
   */
  private vscodeContentRequestHandler(): void {
    this.yamlSettings.useVSCodeContentRequest = true;
  }

  private schemaSelectionRequestHandler(): void {
    this.yamlSettings.useSchemaSelectionRequests = true;
  }
}
