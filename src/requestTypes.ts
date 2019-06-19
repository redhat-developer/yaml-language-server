import { NotificationType, RequestType } from 'vscode-languageserver';

export namespace SchemaAssociationNotification {
    export const type: NotificationType<{ }, { }> = new NotificationType('json/schemaAssociations');
}

export namespace DynamicCustomSchemaRequestRegistration {
    export const type: NotificationType<{ }, { }> = new NotificationType('yaml/registerCustomSchemaRequest');
}

export namespace VSCodeContentRequest {
    export const type: RequestType<{ }, { }, { }, { }> = new RequestType('vscode/content');
}

export namespace CustomSchemaContentRequest {
    export const type: RequestType<{ }, { }, { }, { }> = new RequestType('custom/schema/content');
}

export namespace CustomSchemaRequest {
    export const type: RequestType<{ }, { }, { }, { }> = new RequestType('custom/schema/request');
}

export namespace ColorSymbolRequest {
    export const type: RequestType<{ }, { }, { }, { }> = new RequestType('json/colorSymbols');
}
