/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Json = require('jsonc-parser');
import { JSONSchema } from '../jsonSchema';
import * as objects from '../utils/objects';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export interface IRange {
	start: number;
	end: number;
}

export enum ErrorCode {
	Undefined = 0,
	EnumValueMismatch = 1,
	CommentsNotAllowed = 2,
	UnexpectedEndOfComment = 0x101,
	UnexpectedEndOfString = 0x102,
	UnexpectedEndOfNumber = 0x103,
	InvalidUnicode = 0x104,
	InvalidEscapeCharacter = 0x105,
	InvalidCharacter = 0x106,
	PropertyExpected = 0x201,
	CommaExpected = 0x202,
	ColonExpected = 0x203,
	ValueExpected = 0x204,
	CommaOrCloseBacketExpected = 0x205,
	CommaOrCloseBraceExpected = 0x206
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

	public location: Json.Segment;

	constructor(parent: ASTNode, type: string, location: Json.Segment, start: number, end?: number) {
		this.type = type;
		this.location = location;
		this.start = start;
		this.end = end;
		this.parent = parent;
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

	public isBoolean(value): boolean {
		let availableBooleans = ['y', 'Y', 'yes', 'Yes', 'YES', 'n', 'N', 'no', 'No', 'NO', 'true', 'True', 'TRUE', 'false', 'False', 'FALSE', 'on', 'On', 'ON', 'off', 'Off', 'OFF'];
		return availableBooleans.indexOf(value) !== -1;
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

			let isValid = true;
			switch(schema.type){
				case "boolean":
					let val = this.getValue() !== null ? this.getValue().toString() : this.getValue(); 
					isValid = this.isBoolean(val);
					break;
				default:
					isValid = this.type === schema.type;
					break;
			}

			if (!isValid) {
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
			let allMatches = [];
			let fallBackMatches = [];
			// remember the best match that is used for error messages
			let bestMatch: { schema: JSONSchema; validationResult: ValidationResult; matchingSchemas: ISchemaCollector; } = null;
			let fallbackBestMatch: { schema: JSONSchema; validationResult: ValidationResult; matchingSchemas: ISchemaCollector; } = null;
			alternatives.forEach((subSchema) => {
				let subValidationResult = new ValidationResult();
				let subMatchingSchemas = matchingSchemas.newSub();
				this.validate(subSchema, subValidationResult, subMatchingSchemas);

				let holderFound = false;
				function isHolderFound(node){
					if(!node || Object.keys(node).length === 0){
						return;
					}

					Object.keys(node).forEach(key => {
						let n: any = node[key];
						if(key === "holder" && n === null){
							holderFound = true;
						}else if(typeof n === "object"){
							isHolderFound(n);
						}
					});

				}

				isHolderFound(this.getValue());
				
				let numberOfSubSchemas = subMatchingSchemas.schemas.length - 1;
				
				//Case in which everything is valid
				let firstArg = numberOfSubSchemas === this.getNodeCollectorCount(this.end); 
				
				//If holder is found then we can increase number of subschemas
				let	secondArg = holderFound && numberOfSubSchemas+1 === this.getNodeCollectorCount(this.end);

				//Live type isn't working for kubernetes schema
				if(firstArg || secondArg){
					allMatches.push(subSchema);	
					if (!subValidationResult.hasProblems()) {
						matches.push(subSchema);
					}
					if (!bestMatch) {
						bestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
					} else {
						if (!maxOneMatch && !subValidationResult.hasProblems() && !bestMatch.validationResult.hasProblems()) {
							// no errors, both are equally good matches
							bestMatch.matchingSchemas.merge(subMatchingSchemas);
							bestMatch.validationResult.propertiesMatches += subValidationResult.propertiesMatches;
							bestMatch.validationResult.propertiesValueMatches += subValidationResult.propertiesValueMatches;
						} else {
							let compareResult = subValidationResult.compare(bestMatch.validationResult);
							if (compareResult > 0) {
								// our node is the best matching so far
								bestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
							} else if (compareResult === 0) {
								// there's already a best matching but we are as good
								bestMatch.matchingSchemas.merge(subMatchingSchemas);
								bestMatch.validationResult.mergeEnumValues(subValidationResult);
							}
						}
					}
				}

				if(!(firstArg || secondArg)){
					if (!subValidationResult.hasProblems()) {
						fallBackMatches.push(subSchema);
					}
					if (!fallbackBestMatch) {
						fallbackBestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
					} else {
						if (!maxOneMatch && !subValidationResult.hasProblems() && !fallbackBestMatch.validationResult.hasProblems()) {
							// no errors, both are equally good matches
							fallbackBestMatch.matchingSchemas.merge(subMatchingSchemas);
							fallbackBestMatch.validationResult.propertiesMatches += subValidationResult.propertiesMatches;
							fallbackBestMatch.validationResult.propertiesValueMatches += subValidationResult.propertiesValueMatches;
						} else {
							let compareResult = subValidationResult.compare(fallbackBestMatch.validationResult);
							if (compareResult > 0) {
								// our node is the best matching so far
								fallbackBestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
							} else if (compareResult === 0) {
								// there's already a best matching but we are as good
								fallbackBestMatch.matchingSchemas.merge(subMatchingSchemas);
								fallbackBestMatch.validationResult.mergeEnumValues(subValidationResult);
							}
						}
					}
				}
			});

			if (matches.length > 1 && maxOneMatch) {
				validationResult.problems.push({
					location: { start: this.start, end: this.start + 1 },
					severity: ProblemSeverity.Warning,
					message: localize('oneOfWarning', "Matches multiple schemas when only one must validate.")
				});
			}
			if(matches.length === 0){
				matches = allMatches;
			}
			if(matches.length === 0 && allMatches.length === 0){
				matches = fallBackMatches;
				bestMatch = fallbackBestMatch
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

	private value: boolean;

	constructor(parent: ASTNode, name: Json.Segment, value: boolean, start: number, end?: number) {
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
			seenKeys[key] = node.value;
			unprocessedProperties.push(key);
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
							message: schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName)
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

export interface JSONDocumentConfig {
	disallowComments?: boolean;
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
	include(node: ASTNode): void;
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

	public compare(other: ValidationResult): number {
		let hasProblems = this.hasProblems();
		if (hasProblems !== other.hasProblems()) {
			return hasProblems ? -1 : 1;
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

export function parse(text: string, config?: JSONDocumentConfig): JSONDocument {

	let problems: IProblem[] = [];
	let scanner = Json.createScanner(text, false);

	let disallowComments = config && config.disallowComments;

	function _scanNext(): Json.SyntaxKind {
		while (true) {
			let token = scanner.scan();
			switch (token) {
				case Json.SyntaxKind.LineCommentTrivia:
				case Json.SyntaxKind.BlockCommentTrivia:
					if (disallowComments) {
						_error(localize('InvalidCommentTokem', 'Comments are not allowed.'), ErrorCode.CommentsNotAllowed);
					}
					break;
				case Json.SyntaxKind.Trivia:
				case Json.SyntaxKind.LineBreakTrivia:
					break;
				default:
					return token;
			}
		}
	}

	function _accept(token: Json.SyntaxKind): boolean {
		if (scanner.getToken() === token) {
			_scanNext();
			return true;
		}
		return false;
	}

	function _error<T extends ASTNode>(message: string, code: ErrorCode, node: T = null, skipUntilAfter: Json.SyntaxKind[] = [], skipUntil: Json.SyntaxKind[] = []): T {
		if (problems.length === 0 || problems[0].location.start !== scanner.getTokenOffset()) {
			// ignore multiple errors on the same offset
			let start = scanner.getTokenOffset();
			let end = scanner.getTokenOffset() + scanner.getTokenLength();
			if (start === end && start > 0) {
				start--;
				while (start > 0 && /\s/.test(text.charAt(start))) {
					start--;
				}
				end = start + 1;
			}
			problems.push({ message, location: { start, end }, code, severity: ProblemSeverity.Error });
		}

		if (node) {
			_finalize(node, false);
		}
		if (skipUntilAfter.length + skipUntil.length > 0) {
			let token = scanner.getToken();
			while (token !== Json.SyntaxKind.EOF) {
				if (skipUntilAfter.indexOf(token) !== -1) {
					_scanNext();
					break;
				} else if (skipUntil.indexOf(token) !== -1) {
					break;
				}
				token = _scanNext();
			}
		}
		return node;
	}

	function _checkScanError(): boolean {
		switch (scanner.getTokenError()) {
			case Json.ScanError.InvalidUnicode:
				_error(localize('InvalidUnicode', 'Invalid unicode sequence in string.'), ErrorCode.InvalidUnicode);
				return true;
			case Json.ScanError.InvalidEscapeCharacter:
				_error(localize('InvalidEscapeCharacter', 'Invalid escape character in string.'), ErrorCode.InvalidEscapeCharacter);
				return true;
			case Json.ScanError.UnexpectedEndOfNumber:
				_error(localize('UnexpectedEndOfNumber', 'Unexpected end of number.'), ErrorCode.UnexpectedEndOfNumber);
				return true;
			case Json.ScanError.UnexpectedEndOfComment:
				_error(localize('UnexpectedEndOfComment', 'Unexpected end of comment.'), ErrorCode.UnexpectedEndOfComment);
				return true;
			case Json.ScanError.UnexpectedEndOfString:
				_error(localize('UnexpectedEndOfString', 'Unexpected end of string.'), ErrorCode.UnexpectedEndOfString);
				return true;
			case Json.ScanError.InvalidCharacter:
				_error(localize('InvalidCharacter', 'Invalid characters in string. Control characters must be escaped.'), ErrorCode.InvalidCharacter);
				return true;
		}
		return false;
	}

	function _finalize<T extends ASTNode>(node: T, scanNext: boolean): T {
		node.end = scanner.getTokenOffset() + scanner.getTokenLength();

		if (scanNext) {
			_scanNext();
		}

		return node;
	}

	function _parseArray(parent: ASTNode, name: Json.Segment): ArrayASTNode {
		if (scanner.getToken() !== Json.SyntaxKind.OpenBracketToken) {
			return null;
		}
		let node = new ArrayASTNode(parent, name, scanner.getTokenOffset());
		_scanNext(); // consume OpenBracketToken

		let count = 0;
		if (node.addItem(_parseValue(node, count++))) {
			while (_accept(Json.SyntaxKind.CommaToken)) {
				if (!node.addItem(_parseValue(node, count++))) {
					_error(localize('ValueExpected', 'Value expected'), ErrorCode.ValueExpected);
					// report error, but continue
				}
			}
		}

		if (scanner.getToken() !== Json.SyntaxKind.CloseBracketToken) {
			return _error(localize('ExpectedCloseBracket', 'Expected comma or closing bracket'), ErrorCode.CommaOrCloseBacketExpected, node);
		}

		return _finalize(node, true);
	}

	function _parseProperty(parent: ObjectASTNode, keysSeen: any): PropertyASTNode {

		let key = _parseString(null, null, true);
		if (!key) {
			if (scanner.getToken() === Json.SyntaxKind.Unknown) {
				// give a more helpful error message
				let value = scanner.getTokenValue();
				if (value.match(/^['\w]/)) {
					_error(localize('DoubleQuotesExpected', 'Property keys must be doublequoted'), ErrorCode.Undefined);
				}
			}
			return null;
		}
		let node = new PropertyASTNode(parent, key);

		if (keysSeen[key.value]) {
			problems.push({ location: { start: node.key.start, end: node.key.end }, message: localize('DuplicateKeyWarning', "Duplicate object key"), code: ErrorCode.Undefined, severity: ProblemSeverity.Warning });
		}
		keysSeen[key.value] = true;

		if (scanner.getToken() === Json.SyntaxKind.ColonToken) {
			node.colonOffset = scanner.getTokenOffset();
			_scanNext(); // consume ColonToken
		} else {
			_error(localize('ColonExpected', 'Colon expected'), ErrorCode.ColonExpected);
		}



		if (!node.setValue(_parseValue(node, key.value))) {
			return _error(localize('ValueExpected', 'Value expected'), ErrorCode.ValueExpected, node, [], [Json.SyntaxKind.CloseBraceToken, Json.SyntaxKind.CommaToken]);
		}
		node.end = node.value.end;
		return node;
	}

	function _parseObject(parent: ASTNode, name: Json.Segment): ObjectASTNode {
		if (scanner.getToken() !== Json.SyntaxKind.OpenBraceToken) {
			return null;
		}
		let node = new ObjectASTNode(parent, name, scanner.getTokenOffset());
		let keysSeen: any = Object.create(null);
		_scanNext(); // consume OpenBraceToken
		let needsComma = false;

		while (scanner.getToken() !== Json.SyntaxKind.CloseBraceToken && scanner.getToken() !== Json.SyntaxKind.EOF) {
			if (scanner.getToken() === Json.SyntaxKind.CommaToken) {
				if (!needsComma) {
					_error(localize('PropertyExpected', 'Property expected'), ErrorCode.PropertyExpected);
				}
				_scanNext(); // consume comma
			} else if (needsComma) {
				_error(localize('ExpectedComma', 'Expected comma'), ErrorCode.CommaExpected, node);
			}
			if (!node.addProperty(_parseProperty(node, keysSeen))) {
				_error(localize('PropertyExpected', 'Property expected'), ErrorCode.PropertyExpected, null, [], [Json.SyntaxKind.CloseBraceToken, Json.SyntaxKind.CommaToken]);
			}
			needsComma = true;
		}

		if (scanner.getToken() !== Json.SyntaxKind.CloseBraceToken) {
			return _error(localize('ExpectedCloseBrace', 'Expected comma or closing brace'), ErrorCode.CommaOrCloseBraceExpected, node);
		}
		return _finalize(node, true);
	}

	function _parseString(parent: ASTNode, name: Json.Segment, isKey: boolean): StringASTNode {
		if (scanner.getToken() !== Json.SyntaxKind.StringLiteral) {
			return null;
		}

		let node = new StringASTNode(parent, name, isKey, scanner.getTokenOffset());
		node.value = scanner.getTokenValue();

		_checkScanError();

		return _finalize(node, true);
	}

	function _parseNumber(parent: ASTNode, name: Json.Segment): NumberASTNode {
		if (scanner.getToken() !== Json.SyntaxKind.NumericLiteral) {
			return null;
		}

		let node = new NumberASTNode(parent, name, scanner.getTokenOffset());
		if (!_checkScanError()) {
			let tokenValue = scanner.getTokenValue();
			try {
				let numberValue = JSON.parse(tokenValue);
				if (typeof numberValue !== 'number') {
					return _error(localize('InvalidNumberFormat', 'Invalid number format.'), ErrorCode.Undefined, node);
				}
				node.value = numberValue;
			} catch (e) {
				return _error(localize('InvalidNumberFormat', 'Invalid number format.'), ErrorCode.Undefined, node);
			}
			node.isInteger = tokenValue.indexOf('.') === -1;
		}
		return _finalize(node, true);
	}

	function _parseLiteral(parent: ASTNode, name: Json.Segment): ASTNode {
		let node: ASTNode;
		switch (scanner.getToken()) {
			case Json.SyntaxKind.NullKeyword:
				node = new NullASTNode(parent, name, scanner.getTokenOffset());
				break;
			case Json.SyntaxKind.TrueKeyword:
				node = new BooleanASTNode(parent, name, true, scanner.getTokenOffset());
				break;
			case Json.SyntaxKind.FalseKeyword:
				node = new BooleanASTNode(parent, name, false, scanner.getTokenOffset());
				break;
			default:
				return null;
		}
		return _finalize(node, true);
	}

	function _parseValue(parent: ASTNode, name: Json.Segment): ASTNode {
		return _parseArray(parent, name) || _parseObject(parent, name) || _parseString(parent, name, false) || _parseNumber(parent, name) || _parseLiteral(parent, name);
	}

	_scanNext();

	let _root = _parseValue(null, null);
	if (!_root) {
		_error(localize('Invalid symbol', 'Expected a JSON object, array or literal.'), ErrorCode.Undefined);
	} else if (scanner.getToken() !== Json.SyntaxKind.EOF) {
		_error(localize('End of file expected', 'End of file expected.'), ErrorCode.Undefined);
	}
	return new JSONDocument(_root, problems);
}
