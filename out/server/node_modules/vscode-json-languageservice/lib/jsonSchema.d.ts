export interface JSONSchema {
    id?: string;
    $schema?: string;
    type?: string | string[];
    title?: string;
    default?: any;
    definitions?: JSONSchemaMap;
    description?: string;
    properties?: JSONSchemaMap;
    patternProperties?: JSONSchemaMap;
    additionalProperties?: boolean | JSONSchema;
    minProperties?: number;
    maxProperties?: number;
    dependencies?: JSONSchemaMap | string[];
    items?: JSONSchema | JSONSchema[];
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    additionalItems?: boolean;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: boolean;
    exclusiveMaximum?: boolean;
    multipleOf?: number;
    required?: string[];
    $ref?: string;
    anyOf?: JSONSchema[];
    allOf?: JSONSchema[];
    oneOf?: JSONSchema[];
    not?: JSONSchema;
    enum?: any[];
    format?: string;
    defaultSnippets?: {
        label?: string;
        description?: string;
        body?: any;
        bodyText?: string;
    }[];
    errorMessage?: string;
    patternErrorMessage?: string;
    deprecationMessage?: string;
    enumDescriptions?: string[];
}
export interface JSONSchemaMap {
    [name: string]: JSONSchema;
}
