/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Json from 'jsonc-parser';
import { JSONSchema } from '../jsonSchema';
import * as objects from '../utils/objects';

import * as nls from 'vscode-nls';
import { LanguageSettings } from '../yamlLanguageService';
const localize = nls.loadMessageBundle();

export interface IRange {
	start: number;
	end: number;
}

export enum ErrorCode {
	Undefined = 0,
	EnumValueMismatch = 1,
	CommentsNotAllowed = 2
}

export enum ProblemSeverity {
	Error, Warning
}

export interface IProblem {
	location: IRange;
	severity: ProblemSeverity;
	code?: ErrorCode;
	message: string;
}

export class ASTNode {
	public start: number;
	public end: number;
	public type: string;
	public parent: ASTNode;
	public parserSettings: LanguageSettings;
	public location: Json.Segment;

	constructor(parent: ASTNode, type: string, location: Json.Segment, start: number, end?: number) {
		this.type = type;
		this.location = location;
		this.start = start;
		this.end = end;
		this.parent = parent;
		this.parserSettings = {
			isKubernetes: false
		};
	}

	public setParserSettings(parserSettings: LanguageSettings){
		this.parserSettings = parserSettings;
	}

	public getPath(): Json.JSONPath {
		let path = this.parent ? this.parent.getPath() : [];
		if (this.location !== null) {
			path.push(this.location);
		}
		return path;
	}


	public getChildNodes(): ASTNode[] {
		return [];
	}

	public getLastChild(): ASTNode {
		return null;
	}

	public getValue(): any {
		// override in children
		return;
	}

	public contains(offset: number, includeRightBound: boolean = false): boolean {
		return offset >= this.start && offset < this.end || includeRightBound && offset === this.end;
	}

	public toString(): string {
		return 'type: ' + this.type + ' (' + this.start + '/' + this.end + ')' + (this.parent ? ' parent: {' + this.parent.toString() + '}' : '');
	}

	public visit(visitor: (node: ASTNode) => boolean): boolean {
		return visitor(this);
	}

	public getNodeFromOffset(offset: number): ASTNode {
		let findNode = (node: ASTNode): ASTNode => {
			if (offset >= node.start && offset < node.end) {
				let children = node.getChildNodes();
				for (let i = 0; i < children.length && children[i].start <= offset; i++) {
					let item = findNode(children[i]);
					if (item) {
						return item;
					}
				}
				return node;
			}
			return null;
		};
		return findNode(this);
	}

	public getNodeCollectorCount(offset: number): Number {
		let collector = [];
		let findNode = (node: ASTNode): ASTNode => {
			let children = node.getChildNodes();
			for (let i = 0; i < children.length; i++) {
				let item = findNode(children[i]);
				if (item && item.type === "property") {
					collector.push(item);
				}
			}
			return node;
		};
		let foundNode = findNode(this);
		return collector.length;
	}

	public getNodeFromOffsetEndInclusive(offset: number): ASTNode {
		let collector = [];
		let findNode = (node: ASTNode): ASTNode => {
			if (offset >= node.start && offset <= node.end) {
				let children = node.getChildNodes();
				for (let i = 0; i < children.length && children[i].start <= offset; i++) {
					let item = findNode(children[i]);
					if (item) {
						collector.push(item);
					}
				}
				return node;
			}
			return null;
		};
		let foundNode = findNode(this);
		let currMinDist = Number.MAX_VALUE;
		let currMinNode = null;
		for(let possibleNode in collector){
			let currNode = collector[possibleNode];
			let minDist = (currNode.end - offset) + (offset - currNode.start);
			if(minDist < currMinDist){
				currMinNode = currNode;
				currMinDist = minDist;
			}
		}
		return currMinNode || foundNode;
	}

	public validate(schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {
		if (!matchingSchemas.include(this)) {
			return;
		}

		if (Array.isArray(schema.type)) {
			if ((<string[]>schema.type).indexOf(this.type) === -1) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: schema.errorMessage || localize('typeArrayMismatchWarning', 'Incorrect type. Expected one of {0}.', (<string[]>schema.type).join(', '))
				});
			}
		}
		else if (schema.type) {
			if (this.type !== schema.type) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: schema.errorMessage || localize('typeMismatchWarning', 'Incorrect type. Expected "{0}".', schema.type)
				});
			}
		}
		if (Array.isArray(schema.allOf)) {
			schema.allOf.forEach((subSchema) => {
				this.validate(subSchema, validationResult, matchingSchemas);
			});
		}
		if (schema.not) {
			let subValidationResult = new ValidationResult();
			let subMatchingSchemas = matchingSchemas.newSub();
			this.validate(schema.not, subValidationResult, subMatchingSchemas);
			if (!subValidationResult.hasProblems()) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: localize('notSchemaWarning', "Matches a schema that is not allowed.")
				});
			}
			subMatchingSchemas.schemas.forEach((ms) => {
				ms.inverted = !ms.inverted;
				matchingSchemas.add(ms);
			});
		}

		let testAlternatives = (alternatives: JSONSchema[], maxOneMatch: boolean) => {
			let matches = [];

			// remember the best match that is used for error messages
			let bestMatch: { schema: JSONSchema; validationResult: ValidationResult; matchingSchemas: ISchemaCollector; } = null;
			alternatives.forEach((subSchema) => {
				let subValidationResult = new ValidationResult();
				let subMatchingSchemas = matchingSchemas.newSub();

				this.validate(subSchema, subValidationResult, subMatchingSchemas);
				if (!subValidationResult.hasProblems()) {
					matches.push(subSchema);
				}
				if (!bestMatch) {
					bestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
				} else if(this.parserSettings.isKubernetes) {
					bestMatch = alternativeComparison(subValidationResult, bestMatch, subSchema, subMatchingSchemas);
				} else {
					bestMatch = genericComparison(maxOneMatch, subValidationResult, bestMatch, subSchema, subMatchingSchemas);
				}
			});

			if (matches.length > 1 && maxOneMatch && !this.parserSettings.isKubernetes) {
				validationResult.problems.push({
					location: { start: this.start, end: this.start + 1 },
					severity: ProblemSeverity.Warning,
					message: localize('oneOfWarning', "Matches multiple schemas when only one must validate.")
				});
			}
			if (bestMatch !== null) {
				validationResult.merge(bestMatch.validationResult);
				validationResult.propertiesMatches += bestMatch.validationResult.propertiesMatches;
				validationResult.propertiesValueMatches += bestMatch.validationResult.propertiesValueMatches;
				matchingSchemas.merge(bestMatch.matchingSchemas);
			}
			return matches.length;
		};
		if (Array.isArray(schema.anyOf)) {
			testAlternatives(schema.anyOf, false);
		}
		if (Array.isArray(schema.oneOf)) {
			testAlternatives(schema.oneOf, true);
		}

		if (Array.isArray(schema.enum)) {
			let val = this.getValue();
			let enumValueMatch = false;
			for (let e of schema.enum) {
				if (objects.equals(val, e)) {
					enumValueMatch = true;
					break;
				}
			}
			validationResult.enumValues = schema.enum;
			validationResult.enumValueMatch = enumValueMatch;
			if (!enumValueMatch) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					code: ErrorCode.EnumValueMismatch,
					message: schema.errorMessage || localize('enumWarning', 'Value is not accepted. Valid values: {0}.', schema.enum.map(v => JSON.stringify(v)).join(', '))
				});
			}
		}

		if (schema.deprecationMessage && this.parent) {
			validationResult.problems.push({
				location: { start: this.parent.start, end: this.parent.end },
				severity: ProblemSeverity.Warning,
				message: schema.deprecationMessage
			});
		}
		matchingSchemas.add({ node: this, schema: schema });
	}
}

export class NullASTNode extends ASTNode {

	constructor(parent: ASTNode, name: Json.Segment, start: number, end?: number) {
		super(parent, 'null', name, start, end);
	}

	public getValue(): any {
		return null;
	}
}

export class BooleanASTNode extends ASTNode {

	private value: boolean | string;

	constructor(parent: ASTNode, name: Json.Segment, value: boolean | string, start: number, end?: number) {
		super(parent, 'boolean', name, start, end);
		this.value = value;
	}

	public getValue(): any {
		return this.value;
	}

}

export class ArrayASTNode extends ASTNode {

	public items: ASTNode[];

	constructor(parent: ASTNode, name: Json.Segment, start: number, end?: number) {
		super(parent, 'array', name, start, end);
		this.items = [];
	}

	public getChildNodes(): ASTNode[] {
		return this.items;
	}

	public getLastChild(): ASTNode {
		return this.items[this.items.length - 1];
	}

	public getValue(): any {
		return this.items.map((v) => v.getValue());
	}

	public addItem(item: ASTNode): boolean {
		if (item) {
			this.items.push(item);
			return true;
		}
		return false;
	}

	public visit(visitor: (node: ASTNode) => boolean): boolean {
		let ctn = visitor(this);
		for (let i = 0; i < this.items.length && ctn; i++) {
			ctn = this.items[i].visit(visitor);
		}
		return ctn;
	}

	public validate(schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {
		if (!matchingSchemas.include(this)) {
			return;
		}
		super.validate(schema, validationResult, matchingSchemas);

		if (Array.isArray(schema.items)) {
			let subSchemas = <JSONSchema[]>schema.items;
			subSchemas.forEach((subSchema, index) => {
				let itemValidationResult = new ValidationResult();
				let item = this.items[index];
				if (item) {
					item.validate(subSchema, itemValidationResult, matchingSchemas);
					validationResult.mergePropertyMatch(itemValidationResult);
				} else if (this.items.length >= subSchemas.length) {
					validationResult.propertiesValueMatches++;
				}
			});
			if (this.items.length > subSchemas.length) {
				if (typeof schema.additionalItems === 'object') {
					for (let i = subSchemas.length; i < this.items.length; i++) {
						let itemValidationResult = new ValidationResult();
						this.items[i].validate(<any>schema.additionalItems, itemValidationResult, matchingSchemas);
						validationResult.mergePropertyMatch(itemValidationResult);
					}
				} else if (schema.additionalItems === false) {
					validationResult.problems.push({
						location: { start: this.start, end: this.end },
						severity: ProblemSeverity.Warning,
						message: localize('additionalItemsWarning', 'Array has too many items according to schema. Expected {0} or fewer.', subSchemas.length)
					});
				}
			}
		}
		else if (schema.items) {
			this.items.forEach((item) => {
				let itemValidationResult = new ValidationResult();
				item.validate(<JSONSchema>schema.items, itemValidationResult, matchingSchemas);
				validationResult.mergePropertyMatch(itemValidationResult);
			});
		}

		if (schema.minItems && this.items.length < schema.minItems) {
			validationResult.problems.push({
				location: { start: this.start, end: this.end },
				severity: ProblemSeverity.Warning,
				message: localize('minItemsWarning', 'Array has too few items. Expected {0} or more.', schema.minItems)
			});
		}

		if (schema.maxItems && this.items.length > schema.maxItems) {
			validationResult.problems.push({
				location: { start: this.start, end: this.end },
				severity: ProblemSeverity.Warning,
				message: localize('maxItemsWarning', 'Array has too many items. Expected {0} or fewer.', schema.minItems)
			});
		}

		if (schema.uniqueItems === true) {
			let values = this.items.map((node) => {
				return node.getValue();
			});
			let duplicates = values.some((value, index) => {
				return index !== values.lastIndexOf(value);
			});
			if (duplicates) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: localize('uniqueItemsWarning', 'Array has duplicate items.')
				});
			}
		}
	}
}

export class NumberASTNode extends ASTNode {

	public isInteger: boolean;
	public value: number;

	constructor(parent: ASTNode, name: Json.Segment, start: number, end?: number) {
		super(parent, 'number', name, start, end);
		this.isInteger = true;
		this.value = Number.NaN;
	}

	public getValue(): any {
		return this.value;
	}

	public validate(schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {
		if (!matchingSchemas.include(this)) {
			return;
		}

		// work around type validation in the base class
		let typeIsInteger = false;
		if (schema.type === 'integer' || (Array.isArray(schema.type) && (<string[]>schema.type).indexOf('integer') !== -1)) {
			typeIsInteger = true;
		}
		if (typeIsInteger && this.isInteger === true) {
			this.type = 'integer';
		}
		super.validate(schema, validationResult, matchingSchemas);
		this.type = 'number';

		let val = this.getValue();

		if (typeof schema.multipleOf === 'number') {
			if (val % schema.multipleOf !== 0) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: localize('multipleOfWarning', 'Value is not divisible by {0}.', schema.multipleOf)
				});
			}
		}

		if (typeof schema.minimum === 'number') {
			if (schema.exclusiveMinimum && val <= schema.minimum) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: localize('exclusiveMinimumWarning', 'Value is below the exclusive minimum of {0}.', schema.minimum)
				});
			}
			if (!schema.exclusiveMinimum && val < schema.minimum) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: localize('minimumWarning', 'Value is below the minimum of {0}.', schema.minimum)
				});
			}
		}

		if (typeof schema.maximum === 'number') {
			if (schema.exclusiveMaximum && val >= schema.maximum) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: localize('exclusiveMaximumWarning', 'Value is above the exclusive maximum of {0}.', schema.maximum)
				});
			}
			if (!schema.exclusiveMaximum && val > schema.maximum) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: localize('maximumWarning', 'Value is above the maximum of {0}.', schema.maximum)
				});
			}
		}

	}
}

export class StringASTNode extends ASTNode {
	public isKey: boolean;
	public value: string;

	constructor(parent: ASTNode, name: Json.Segment, isKey: boolean, start: number, end?: number) {
		super(parent, 'string', name, start, end);
		this.isKey = isKey;
		this.value = '';
	}

	public getValue(): any {
		return this.value;
	}

	public validate(schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {
		if (!matchingSchemas.include(this)) {
			return;
		}
		super.validate(schema, validationResult, matchingSchemas);

		if (schema.minLength && this.value.length < schema.minLength) {
			validationResult.problems.push({
				location: { start: this.start, end: this.end },
				severity: ProblemSeverity.Warning,
				message: localize('minLengthWarning', 'String is shorter than the minimum length of {0}.', schema.minLength)
			});
		}

		if (schema.maxLength && this.value.length > schema.maxLength) {
			validationResult.problems.push({
				location: { start: this.start, end: this.end },
				severity: ProblemSeverity.Warning,
				message: localize('maxLengthWarning', 'String is longer than the maximum length of {0}.', schema.maxLength)
			});
		}

		if (schema.pattern) {
			let regex = new RegExp(schema.pattern);
			if (!regex.test(this.value)) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: schema.patternErrorMessage || schema.errorMessage || localize('patternWarning', 'String does not match the pattern of "{0}".', schema.pattern)
				});
			}
		}

	}
}

export class PropertyASTNode extends ASTNode {
	public key: StringASTNode;
	public value: ASTNode;
	public colonOffset: number;

	constructor(parent: ASTNode, key: StringASTNode) {
		super(parent, 'property', null, key.start);
		this.key = key;
		key.parent = this;
		key.location = key.value;
		this.colonOffset = -1;
	}

	public getChildNodes(): ASTNode[] {
		return this.value ? [this.key, this.value] : [this.key];
	}

	public getLastChild(): ASTNode {
		return this.value;
	}

	public setValue(value: ASTNode): boolean {
		this.value = value;
		return value !== null;
	}

	public visit(visitor: (node: ASTNode) => boolean): boolean {
		return visitor(this) && this.key.visit(visitor) && this.value && this.value.visit(visitor);
	}

	public validate(schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {
		if (!matchingSchemas.include(this)) {
			return;
		}
		if (this.value) {
			this.value.validate(schema, validationResult, matchingSchemas);
		}
	}
}

export class ObjectASTNode extends ASTNode {
	public properties: PropertyASTNode[];

	constructor(parent: ASTNode, name: Json.Segment, start: number, end?: number) {
		super(parent, 'object', name, start, end);

		this.properties = [];
	}

	public getChildNodes(): ASTNode[] {
		return this.properties;
	}

	public getLastChild(): ASTNode {
		return this.properties[this.properties.length - 1];
	}

	public addProperty(node: PropertyASTNode): boolean {
		if (!node) {
			return false;
		}
		this.properties.push(node);
		return true;
	}

	public getFirstProperty(key: string): PropertyASTNode {
		for (let i = 0; i < this.properties.length; i++) {
			if (this.properties[i].key.value === key) {
				return this.properties[i];
			}
		}
		return null;
	}

	public getKeyList(): string[] {
		return this.properties.map((p) => p.key.getValue());
	}

	public getValue(): any {
		let value: any = Object.create(null);
		this.properties.forEach((p) => {
			let v = p.value && p.value.getValue();
			if (typeof v !== 'undefined') {
				value[p.key.getValue()] = v;
			}
		});
		return value;
	}

	public visit(visitor: (node: ASTNode) => boolean): boolean {
		let ctn = visitor(this);
		for (let i = 0; i < this.properties.length && ctn; i++) {
			ctn = this.properties[i].visit(visitor);
		}
		return ctn;
	}

	public validate(schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {
		if (!matchingSchemas.include(this)) {
			return;
		}

		super.validate(schema, validationResult, matchingSchemas);
		let seenKeys: { [key: string]: ASTNode } = Object.create(null);
		let unprocessedProperties: string[] = [];
		this.properties.forEach((node) => {

			let key = node.key.value;

			//Replace the merge key with the actual values of what the node value points to in seen keys
			if(key === "<<" && node.value) {

				switch(node.value.type) {
					case "object": {
						node.value["properties"].forEach(propASTNode => {
							let propKey = propASTNode.key.value;
							seenKeys[propKey] = propASTNode.value;
							unprocessedProperties.push(propKey);
						});
						break;
					}
					case "array": {
						node.value["items"].forEach(sequenceNode => {
							sequenceNode["properties"].forEach(propASTNode => {
								let seqKey = propASTNode.key.value;
								seenKeys[seqKey] = propASTNode.value;
								unprocessedProperties.push(seqKey);
							});
						});
						break;
					}
					default: {
						break;
					}
				}
			}else{
				seenKeys[key] = node.value;
				unprocessedProperties.push(key);
			}

		});

		if (Array.isArray(schema.required)) {
			schema.required.forEach((propertyName: string) => {
				if (!seenKeys[propertyName]) {
					let key = this.parent && this.parent && (<PropertyASTNode>this.parent).key;
					let location = key ? { start: key.start, end: key.end } : { start: this.start, end: this.start + 1 };
					validationResult.problems.push({
						location: location,
						severity: ProblemSeverity.Warning,
						message: localize('MissingRequiredPropWarning', 'Missing property "{0}".', propertyName)
					});
				}
			});
		}

		let propertyProcessed = (prop: string) => {
			let index = unprocessedProperties.indexOf(prop);
			while (index >= 0) {
				unprocessedProperties.splice(index, 1);
				index = unprocessedProperties.indexOf(prop);
			}
		};

		if (schema.properties) {
			Object.keys(schema.properties).forEach((propertyName: string) => {
				propertyProcessed(propertyName);
				let prop = schema.properties[propertyName];
				let child = seenKeys[propertyName];
				if (child) {
					let propertyValidationResult = new ValidationResult();
					child.validate(prop, propertyValidationResult, matchingSchemas);
					validationResult.mergePropertyMatch(propertyValidationResult);
				}

			});
		}

		if (schema.patternProperties) {
			Object.keys(schema.patternProperties).forEach((propertyPattern: string) => {
				let regex = new RegExp(propertyPattern);
				unprocessedProperties.slice(0).forEach((propertyName: string) => {
					if (regex.test(propertyName)) {
						propertyProcessed(propertyName);
						let child = seenKeys[propertyName];
						if (child) {
							let propertyValidationResult = new ValidationResult();
							child.validate(schema.patternProperties[propertyPattern], propertyValidationResult, matchingSchemas);
							validationResult.mergePropertyMatch(propertyValidationResult);
						}

					}
				});
			});
		}

		if (typeof schema.additionalProperties === 'object') {
			unprocessedProperties.forEach((propertyName: string) => {
				let child = seenKeys[propertyName];
				if (child) {
					let propertyValidationResult = new ValidationResult();
					child.validate(<any>schema.additionalProperties, propertyValidationResult, matchingSchemas);
					validationResult.mergePropertyMatch(propertyValidationResult);
				}
			});
		} else if (schema.additionalProperties === false) {
			if (unprocessedProperties.length > 0) {
				unprocessedProperties.forEach((propertyName: string) => {
					let child = seenKeys[propertyName];
					if (child) {
						let propertyNode = null;
						if(child.type !== "property"){
							propertyNode = <PropertyASTNode>child.parent;
							if(propertyNode.type === "object"){
								propertyNode = propertyNode.properties[0];
							}
						}else{
							propertyNode = child;
						}
						validationResult.problems.push({
							location: { start: propertyNode.key.start, end: propertyNode.key.end },
							severity: ProblemSeverity.Warning,
							message: schema.errorMessage || localize('DisallowedExtraPropWarning', 'Unexpected property {0}', propertyName)
						});
					}
				});
			}
		}

		if (schema.maxProperties) {
			if (this.properties.length > schema.maxProperties) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: localize('MaxPropWarning', 'Object has more properties than limit of {0}.', schema.maxProperties)
				});
			}
		}

		if (schema.minProperties) {
			if (this.properties.length < schema.minProperties) {
				validationResult.problems.push({
					location: { start: this.start, end: this.end },
					severity: ProblemSeverity.Warning,
					message: localize('MinPropWarning', 'Object has fewer properties than the required number of {0}', schema.minProperties)
				});
			}
		}

		if (schema.dependencies) {
			Object.keys(schema.dependencies).forEach((key: string) => {
				let prop = seenKeys[key];
				if (prop) {
					let propertyDep = schema.dependencies[key]
					if (Array.isArray(propertyDep)) {
						propertyDep.forEach((requiredProp: string) => {
							if (!seenKeys[requiredProp]) {
								validationResult.problems.push({
									location: { start: this.start, end: this.end },
									severity: ProblemSeverity.Warning,
									message: localize('RequiredDependentPropWarning', 'Object is missing property {0} required by property {1}.', requiredProp, key)
								});
							} else {
								validationResult.propertiesValueMatches++;
							}
						});
					} else if (propertyDep) {
						let propertyvalidationResult = new ValidationResult();
						this.validate(propertyDep, propertyvalidationResult, matchingSchemas);
						validationResult.mergePropertyMatch(propertyvalidationResult);
					}
				}
			});
		}
	}
}

export interface IApplicableSchema {
	node: ASTNode;
	inverted?: boolean;
	schema: JSONSchema;
}

export enum EnumMatch {
	Key, Enum
}

export interface ISchemaCollector {
	schemas: IApplicableSchema[];
	add(schema: IApplicableSchema): void;
	merge(other: ISchemaCollector): void;
	include(node: ASTNode): boolean;
	newSub(): ISchemaCollector;
}

class SchemaCollector implements ISchemaCollector {
	schemas: IApplicableSchema[] = [];
	constructor(private focusOffset = -1, private exclude: ASTNode = null) {
	}
	add(schema: IApplicableSchema) {
		this.schemas.push(schema);
	}
	merge(other: ISchemaCollector) {
		this.schemas.push(...other.schemas);
	}
	include(node: ASTNode) {
		return (this.focusOffset === -1 || node.contains(this.focusOffset)) && (node !== this.exclude);
	}
	newSub(): ISchemaCollector {
		return new SchemaCollector(-1, this.exclude);
	}
}

class NoOpSchemaCollector implements ISchemaCollector {
	get schemas() { return []; }
	add(schema: IApplicableSchema) { }
	merge(other: ISchemaCollector) { }
	include(node: ASTNode) { return true; }
	newSub(): ISchemaCollector { return this; }
}

export class ValidationResult {
	public problems: IProblem[];

	public propertiesMatches: number;
	public propertiesValueMatches: number;
	public primaryValueMatches: number;
	public enumValueMatch: boolean;
	public enumValues: any[];
	public warnings;
	public errors;

	constructor() {
		this.problems = [];
		this.propertiesMatches = 0;
		this.propertiesValueMatches = 0;
		this.primaryValueMatches = 0;
		this.enumValueMatch = false;
		this.enumValues = null;
		this.warnings = [];
		this.errors = [];
	}

	public hasProblems(): boolean {
		return !!this.problems.length;
	}

	public mergeAll(validationResults: ValidationResult[]): void {
		validationResults.forEach((validationResult) => {
			this.merge(validationResult);
		});
	}

	public merge(validationResult: ValidationResult): void {
		this.problems = this.problems.concat(validationResult.problems);
	}

	public mergeEnumValues(validationResult: ValidationResult): void {
		if (!this.enumValueMatch && !validationResult.enumValueMatch && this.enumValues && validationResult.enumValues) {
			this.enumValues = this.enumValues.concat(validationResult.enumValues);
			for (let error of this.problems) {
				if (error.code === ErrorCode.EnumValueMismatch) {
					error.message = localize('enumWarning', 'Value is not accepted. Valid values: {0}.', this.enumValues.map(v => JSON.stringify(v)).join(', '));
				}
			}
		}
	}

	public mergePropertyMatch(propertyValidationResult: ValidationResult): void {
		this.merge(propertyValidationResult);
		this.propertiesMatches++;
		if (propertyValidationResult.enumValueMatch || !this.hasProblems() && propertyValidationResult.propertiesMatches) {
			this.propertiesValueMatches++;
		}
		if (propertyValidationResult.enumValueMatch && propertyValidationResult.enumValues && propertyValidationResult.enumValues.length === 1) {
			this.primaryValueMatches++;
		}
	}

	public compareGeneric(other: ValidationResult): number {
		let hasProblems = this.hasProblems();
		if (hasProblems !== other.hasProblems()) {
			return hasProblems ? -1 : 1;
		}
		if (this.enumValueMatch !== other.enumValueMatch) {
			return other.enumValueMatch ? -1 : 1;
		}
		if (this.propertiesValueMatches !== other.propertiesValueMatches) {
			return this.propertiesValueMatches - other.propertiesValueMatches;
		}
		if (this.primaryValueMatches !== other.primaryValueMatches) {
			return this.primaryValueMatches - other.primaryValueMatches;
		}
		return this.propertiesMatches - other.propertiesMatches;
	}

	public compareKubernetes(other: ValidationResult): number {
		let hasProblems = this.hasProblems();
		if(this.propertiesMatches !== other.propertiesMatches){
			return this.propertiesMatches - other.propertiesMatches;
		}
		if (this.enumValueMatch !== other.enumValueMatch) {
			return other.enumValueMatch ? -1 : 1;
		}
		if (this.primaryValueMatches !== other.primaryValueMatches) {
			return this.primaryValueMatches - other.primaryValueMatches;
		}
		if (this.propertiesValueMatches !== other.propertiesValueMatches) {
			return this.propertiesValueMatches - other.propertiesValueMatches;
		}
		if (hasProblems !== other.hasProblems()) {
			return hasProblems ? -1 : 1;
		}
		return this.propertiesMatches - other.propertiesMatches;
	}

}

export class JSONDocument {

	constructor(public readonly root: ASTNode, public readonly syntaxErrors: IProblem[]) {
	}

	public getNodeFromOffset(offset: number): ASTNode {
		return this.root && this.root.getNodeFromOffset(offset);
	}

	public getNodeFromOffsetEndInclusive(offset: number): ASTNode {
		return this.root && this.root.getNodeFromOffsetEndInclusive(offset);
	}

	public visit(visitor: (node: ASTNode) => boolean): void {
		if (this.root) {
			this.root.visit(visitor);
		}
	}

	public configureSettings(parserSettings: LanguageSettings){
		if(this.root) {
			this.root.setParserSettings(parserSettings);
		}
	}

	public validate(schema: JSONSchema): IProblem[] {
		if (this.root && schema) {
			let validationResult = new ValidationResult();
			this.root.validate(schema, validationResult, new NoOpSchemaCollector());
			return validationResult.problems;
		}
		return null;
	}

	public getMatchingSchemas(schema: JSONSchema, focusOffset: number = -1, exclude: ASTNode = null): IApplicableSchema[] {
		let matchingSchemas = new SchemaCollector(focusOffset, exclude);
		let validationResult = new ValidationResult();
		if (this.root && schema) {
			this.root.validate(schema, validationResult, matchingSchemas);
		}
		return matchingSchemas.schemas;
	}

	public getValidationProblems(schema: JSONSchema, focusOffset: number = -1, exclude: ASTNode = null) {
		let matchingSchemas = new SchemaCollector(focusOffset, exclude);
		let validationResult = new ValidationResult();
		if (this.root && schema) {
			this.root.validate(schema, validationResult, matchingSchemas);
		}
		return validationResult.problems;
	}
}

//Alternative comparison is specifically used by the kubernetes/openshift schema but may lead to better results then genericComparison depending on the schema
function alternativeComparison(subValidationResult, bestMatch, subSchema, subMatchingSchemas){
	let compareResult = subValidationResult.compareKubernetes(bestMatch.validationResult);
	if (compareResult > 0) {
		// our node is the best matching so far
		bestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
	} else if (compareResult === 0) {
		// there's already a best matching but we are as good
		bestMatch.matchingSchemas.merge(subMatchingSchemas);
		bestMatch.validationResult.mergeEnumValues(subValidationResult);
	}
	return bestMatch;
}

//genericComparison tries to find the best matching schema using a generic comparison
function genericComparison(maxOneMatch, subValidationResult, bestMatch, subSchema, subMatchingSchemas){
	if (!maxOneMatch && !subValidationResult.hasProblems() && !bestMatch.validationResult.hasProblems()) {
		// no errors, both are equally good matches
		bestMatch.matchingSchemas.merge(subMatchingSchemas);
		bestMatch.validationResult.propertiesMatches += subValidationResult.propertiesMatches;
		bestMatch.validationResult.propertiesValueMatches += subValidationResult.propertiesValueMatches;
	} else {
		let compareResult = subValidationResult.compareGeneric(bestMatch.validationResult);
		if (compareResult > 0) {
			// our node is the best matching so far
			bestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
		} else if (compareResult === 0) {
			// there's already a best matching but we are as good
			bestMatch.matchingSchemas.merge(subMatchingSchemas);
			bestMatch.validationResult.mergeEnumValues(subValidationResult);
		}
	}
	return bestMatch;
}