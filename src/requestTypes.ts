/* eslint-disable @typescript-eslint/no-namespace */
import { NotificationType, RequestType } from 'vscode-languageserver';
import { SchemaAdditions, SchemaDeletions } from './languageservice/services/yamlSchemaService';
import { SchemaConfiguration } from './languageservice/yamlLanguageService';
import { SchemaVersions } from './languageservice/yamlTypes';

export type ISchemaAssociations = Record<string, string[]>;

export interface JSONSchemaDescription {
  /**
   * Schema URI
   */
  uri: string;
  /**
   * Schema name, from schema store
   */
  name?: string;
  /**
   * Schema description, from schema store
   */
  description?: string;
}

export interface JSONSchemaDescriptionExt extends JSONSchemaDescription {
  /**
   * Is schema used for current document
   */
  usedForCurrentFile: boolean;
  /**
   * Is schema from schema store
   */
  fromStore: boolean;

  versions?: SchemaVersions;
}

export namespace SchemaAssociationNotification {
  export const type: NotificationType<ISchemaAssociations | SchemaConfiguration[]> = new NotificationType(
    'json/schemaAssociations'
  );
}

export namespace DynamicCustomSchemaRequestRegistration {
  export const type: NotificationType<unknown> = new NotificationType('yaml/registerCustomSchemaRequest');
}

export namespace VSCodeContentRequestRegistration {
  export const type: NotificationType<unknown> = new NotificationType('yaml/registerContentRequest');
}

export namespace ResultLimitReachedNotification {
  export const type: NotificationType<string> = new NotificationType('yaml/resultLimitReached');
}

export namespace VSCodeContentRequest {
  export const type: RequestType<string, string, unknown> = new RequestType('vscode/content');
}

export namespace CustomSchemaContentRequest {
  export const type: RequestType<string, string, unknown> = new RequestType('custom/schema/content');
}

export namespace CustomSchemaRequest {
  export const type: RequestType<unknown, unknown, unknown> = new RequestType('custom/schema/request');
}

export namespace ColorSymbolRequest {
  export const type: RequestType<unknown, unknown, unknown> = new RequestType('json/colorSymbols');
}

export namespace SchemaModificationNotification {
  export const type: RequestType<SchemaAdditions | SchemaDeletions, void, unknown> = new RequestType('json/schema/modify');
}

export namespace SchemaSelectionRequests {
  export const type: NotificationType<void> = new NotificationType('yaml/supportSchemaSelection');
  export const getSchema: RequestType<string, JSONSchemaDescription[], unknown> = new RequestType('yaml/get/jsonSchema');
  export const getAllSchemas: RequestType<string, JSONSchemaDescriptionExt[], unknown> = new RequestType(
    'yaml/get/all/jsonSchemas'
  );
  export const schemaStoreInitialized: NotificationType<unknown> = new NotificationType('yaml/schema/store/initialized');
}
