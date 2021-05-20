/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-namespace */
import { NotificationType, RequestType } from 'vscode-languageserver';
import { SchemaAdditions, SchemaDeletions } from './languageservice/services/yamlSchemaService';
import { SchemaConfiguration } from './languageservice/yamlLanguageService';

export type ISchemaAssociations = Record<string, string[]>;

export namespace SchemaAssociationNotification {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const type: NotificationType<ISchemaAssociations | SchemaConfiguration[]> = new NotificationType(
    'json/schemaAssociations'
  );
}

export namespace DynamicCustomSchemaRequestRegistration {
  export const type: NotificationType<{}> = new NotificationType('yaml/registerCustomSchemaRequest');
}

export namespace VSCodeContentRequestRegistration {
  export const type: NotificationType<{}> = new NotificationType('yaml/registerContentRequest');
}

export namespace ResultLimitReachedNotification {
  export const type: NotificationType<string> = new NotificationType('yaml/resultLimitReached');
}

export namespace VSCodeContentRequest {
  export const type: RequestType<{}, {}, {}> = new RequestType('vscode/content');
}

export namespace CustomSchemaContentRequest {
  export const type: RequestType<{}, {}, {}> = new RequestType('custom/schema/content');
}

export namespace CustomSchemaRequest {
  export const type: RequestType<{}, {}, {}> = new RequestType('custom/schema/request');
}

export namespace ColorSymbolRequest {
  export const type: RequestType<{}, {}, {}> = new RequestType('json/colorSymbols');
}

export namespace SchemaModificationNotification {
  export const type: RequestType<SchemaAdditions | SchemaDeletions, void, {}> = new RequestType('json/schema/modify');
}
