/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection } from 'vscode-languageserver/node';
import { JSONSchema } from '../../languageservice/jsonSchema';
import { yamlDocumentsCache } from '../../languageservice/parser/yaml-documents';
import { YAMLSchemaService } from '../../languageservice/services/yamlSchemaService';
import { SettingsState } from '../../yamlSettings';
import { JSONSchemaDescription, JSONSchemaDescriptionExt, SchemaSelectionRequests } from '../../requestTypes';

export class JSONSchemaSelection {
  constructor(
    private readonly schemaService: YAMLSchemaService,
    private readonly yamlSettings?: SettingsState,
    private readonly connection?: Connection
  ) {
    this.connection?.onRequest(SchemaSelectionRequests.getSchema, (fileUri) => {
      return this.getSchemas(fileUri);
    });
    this.connection?.onRequest(SchemaSelectionRequests.getAllSchemas, (fileUri) => {
      return this.getAllSchemas(fileUri);
    });
  }

  async getSchemas(docUri: string): Promise<JSONSchemaDescription[]> {
    const schemas = await this.getSchemasForFile(docUri);
    return Array.from(schemas).map((val) => {
      return {
        name: val[1].title,
        uri: val[0],
        description: val[1].description,
        versions: val[1].versions,
      };
    });
  }

  private async getSchemasForFile(docUri: string): Promise<Map<string, JSONSchema>> {
    const document = this.yamlSettings?.documents.get(docUri);
    const schemas = new Map<string, JSONSchema>();
    if (!document) {
      return schemas;
    }

    const yamlDoc = yamlDocumentsCache.getYamlDocument(document);

    for (const currentYAMLDoc of yamlDoc.documents) {
      const schemaDescriptions = await this.schemaService.getSchemaDescriptionsForResource(document.uri, currentYAMLDoc);
      for (const schemaDescription of schemaDescriptions) {
        schemas.set(schemaDescription.uri, {
          url: schemaDescription.uri,
          title: schemaDescription.name,
          description: schemaDescription.description,
          versions: schemaDescription.versions,
        });
      }
    }
    return schemas;
  }

  async getAllSchemas(docUri: string): Promise<JSONSchemaDescriptionExt[]> {
    const fileSchemas = await this.getSchemasForFile(docUri);
    const fileSchemasHandle: JSONSchemaDescriptionExt[] = Array.from(fileSchemas.entries()).map((val) => {
      return {
        uri: val[0],
        fromStore: false,
        usedForCurrentFile: true,
        name: val[1].title,
        description: val[1].description,
        versions: val[1].versions,
      };
    });
    const result = [];
    let allSchemas = this.schemaService.getAllSchemas();
    allSchemas = allSchemas.filter((val) => !fileSchemas.has(val.uri));
    result.push(...fileSchemasHandle);
    result.push(...allSchemas);

    return result;
  }
}
