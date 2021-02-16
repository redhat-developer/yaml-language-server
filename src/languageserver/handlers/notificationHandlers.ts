/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Connection } from 'vscode-languageserver';
import { CustomSchemaProvider } from '../../languageservice/services/yamlSchemaService';
import { LanguageService, SchemaConfiguration } from '../../languageservice/yamlLanguageService';
import {
  CustomSchemaRequest,
  DynamicCustomSchemaRequestRegistration,
  SchemaAssociationNotification,
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
  }

  /**
   * Received a notification from the client with schema associations from other extensions
   * Update the associations in the server
   */
  private schemaAssociationNotificationHandler(associations: Record<string, string[]> | SchemaConfiguration[]): void {
    this.yamlSettings.schemaAssociations = associations;
    this.yamlSettings.specificValidatorPaths = [];
    this.settingsHandler.setSchemaStoreSettingsIfNotSet();
    this.settingsHandler.updateConfiguration();
  }

  /**
   * Received a notification from the client that it can accept custom schema requests
   * Register the custom schema provider and use it for requests of unknown scheme
   */
  private dynamicSchemaRequestHandler(): void {
    const schemaProvider = ((resource) => {
      return this.connection.sendRequest(CustomSchemaRequest.type, resource);
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
}
