/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IConnection } from 'vscode-languageserver';
import { MODIFICATION_ACTIONS, SchemaAdditions, SchemaDeletions } from '../../languageservice/services/yamlSchemaService';
import { LanguageService } from '../../languageservice/yamlLanguageService';
import { SchemaModificationNotification } from '../../requestTypes';

export class RequestHandlers {

  private languageService: LanguageService;
  constructor(private readonly connection: IConnection, languageService: LanguageService) {
    this.languageService = languageService;
  }

  public registerHandlers() {
    this.connection.onRequest(SchemaModificationNotification.type, modifications => this.registerSchemaModificationNotificationHandler(modifications));
  }

  private registerSchemaModificationNotificationHandler(modifications: SchemaAdditions | SchemaDeletions) {
    if (modifications.action === MODIFICATION_ACTIONS.add) {
      this.languageService.modifySchemaContent(modifications);
    } else if (modifications.action === MODIFICATION_ACTIONS.delete) {
      this.languageService.deleteSchemaContent(modifications);
    }
    return Promise.resolve();
  }

}
