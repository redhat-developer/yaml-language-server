/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Json from 'jsonc-parser';
import { JSONSchema, JSONSchemaRef } from '../jsonSchema2';
import { isNumber, equals, isString, isDefined, isBoolean } from '../utils/objects';
import { ASTNode, ObjectASTNode, ArrayASTNode, BooleanASTNode, NumberASTNode, StringASTNode, NullASTNode, PropertyASTNode, JSONPath, ErrorCode } from '../jsonLanguageTypes';

import * as nls from 'vscode-nls';
import Uri from 'vscode-uri';
import { TextDocument, Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver-types';

const localize = nls.loadMessageBundle();

export interface IRange {
    offset: number;
    length: number;
}

const colorHexPattern = /^#([0-9A-Fa-f]{3,4}|([0-9A-Fa-f]{2}){3,4})$/;
const emailPattern = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export interface IProblem {
    location: IRange;
    severity: DiagnosticSeverity;
    code?: ErrorCode;
    message: string;
}

export abstract class ASTNodeImpl {

    public readonly abstract type: 'object' | 'property' | 'array' | 'number' | 'boolean' | 'null' | 'string';

    public offset: number;
    public length: number;
    public readonly parent: ASTNode;

    constructor(parent: ASTNode, offset: number, length?: number) {
        this.offset = offset;
        this.length = length;
        this.parent = parent;
    }

    public get children(): ASTNode[] {
        return [];
    }

    public toString(): string {
        return 'type: ' + this.type + ' (' + this.offset + '/' + this.length + ')' + (this.parent ? ' parent: {' + this.parent.toString() + '}' : '');
    }
}

export class NullASTNodeImpl extends ASTNodeImpl implements NullASTNode {

    public type: 'null' = 'null';
    public value: null = null;
    constructor(parent: ASTNode, offset: number, length?: number) {
        super(parent, offset, length);
    }
}

export class BooleanASTNodeImpl extends ASTNodeImpl implements BooleanASTNode {

    public type: 'boolean' = 'boolean';
    public value: boolean;

    constructor(parent: ASTNode, boolValue: boolean, offset: number, length?: number) {
        super(parent, offset, length);
        this.value = boolValue;
    }
}

export class ArrayASTNodeImpl extends ASTNodeImpl implements ArrayASTNode {

    public type: 'array' = 'array';
    public items: ASTNode[];

    constructor(parent: ASTNode, offset: number, length?: number) {
        super(parent, offset, length);
        this.items = [];
    }

    public get children(): ASTNode[] {
        return this.items;
    }
}

export class NumberASTNodeImpl extends ASTNodeImpl implements NumberASTNode {

    public type: 'number' = 'number';
    public isInteger: boolean;
    public value: number;

    constructor(parent: ASTNode, offset: number, length?: number) {
        super(parent, offset, length);
        this.isInteger = true;
        this.value = Number.NaN;
    }
}

export class StringASTNodeImpl extends ASTNodeImpl implements StringASTNode {
    public type: 'string' = 'string';
    public value: string;

    constructor(parent: ASTNode, offset: number, length?: number) {
        super(parent, offset, length);
        this.value = '';
    }
}

export class PropertyASTNodeImpl extends ASTNodeImpl implements PropertyASTNode {
    public type: 'property' = 'property';
    public keyNode: StringASTNode;
    public valueNode: ASTNode;
    public colonOffset: number;

    constructor(parent: ObjectASTNode, offset: number, length?: number) {
        super(parent, offset, length);
        this.colonOffset = -1;
    }

    public get children(): ASTNode[] {
        return this.valueNode ? [this.keyNode, this.valueNode] : [this.keyNode];
    }
}

export class ObjectASTNodeImpl extends ASTNodeImpl implements ObjectASTNode {
    public type: 'object' = 'object';
    public properties: PropertyASTNode[];

    constructor(parent: ASTNode, offset: number, length?: number) {
        super(parent, offset, length);

        this.properties = [];
    }

    public get children(): ASTNode[] {
        return this.properties;
    }

}

export function asSchema(schema: JSONSchemaRef) {
    if (isBoolean(schema)) {
        return schema ? {} : { "not": {} };
    }
    return schema;
}

export interface JSONDocumentConfig {
    collectComments?: boolean;
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
        return (this.focusOffset === -1 || contains(node, this.focusOffset)) && (node !== this.exclude);
    }
    newSub(): ISchemaCollector {
        return new SchemaCollector(-1, this.exclude);
    }
}

class NoOpSchemaCollector implements ISchemaCollector {
    private constructor() { }
    get schemas() { return []; }
    add(schema: IApplicableSchema) { }
    merge(other: ISchemaCollector) { }
    include(node: ASTNode) { return true; }
    newSub(): ISchemaCollector { return this; }

    static instance = new NoOpSchemaCollector();
}

export class ValidationResult {
    public problems: IProblem[];

    public propertiesMatches: number;
    public propertiesValueMatches: number;
    public primaryValueMatches: number;
    public enumValueMatch: boolean;
    public enumValues: any[];

    constructor() {
        this.problems = [];
        this.propertiesMatches = 0;
        this.propertiesValueMatches = 0;
        this.primaryValueMatches = 0;
        this.enumValueMatch = false;
        this.enumValues = null;
    }

    public hasProblems(): boolean {
        return !!this.problems.length;
    }

    public mergeAll(validationResults: ValidationResult[]): void {
        for (const validationResult of validationResults) {
            this.merge(validationResult);
        }
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
        if (propertyValidationResult.enumValueMatch || !propertyValidationResult.hasProblems() && propertyValidationResult.propertiesMatches) {
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

export function newJSONDocument(root: ASTNode, diagnostics: Diagnostic[] = []) {
    return new JSONDocument(root, diagnostics, []);
}

export function getNodeValue(node: ASTNode): any {
    return Json.getNodeValue(node);
}

export function getNodePath(node: ASTNode): JSONPath {
    return Json.getNodePath(node);
}

export function contains(node: ASTNode, offset: number, includeRightBound = false): boolean {
    return offset >= node.offset && offset < (node.offset + node.length) || includeRightBound && offset === (node.offset + node.length);
}

export class JSONDocument {

    constructor(public readonly root: ASTNode, public readonly syntaxErrors: Diagnostic[] = [], public readonly comments: Range[] = []) {
    }

    public getNodeFromOffset(offset: number, includeRightBound = false): ASTNode | undefined {
        if (this.root) {
            return <ASTNode>Json.findNodeAtOffset(this.root, offset, includeRightBound);
        }
        return void 0;
    }

    public visit(visitor: (node: ASTNode) => boolean): void {
        if (this.root) {
            let doVisit = (node: ASTNode): boolean => {
                let ctn = visitor(node);
                let children = node.children;
                if (Array.isArray(children)) {
                    for (let i = 0; i < children.length && ctn; i++) {
                        ctn = doVisit(children[i]);
                    }
                }
                return ctn;
            };
            doVisit(this.root);
        }
    }

    public validate(textDocument: TextDocument, schema: JSONSchema): Diagnostic[] {
        if (this.root && schema) {
            let validationResult = new ValidationResult();
            validate(this.root, schema, validationResult, NoOpSchemaCollector.instance);
            return validationResult.problems.map(p => {
                let range = Range.create(textDocument.positionAt(p.location.offset), textDocument.positionAt(p.location.offset + p.location.length));
                return Diagnostic.create(range, p.message, p.severity, p.code);
            });
        }
        return null;
    }

    public getMatchingSchemas(schema: JSONSchema, focusOffset: number = -1, exclude: ASTNode = null): IApplicableSchema[] {
        let matchingSchemas = new SchemaCollector(focusOffset, exclude);
        if (this.root && schema) {
            validate(this.root, schema, new ValidationResult(), matchingSchemas);
        }
        return matchingSchemas.schemas;
    }
}

function validate(node: ASTNode, schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector) {

    if (!node || !matchingSchemas.include(node)) {
        return;
    }

    switch (node.type) {
        case 'object':
            _validateObjectNode(node, schema, validationResult, matchingSchemas);
            break;
        case 'array':
            _validateArrayNode(node, schema, validationResult, matchingSchemas);
            break;
        case 'string':
            _validateStringNode(node, schema, validationResult, matchingSchemas);
            break;
        case 'number':
            _validateNumberNode(node, schema, validationResult, matchingSchemas);
            break;
        case 'property':
            return validate(node.valueNode, schema, validationResult, matchingSchemas);
    }
    _validateNode();

    matchingSchemas.add({ node: node, schema: schema });

    function _validateNode() {

        function matchesType(type: string) {
            return node.type === type || (type === 'integer' && node.type === 'number' && node.isInteger);
        }

        if (Array.isArray(schema.type)) {
            if (!schema.type.some(matchesType)) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    message: schema.errorMessage || localize('typeArrayMismatchWarning', 'Incorrect type. Expected one of {0}.', (<string[]>schema.type).join(', '))
                });
            }
        }
        else if (schema.type) {
            if (!matchesType(schema.type)) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    message: schema.errorMessage || localize('typeMismatchWarning', 'Incorrect type. Expected "{0}".', schema.type)
                });
            }
        }
        if (Array.isArray(schema.allOf)) {
            for (const subSchemaRef of schema.allOf) {
                validate(node, asSchema(subSchemaRef), validationResult, matchingSchemas);
            }
        }
        let notSchema = asSchema(schema.not);
        if (notSchema) {
            let subValidationResult = new ValidationResult();
            let subMatchingSchemas = matchingSchemas.newSub();
            validate(node, notSchema, subValidationResult, subMatchingSchemas);
            if (!subValidationResult.hasProblems()) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    message: localize('notSchemaWarning', "Matches a schema that is not allowed.")
                });
            }
            for (const ms of subMatchingSchemas.schemas) {
                ms.inverted = !ms.inverted;
                matchingSchemas.add(ms);
            }
        }

        let testAlternatives = (alternatives: JSONSchemaRef[], maxOneMatch: boolean) => {
            let matches = [];

            // remember the best match that is used for error messages
            let bestMatch: { schema: JSONSchema; validationResult: ValidationResult; matchingSchemas: ISchemaCollector; } = null;
            for (const subSchemaRef of alternatives) {
                let subSchema = asSchema(subSchemaRef);
                let subValidationResult = new ValidationResult();
                let subMatchingSchemas = matchingSchemas.newSub();
                validate(node, subSchema, subValidationResult, subMatchingSchemas);
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

            if (matches.length > 1 && maxOneMatch) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: 1 },
                    severity: DiagnosticSeverity.Warning,
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

        let testBranch = (schema: JSONSchemaRef) => {
            let subValidationResult = new ValidationResult();
            let subMatchingSchemas = matchingSchemas.newSub();

            validate(node, asSchema(schema), subValidationResult, subMatchingSchemas);

            validationResult.merge(subValidationResult);
            validationResult.propertiesMatches += subValidationResult.propertiesMatches;
            validationResult.propertiesValueMatches += subValidationResult.propertiesValueMatches;
            matchingSchemas.merge(subMatchingSchemas);
        };

        let testCondition = (ifSchema: JSONSchemaRef, thenSchema?: JSONSchemaRef, elseSchema?: JSONSchemaRef) => {
            let subSchema = asSchema(ifSchema);
            let subValidationResult = new ValidationResult();
            let subMatchingSchemas = matchingSchemas.newSub();

            validate(node, subSchema, subValidationResult, subMatchingSchemas);
            matchingSchemas.merge(subMatchingSchemas);

            if (!subValidationResult.hasProblems()) {
                if (thenSchema) {
                    testBranch(thenSchema);
                }
            } else if (elseSchema) {
                testBranch(elseSchema);
            }
        };

        let ifSchema = asSchema(schema.if);
        if (ifSchema) {
            testCondition(ifSchema, asSchema(schema.then), asSchema(schema.else));
        }

        if (Array.isArray(schema.enum)) {
            let val = getNodeValue(node);
            let enumValueMatch = false;
            for (let e of schema.enum) {
                if (equals(val, e)) {
                    enumValueMatch = true;
                    break;
                }
            }
            validationResult.enumValues = schema.enum;
            validationResult.enumValueMatch = enumValueMatch;
            if (!enumValueMatch) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    code: ErrorCode.EnumValueMismatch,
                    message: schema.errorMessage || localize('enumWarning', 'Value is not accepted. Valid values: {0}.', schema.enum.map(v => JSON.stringify(v)).join(', '))
                });
            }
        }

        if (isDefined(schema.const)) {
            let val = getNodeValue(node);
            if (!equals(val, schema.const)) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    code: ErrorCode.EnumValueMismatch,
                    message: schema.errorMessage || localize('constWarning', 'Value must be {0}.', JSON.stringify(schema.const))
                });
                validationResult.enumValueMatch = false;
            } else {
                validationResult.enumValueMatch = true;
            }
            validationResult.enumValues = [schema.const];
        }

        if (schema.deprecationMessage && node.parent) {
            validationResult.problems.push({
                location: { offset: node.parent.offset, length: node.parent.length },
                severity: DiagnosticSeverity.Warning,
                message: schema.deprecationMessage
            });
        }
    }



    function _validateNumberNode(node: NumberASTNode, schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {
        let val = node.value;

        if (isNumber(schema.multipleOf)) {
            if (val % schema.multipleOf !== 0) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    message: localize('multipleOfWarning', 'Value is not divisible by {0}.', schema.multipleOf)
                });
            }
        }
        function getExclusiveLimit(limit: number | undefined, exclusive: boolean | number | undefined): number | undefined {
            if (isNumber(exclusive)) {
                return exclusive;
            }
            if (isBoolean(exclusive) && exclusive) {
                return limit;
            }
            return void 0;
        }
        function getLimit(limit: number | undefined, exclusive: boolean | number | undefined): number | undefined {
            if (!isBoolean(exclusive) || !exclusive) {
                return limit;
            }
            return void 0;
        }
        let exclusiveMinimum = getExclusiveLimit(schema.minimum, schema.exclusiveMinimum);
        if (isNumber(exclusiveMinimum) && val <= exclusiveMinimum) {
            validationResult.problems.push({
                location: { offset: node.offset, length: node.length },
                severity: DiagnosticSeverity.Warning,
                message: localize('exclusiveMinimumWarning', 'Value is below the exclusive minimum of {0}.', exclusiveMinimum)
            });
        }
        let exclusiveMaximum = getExclusiveLimit(schema.maximum, schema.exclusiveMaximum);
        if (isNumber(exclusiveMaximum) && val >= exclusiveMaximum) {
            validationResult.problems.push({
                location: { offset: node.offset, length: node.length },
                severity: DiagnosticSeverity.Warning,
                message: localize('exclusiveMaximumWarning', 'Value is above the exclusive maximum of {0}.', exclusiveMaximum)
            });
        }
        let minimum = getLimit(schema.minimum, schema.exclusiveMinimum);
        if (isNumber(minimum) && val < minimum) {
            validationResult.problems.push({
                location: { offset: node.offset, length: node.length },
                severity: DiagnosticSeverity.Warning,
                message: localize('minimumWarning', 'Value is below the minimum of {0}.', minimum)
            });
        }
        let maximum = getLimit(schema.maximum, schema.exclusiveMaximum);
        if (isNumber(maximum) && val > maximum) {
            validationResult.problems.push({
                location: { offset: node.offset, length: node.length },
                severity: DiagnosticSeverity.Warning,
                message: localize('maximumWarning', 'Value is above the maximum of {0}.', maximum)
            });
        }
    }

    function _validateStringNode(node: StringASTNode, schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {
        if (isNumber(schema.minLength) && node.value.length < schema.minLength) {
            validationResult.problems.push({
                location: { offset: node.offset, length: node.length },
                severity: DiagnosticSeverity.Warning,
                message: localize('minLengthWarning', 'String is shorter than the minimum length of {0}.', schema.minLength)
            });
        }

        if (isNumber(schema.maxLength) && node.value.length > schema.maxLength) {
            validationResult.problems.push({
                location: { offset: node.offset, length: node.length },
                severity: DiagnosticSeverity.Warning,
                message: localize('maxLengthWarning', 'String is longer than the maximum length of {0}.', schema.maxLength)
            });
        }

        if (isString(schema.pattern)) {
            let regex = new RegExp(schema.pattern);
            if (!regex.test(node.value)) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    message: schema.patternErrorMessage || schema.errorMessage || localize('patternWarning', 'String does not match the pattern of "{0}".', schema.pattern)
                });
            }
        }

        if (schema.format) {
            switch (schema.format) {
                case 'uri':
                case 'uri-reference': {
                    let errorMessage;
                    if (!node.value) {
                        errorMessage = localize('uriEmpty', 'URI expected.');
                    } else {
                        try {
                            let uri = Uri.parse(node.value);
                            if (!uri.scheme && schema.format === 'uri') {
                                errorMessage = localize('uriSchemeMissing', 'URI with a scheme is expected.');
                            }
                        } catch (e) {
                            errorMessage = e.message;
                        }
                    }
                    if (errorMessage) {
                        validationResult.problems.push({
                            location: { offset: node.offset, length: node.length },
                            severity: DiagnosticSeverity.Warning,
                            message: schema.patternErrorMessage || schema.errorMessage || localize('uriFormatWarning', 'String is not a URI: {0}', errorMessage)
                        });
                    }
                }
                    break;
                case 'email': {
                    if (!node.value.match(emailPattern)) {
                        validationResult.problems.push({
                            location: { offset: node.offset, length: node.length },
                            severity: DiagnosticSeverity.Warning,
                            message: schema.patternErrorMessage || schema.errorMessage || localize('emailFormatWarning', 'String is not an e-mail address.')
                        });
                    }
                }
                    break;
                case 'color-hex': {
                    if (!node.value.match(colorHexPattern)) {
                        validationResult.problems.push({
                            location: { offset: node.offset, length: node.length },
                            severity: DiagnosticSeverity.Warning,
                            message: schema.patternErrorMessage || schema.errorMessage || localize('colorHexFormatWarning', 'Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.')
                        });
                    }
                }
                    break;
                default:
            }
        }

    }
    function _validateArrayNode(node: ArrayASTNode, schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {
        if (Array.isArray(schema.items)) {
            let subSchemas = schema.items;
            for (let index = 0; index < subSchemas.length; index++) {
                const subSchemaRef = subSchemas[index];
                let subSchema = asSchema(subSchemaRef);
                let itemValidationResult = new ValidationResult();
                let item = node.items[index];
                if (item) {
                    validate(item, subSchema, itemValidationResult, matchingSchemas);
                    validationResult.mergePropertyMatch(itemValidationResult);
                } else if (node.items.length >= subSchemas.length) {
                    validationResult.propertiesValueMatches++;
                }
            }
            if (node.items.length > subSchemas.length) {
                if (typeof schema.additionalItems === 'object') {
                    for (let i = subSchemas.length; i < node.items.length; i++) {
                        let itemValidationResult = new ValidationResult();
                        validate(node.items[i], <any>schema.additionalItems, itemValidationResult, matchingSchemas);
                        validationResult.mergePropertyMatch(itemValidationResult);
                    }
                } else if (schema.additionalItems === false) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        severity: DiagnosticSeverity.Warning,
                        message: localize('additionalItemsWarning', 'Array has too many items according to schema. Expected {0} or fewer.', subSchemas.length)
                    });
                }
            }
        } else {
            let itemSchema = asSchema(schema.items);
            if (itemSchema) {
                for (const item of node.items) {
                    let itemValidationResult = new ValidationResult();
                    validate(item, itemSchema, itemValidationResult, matchingSchemas);
                    validationResult.mergePropertyMatch(itemValidationResult);
                }
            }
        }

        let containsSchema = asSchema(schema.contains);
        if (containsSchema) {
            let doesContain = node.items.some(item => {
                let itemValidationResult = new ValidationResult();
                validate(item, containsSchema, itemValidationResult, NoOpSchemaCollector.instance);
                return !itemValidationResult.hasProblems();
            });

            if (!doesContain) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    message: schema.errorMessage || localize('requiredItemMissingWarning', 'Array does not contain required item.')
                });
            }
        }

        if (isNumber(schema.minItems) && node.items.length < schema.minItems) {
            validationResult.problems.push({
                location: { offset: node.offset, length: node.length },
                severity: DiagnosticSeverity.Warning,
                message: localize('minItemsWarning', 'Array has too few items. Expected {0} or more.', schema.minItems)
            });
        }

        if (isNumber(schema.maxItems) && node.items.length > schema.maxItems) {
            validationResult.problems.push({
                location: { offset: node.offset, length: node.length },
                severity: DiagnosticSeverity.Warning,
                message: localize('maxItemsWarning', 'Array has too many items. Expected {0} or fewer.', schema.maxItems)
            });
        }

        if (schema.uniqueItems === true) {
            let values = getNodeValue(node);
            let duplicates = values.some((value, index) => {
                return index !== values.lastIndexOf(value);
            });
            if (duplicates) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    message: localize('uniqueItemsWarning', 'Array has duplicate items.')
                });
            }
        }

    }

    function _validateObjectNode(node: ObjectASTNode, schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {
        let seenKeys: { [key: string]: ASTNode } = Object.create(null);
        let unprocessedProperties: string[] = [];
        for (const propertyNode of node.properties) {
            let key = propertyNode.keyNode.value;
            seenKeys[key] = propertyNode.valueNode;
            unprocessedProperties.push(key);
        }

        if (Array.isArray(schema.required)) {
            for (const propertyName of schema.required) {
                if (!seenKeys[propertyName]) {
                    let keyNode = node.parent && node.parent.type === 'property' && node.parent.keyNode;
                    let location = keyNode ? { offset: keyNode.offset, length: keyNode.length } : { offset: node.offset, length: 1 };
                    validationResult.problems.push({
                        location: location,
                        severity: DiagnosticSeverity.Warning,
                        message: localize('MissingRequiredPropWarning', 'Missing property "{0}".', propertyName)
                    });
                }
            }
        }

        let propertyProcessed = (prop: string) => {
            let index = unprocessedProperties.indexOf(prop);
            while (index >= 0) {
                unprocessedProperties.splice(index, 1);
                index = unprocessedProperties.indexOf(prop);
            }
        };

        if (schema.properties) {
            for (const propertyName of Object.keys(schema.properties)) {
                propertyProcessed(propertyName);
                let propertySchema = schema.properties[propertyName];
                let child = seenKeys[propertyName];
                if (child) {
                    if (isBoolean(propertySchema)) {
                        if (!propertySchema) {
                            let propertyNode = <PropertyASTNode>child.parent;
                            validationResult.problems.push({
                                location: { offset: propertyNode.keyNode.offset, length: propertyNode.keyNode.length },
                                severity: DiagnosticSeverity.Warning,
                                message: schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName)
                            });
                        } else {
                            validationResult.propertiesMatches++;
                            validationResult.propertiesValueMatches++;
                        }
                    } else {
                        let propertyValidationResult = new ValidationResult();
                        validate(child, propertySchema, propertyValidationResult, matchingSchemas);
                        validationResult.mergePropertyMatch(propertyValidationResult);
                    }
                }

            }
        }

        if (schema.patternProperties) {
            for (const propertyPattern of Object.keys(schema.patternProperties)) {
                let regex = new RegExp(propertyPattern);
                for (const propertyName of unprocessedProperties.slice(0)) {
                    if (regex.test(propertyName)) {
                        propertyProcessed(propertyName);
                        let child = seenKeys[propertyName];
                        if (child) {
                            let propertySchema = schema.patternProperties[propertyPattern];
                            if (isBoolean(propertySchema)) {
                                if (!propertySchema) {
                                    let propertyNode = <PropertyASTNode>child.parent;
                                    validationResult.problems.push({
                                        location: { offset: propertyNode.keyNode.offset, length: propertyNode.keyNode.length },
                                        severity: DiagnosticSeverity.Warning,
                                        message: schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName)
                                    });
                                } else {
                                    validationResult.propertiesMatches++;
                                    validationResult.propertiesValueMatches++;
                                }
                            } else {
                                let propertyValidationResult = new ValidationResult();
                                validate(child, propertySchema, propertyValidationResult, matchingSchemas);
                                validationResult.mergePropertyMatch(propertyValidationResult);
                            }
                        }
                    }
                }
            }
        }

        if (typeof schema.additionalProperties === 'object') {
            for (const propertyName of unprocessedProperties) {
                let child = seenKeys[propertyName];
                if (child) {
                    let propertyValidationResult = new ValidationResult();
                    validate(child, <any>schema.additionalProperties, propertyValidationResult, matchingSchemas);
                    validationResult.mergePropertyMatch(propertyValidationResult);
                }
            }
        } else if (schema.additionalProperties === false) {
            if (unprocessedProperties.length > 0) {
                for (const propertyName of unprocessedProperties) {
                    let child = seenKeys[propertyName];
                    if (child) {
                        let propertyNode = <PropertyASTNode>child.parent;

                        validationResult.problems.push({
                            location: { offset: propertyNode.keyNode.offset, length: propertyNode.keyNode.length },
                            severity: DiagnosticSeverity.Warning,
                            message: schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName)
                        });
                    }
                }
            }
        }

        if (isNumber(schema.maxProperties)) {
            if (node.properties.length > schema.maxProperties) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    message: localize('MaxPropWarning', 'Object has more properties than limit of {0}.', schema.maxProperties)
                });
            }
        }

        if (isNumber(schema.minProperties)) {
            if (node.properties.length < schema.minProperties) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    severity: DiagnosticSeverity.Warning,
                    message: localize('MinPropWarning', 'Object has fewer properties than the required number of {0}', schema.minProperties)
                });
            }
        }

        if (schema.dependencies) {
            for (const key of Object.keys(schema.dependencies)) {
                let prop = seenKeys[key];
                if (prop) {
                    let propertyDep = schema.dependencies[key];
                    if (Array.isArray(propertyDep)) {
                        for (const requiredProp of propertyDep) {
                            if (!seenKeys[requiredProp]) {
                                validationResult.problems.push({
                                    location: { offset: node.offset, length: node.length },
                                    severity: DiagnosticSeverity.Warning,
                                    message: localize('RequiredDependentPropWarning', 'Object is missing property {0} required by property {1}.', requiredProp, key)
                                });
                            } else {
                                validationResult.propertiesValueMatches++;
                            }
                        }
                    } else {
                        let propertySchema = asSchema(propertyDep);
                        if (propertySchema) {
                            let propertyValidationResult = new ValidationResult();
                            validate(node, propertySchema, propertyValidationResult, matchingSchemas);
                            validationResult.mergePropertyMatch(propertyValidationResult);
                        }
                    }
                }
            }
        }

        let propertyNames = asSchema(schema.propertyNames);
        if (propertyNames) {
            for (const f of node.properties) {
                let key = f.keyNode;
                if (key) {
                    validate(key, propertyNames, validationResult, NoOpSchemaCollector.instance);
                }
            }
        }
    }

}


export function parse(textDocument: TextDocument, config?: JSONDocumentConfig): JSONDocument {

    let problems: Diagnostic[] = [];
    let lastProblemOffset = -1;
    let text = textDocument.getText();
    let scanner = Json.createScanner(text, false);

    let commentRanges: Range[] = config && config.collectComments ? [] : void 0;

    function _scanNext(): Json.SyntaxKind {
        while (true) {
            let token = scanner.scan();
            _checkScanError();
            switch (token) {
                case Json.SyntaxKind.LineCommentTrivia:
                case Json.SyntaxKind.BlockCommentTrivia:
                    if (Array.isArray(commentRanges)) {
                        commentRanges.push(Range.create(textDocument.positionAt(scanner.getTokenOffset()), textDocument.positionAt(scanner.getTokenOffset() + scanner.getTokenLength())));
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

    function _errorAtRange<T extends ASTNode>(message: string, code: ErrorCode, startOffset: number, endOffset: number, severity: DiagnosticSeverity = DiagnosticSeverity.Error): void {

        if (problems.length === 0 || startOffset !== lastProblemOffset) {
            let range = Range.create(textDocument.positionAt(startOffset), textDocument.positionAt(endOffset));
            problems.push(Diagnostic.create(range, message, severity, code, textDocument.languageId));
            lastProblemOffset = startOffset;
        }
    }

    function _error<T extends ASTNodeImpl>(message: string, code: ErrorCode, node: T = null, skipUntilAfter: Json.SyntaxKind[] = [], skipUntil: Json.SyntaxKind[] = []): T {
        let start = scanner.getTokenOffset();
        let end = scanner.getTokenOffset() + scanner.getTokenLength();
        if (start === end && start > 0) {
            start--;
            while (start > 0 && /\s/.test(text.charAt(start))) {
                start--;
            }
            end = start + 1;
        }
        _errorAtRange(message, code, start, end);

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

    function _finalize<T extends ASTNodeImpl>(node: T, scanNext: boolean): T {
        node.length = scanner.getTokenOffset() + scanner.getTokenLength() - node.offset;

        if (scanNext) {
            _scanNext();
        }

        return node;
    }

    function _parseArray(parent: ASTNode): ArrayASTNode {
        if (scanner.getToken() !== Json.SyntaxKind.OpenBracketToken) {
            return null;
        }
        let node = new ArrayASTNodeImpl(parent, scanner.getTokenOffset());
        _scanNext(); // consume OpenBracketToken

        let count = 0;
        let needsComma = false;
        while (scanner.getToken() !== Json.SyntaxKind.CloseBracketToken && scanner.getToken() !== Json.SyntaxKind.EOF) {
            if (scanner.getToken() === Json.SyntaxKind.CommaToken) {
                if (!needsComma) {
                    _error(localize('ValueExpected', 'Value expected'), ErrorCode.ValueExpected);
                }
                let commaOffset = scanner.getTokenOffset();
                _scanNext(); // consume comma
                if (scanner.getToken() === Json.SyntaxKind.CloseBracketToken) {
                    if (needsComma) {
                        _errorAtRange(localize('TrailingComma', 'Trailing comma'), ErrorCode.TrailingComma, commaOffset, commaOffset + 1);
                    }
                    continue;
                }
            } else if (needsComma) {
                _error(localize('ExpectedComma', 'Expected comma'), ErrorCode.CommaExpected);
            }
            let item = _parseValue(node, count++);
            if (!item) {
                _error(localize('PropertyExpected', 'Value expected'), ErrorCode.ValueExpected, null, [], [Json.SyntaxKind.CloseBracketToken, Json.SyntaxKind.CommaToken]);
            } else {
                node.items.push(item);
            }
            needsComma = true;
        }

        if (scanner.getToken() !== Json.SyntaxKind.CloseBracketToken) {
            return _error(localize('ExpectedCloseBracket', 'Expected comma or closing bracket'), ErrorCode.CommaOrCloseBacketExpected, node);
        }

        return _finalize(node, true);
    }

    function _parseProperty(parent: ObjectASTNode, keysSeen: { [key: string]: (PropertyASTNode | boolean) }): PropertyASTNode {

        let node = new PropertyASTNodeImpl(parent, scanner.getTokenOffset());
        let key = _parseString(node);
        if (!key) {
            if (scanner.getToken() === Json.SyntaxKind.Unknown) {
                // give a more helpful error message
                _error(localize('DoubleQuotesExpected', 'Property keys must be doublequoted'), ErrorCode.Undefined);
                let keyNode = new StringASTNodeImpl(node, scanner.getTokenOffset(), scanner.getTokenLength());
                keyNode.value = scanner.getTokenValue();
                key = keyNode;
                _scanNext(); // consume Unknown
            } else {
                return null;
            }
        }
        node.keyNode = key;

        let seen = keysSeen[key.value];
        if (seen) {
            _errorAtRange(localize('DuplicateKeyWarning', "Duplicate object key"), ErrorCode.DuplicateKey, node.keyNode.offset, node.keyNode.offset + node.keyNode.length, DiagnosticSeverity.Warning);
            if (typeof seen === 'object') {
                _errorAtRange(localize('DuplicateKeyWarning', "Duplicate object key"), ErrorCode.DuplicateKey, seen.keyNode.offset, seen.keyNode.offset + seen.keyNode.length, DiagnosticSeverity.Warning);
            }
            keysSeen[key.value] = true; // if the same key is duplicate again, avoid duplicate error reporting
        } else {
            keysSeen[key.value] = node;
        }

        if (scanner.getToken() === Json.SyntaxKind.ColonToken) {
            node.colonOffset = scanner.getTokenOffset();
            _scanNext(); // consume ColonToken
        } else {
            _error(localize('ColonExpected', 'Colon expected'), ErrorCode.ColonExpected);
            if (scanner.getToken() === Json.SyntaxKind.StringLiteral && textDocument.positionAt(key.offset + key.length).line < textDocument.positionAt(scanner.getTokenOffset()).line) {
                node.length = key.length;
                return node;
            }
        }
        let value = _parseValue(node, key.value);
        if (!value) {
            return _error(localize('ValueExpected', 'Value expected'), ErrorCode.ValueExpected, node, [], [Json.SyntaxKind.CloseBraceToken, Json.SyntaxKind.CommaToken]);
        }
        node.valueNode = value;
        node.length = value.offset + value.length - node.offset;
        return node;
    }

    function _parseObject(parent: ASTNode): ObjectASTNode {
        if (scanner.getToken() !== Json.SyntaxKind.OpenBraceToken) {
            return null;
        }
        let node = new ObjectASTNodeImpl(parent, scanner.getTokenOffset());
        let keysSeen: any = Object.create(null);
        _scanNext(); // consume OpenBraceToken
        let needsComma = false;

        while (scanner.getToken() !== Json.SyntaxKind.CloseBraceToken && scanner.getToken() !== Json.SyntaxKind.EOF) {
            if (scanner.getToken() === Json.SyntaxKind.CommaToken) {
                if (!needsComma) {
                    _error(localize('PropertyExpected', 'Property expected'), ErrorCode.PropertyExpected);
                }
                let commaOffset = scanner.getTokenOffset();
                _scanNext(); // consume comma
                if (scanner.getToken() === Json.SyntaxKind.CloseBraceToken) {
                    if (needsComma) {
                        _errorAtRange(localize('TrailingComma', 'Trailing comma'), ErrorCode.TrailingComma, commaOffset, commaOffset + 1);
                    }
                    continue;
                }
            } else if (needsComma) {
                _error(localize('ExpectedComma', 'Expected comma'), ErrorCode.CommaExpected);
            }
            let property = _parseProperty(node, keysSeen);
            if (!property) {
                _error(localize('PropertyExpected', 'Property expected'), ErrorCode.PropertyExpected, null, [], [Json.SyntaxKind.CloseBraceToken, Json.SyntaxKind.CommaToken]);
            } else {
                node.properties.push(property);
            }
            needsComma = true;
        }

        if (scanner.getToken() !== Json.SyntaxKind.CloseBraceToken) {
            return _error(localize('ExpectedCloseBrace', 'Expected comma or closing brace'), ErrorCode.CommaOrCloseBraceExpected, node);
        }
        return _finalize(node, true);
    }

    function _parseString(parent: ASTNode): StringASTNode {
        if (scanner.getToken() !== Json.SyntaxKind.StringLiteral) {
            return null;
        }

        let node = new StringASTNodeImpl(parent, scanner.getTokenOffset());
        node.value = scanner.getTokenValue();

        return _finalize(node, true);
    }

    function _parseNumber(parent: ASTNode): NumberASTNode {
        if (scanner.getToken() !== Json.SyntaxKind.NumericLiteral) {
            return null;
        }

        let node = new NumberASTNodeImpl(parent, scanner.getTokenOffset());
        if (scanner.getTokenError() === Json.ScanError.None) {
            let tokenValue = scanner.getTokenValue();
            try {
                let numberValue = JSON.parse(tokenValue);
                if (!isNumber(numberValue)) {
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

    function _parseLiteral(parent: ASTNode): ASTNode {
        let node: ASTNodeImpl;
        switch (scanner.getToken()) {
            case Json.SyntaxKind.NullKeyword:
                return _finalize(new NullASTNodeImpl(parent, scanner.getTokenOffset()), true);
            case Json.SyntaxKind.TrueKeyword:
                return _finalize(new BooleanASTNodeImpl(parent, true, scanner.getTokenOffset()), true);
            case Json.SyntaxKind.FalseKeyword:
                return _finalize(new BooleanASTNodeImpl(parent, false, scanner.getTokenOffset()), true);
            default:
                return null;
        }
    }

    function _parseValue(parent: ASTNode, name: Json.Segment): ASTNode {
        return _parseArray(parent) || _parseObject(parent) || _parseString(parent) || _parseNumber(parent) || _parseLiteral(parent);
    }

    let _root = null;
    let token = _scanNext();
    if (token !== Json.SyntaxKind.EOF) {
        _root = _parseValue(null, null);
        if (!_root) {
            _error(localize('Invalid symbol', 'Expected a JSON object, array or literal.'), ErrorCode.Undefined);
        } else if (scanner.getToken() !== Json.SyntaxKind.EOF) {
            _error(localize('End of file expected', 'End of file expected.'), ErrorCode.Undefined);
        }
    }
    return new JSONDocument(_root, problems, commentRanges);
}