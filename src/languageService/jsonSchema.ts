/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

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
	anyOfMatching?: JSONSchema[]; //This is a custom property that forces all nodes to be inside the properties/items/additionalProperties fields
	allOf?: JSONSchema[];
	oneOf?: JSONSchema[];
	not?: JSONSchema;
	enum?: any[];
	format?: string;
	errorMessage?: string; // VSCode extension
	patternErrorMessage?: string; // VSCode extension
	deprecationMessage?: string; // VSCode extension
	enumDescriptions?: string[]; // VSCode extension
}

export interface JSONSchemaMap {
	[name: string]:JSONSchema;
}
