/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionItemKind } from 'vscode-json-languageservice';
import { SchemaVersions } from './yamlTypes';

export type JSONSchemaRef = JSONSchema | boolean;
export enum SchemaDialect {
  draft04 = 'draft04',
  draft07 = 'draft07',
  draft2019 = 'draft2019-09',
  draft2020 = 'draft2020-12',
}

export interface JSONSchema {
  // for internal use
  _dialect?: SchemaDialect;
  _baseUrl?: string;
  _$ref?: string;

  id?: string;
  $id?: string;
  $schema?: string;
  url?: string;
  type?: string | string[];
  title?: string;
  closestTitle?: string;
  versions?: SchemaVersions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default?: any;
  definitions?: { [name: string]: JSONSchema };
  description?: string;
  properties?: JSONSchemaMap;
  patternProperties?: JSONSchemaMap;
  additionalProperties?: JSONSchemaRef;
  minProperties?: number;
  maxProperties?: number;
  dependencies?: JSONSchemaMap | { [prop: string]: string[] };
  items?: JSONSchemaRef | JSONSchemaRef[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  additionalItems?: JSONSchemaRef;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean | number;
  exclusiveMaximum?: boolean | number;
  multipleOf?: number;
  required?: string[];
  $ref?: string;
  anyOf?: JSONSchemaRef[];
  allOf?: JSONSchemaRef[];
  oneOf?: JSONSchemaRef[];
  not?: JSONSchemaRef;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enum?: any[];
  format?: string;

  // schema draft 06
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const?: any;
  contains?: JSONSchemaRef;
  propertyNames?: JSONSchemaRef;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  examples?: any[];

  // schema draft 07
  $comment?: string;
  if?: JSONSchemaRef;
  then?: JSONSchemaRef;
  else?: JSONSchemaRef;

  // schema draft 2019-09
  $anchor?: string;
  $defs?: { [name: string]: JSONSchema };
  $recursiveAnchor?: boolean;
  $recursiveRef?: string;
  $vocabulary?: Record<string, boolean>;
  dependentSchemas?: JSONSchemaMap;
  unevaluatedItems?: JSONSchemaRef;
  unevaluatedProperties?: JSONSchemaRef;
  dependentRequired?: Record<string, string[]>;
  minContains?: number;
  maxContains?: number;

  // schema draft 2020-12
  prefixItems?: JSONSchemaRef[];
  $dynamicRef?: string;
  $dynamicAnchor?: string;

  // VSCode extensions
  defaultSnippets?: {
    label?: string;
    description?: string;
    markdownDescription?: string;
    type?: string;
    suggestionKind?: CompletionItemKind;
    sortText?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body?: any;
    bodyText?: string;
  }[]; // VSCode extension: body: a object that will be converted to a JSON string. bodyText: text with \t and \n

  errorMessage?: string; // VSCode extension
  patternErrorMessage?: string; // VSCode extension
  deprecationMessage?: string; // VSCode extension
  enumDescriptions?: string[]; // VSCode extension
  markdownEnumDescriptions?: string[]; // VSCode extension
  markdownDescription?: string; // VSCode extension
  doNotSuggest?: boolean; // VSCode extension
  allowComments?: boolean; // VSCode extension

  schemaSequence?: JSONSchema[]; // extension for multiple schemas related to multiple documents in single yaml file

  filePatternAssociation?: string; // extension for if condition to be able compare doc yaml uri with this file pattern association
}

export interface JSONSchemaMap {
  [name: string]: JSONSchemaRef;
}
