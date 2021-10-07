/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { Document, Node, Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml';
import { JSONSchema, JSONSchemaRef } from '../jsonSchema';
import { formats, ProblemType, ProblemTypeMessages, ValidationResult } from './jsonParser07';
import { URI } from 'vscode-uri';
import * as nls from 'vscode-nls';
import { equals, isBoolean, isDefined, isIterable, isNumber, isString } from '../utils/objects';
import { getSchemaTypeName } from '../utils/schemaUtils';
import { isMap, isPair, isScalar, isSeq } from 'yaml';
import { toOffsetLength } from './ast-converter';
import { getParent } from '../utils/astUtils';

const localize = nls.loadMessageBundle();

export const YAML_SOURCE = 'YAML';
const YAML_SCHEMA_PREFIX = 'yaml-schema: ';

/**
 * Error codes used by diagnostics
 */
export enum ErrorCode {
  Undefined = 0,
  EnumValueMismatch = 1,
  Deprecated = 2,
  UnexpectedEndOfComment = 257,
  UnexpectedEndOfString = 258,
  UnexpectedEndOfNumber = 259,
  InvalidUnicode = 260,
  InvalidEscapeCharacter = 261,
  InvalidCharacter = 262,
  PropertyExpected = 513,
  CommaExpected = 514,
  ColonExpected = 515,
  ValueExpected = 516,
  CommaOrCloseBacketExpected = 517,
  CommaOrCloseBraceExpected = 518,
  TrailingComma = 519,
  DuplicateKey = 520,
  CommentNotPermitted = 521,
  SchemaResolveError = 768,
}

// const jsonToTypeMap = {
// object: MAP,
// array: SEQ,
// property: PAIR,
// string: SCALAR,
// number: SCALAR,
// boolean: SCALAR,
// null: SCALAR,
// };

function getNodeType(node: Node): string {
  if (isMap(node)) {
    return 'object';
  }
  if (isSeq(node)) {
    return 'array';
  }
  if (isPair(node)) {
    return 'property';
  }

  if (isScalar(node)) {
    return typeof (node as Scalar).value;
  }
}

export interface ApplicableSchema {
  node: Node;
  inverted?: boolean;
  schema: JSONSchema;
}

export interface SchemaCollector {
  schemas: ApplicableSchema[];
  add(schema: ApplicableSchema): void;
  merge(other: SchemaCollector): void;
  include(node: Node): boolean;
  newSub(): SchemaCollector;
}

export class SchemaCollectorImpl implements SchemaCollector {
  schemas: ApplicableSchema[] = [];
  constructor(private focusOffset = -1, private exclude: Node = null) {}
  add(schema: ApplicableSchema): void {
    this.schemas.push(schema);
  }
  merge(other: SchemaCollector): void {
    this.schemas.push(...other.schemas);
  }
  include(node: Node): boolean {
    return (this.focusOffset === -1 || contains(node, this.focusOffset)) && node !== this.exclude;
  }
  newSub(): SchemaCollector {
    return new SchemaCollectorImpl(-1, this.exclude);
  }
}

class NoOpSchemaCollector implements SchemaCollector {
  private constructor() {
    // ignore
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get schemas(): any[] {
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  add(schema: ApplicableSchema): void {
    // ignore
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  merge(other: SchemaCollector): void {
    // ignore
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  include(node: Node): boolean {
    return true;
  }
  newSub(): SchemaCollector {
    return this;
  }

  static instance = new NoOpSchemaCollector();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNodeValue(node: Node): any {
  if (isSeq(node)) {
    return node.items.map(getNodeValue);
  }

  if (isMap(node)) {
    const obj = Object.create(null);
    for (const pair of node.items) {
      const valueNode = pair.value;
      if (valueNode && isScalar(pair.key)) {
        //TODO: fix this
        obj[pair.key.value as string] = getNodeValue(valueNode as Node);
      }
    }
    return obj;
  }
  if (isScalar(node)) {
    return node.value;
  }

  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function contains(node: Node, offset: number, includeRightBound = false): boolean {
  // return (
  //   (offset >= node.range && offset <= node.offset + node.length) || (includeRightBound && offset === node.offset + node.length)
  // );
  throw new Error('Implement me!!!');
}

export interface Options {
  isKubernetes: boolean;
  disableAdditionalProperties: boolean;
}

export function validate(
  node: Node,
  document: Document,
  schema: JSONSchema,
  originalSchema: JSONSchema,
  validationResult: ValidationResult,
  matchingSchemas: SchemaCollector,
  options: Options
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const { isKubernetes } = options;
  if (!node || !matchingSchemas.include(node)) {
    return;
  }

  if (!schema.url) {
    schema.url = originalSchema.url;
  }
  if (!schema.title) {
    schema.title = originalSchema.title;
  }

  if (isMap(node)) {
    _validateObjectNode(node, schema, validationResult, matchingSchemas);
  } else if (isSeq(node)) {
    _validateArrayNode(node as YAMLSeq, schema, validationResult, matchingSchemas);
  } else if (isScalar(node)) {
    switch (typeof (node as Scalar).value) {
      case 'string':
        _validateStringNode(node as Scalar<string>, schema, validationResult);
        break;
      case 'number':
        _validateNumberNode(node as Scalar<number>, schema, validationResult);
        break;
    }
  } else if (isPair(node)) {
    return validate((node as Pair).value as Node, document, schema, schema, validationResult, matchingSchemas, options);
  }

  _validateNode();

  matchingSchemas.add({ node: node, schema: schema });

  function _validateNode(): void {
    function matchesType(type: string): boolean {
      return (
        getNodeType(node) === type ||
        (type === 'integer' && isScalar(node) && typeof node.value === 'number' && Number.isInteger(node.value))
      );
    }

    if (Array.isArray(schema.type)) {
      if (!schema.type.some(matchesType)) {
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          message:
            schema.errorMessage ||
            localize('typeArrayMismatchWarning', 'Incorrect type. Expected one of {0}.', (<string[]>schema.type).join(', ')),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
        });
      }
    } else if (schema.type) {
      if (!matchesType(schema.type)) {
        //get more specific name than just object
        const schemaType = schema.type === 'object' ? getSchemaTypeName(schema) : schema.type;
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          message: schema.errorMessage || getWarningMessage(ProblemType.typeMismatchWarning, [schemaType]),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
          problemType: ProblemType.typeMismatchWarning,
          problemArgs: [schemaType],
        });
      }
    }
    if (Array.isArray(schema.allOf)) {
      for (const subSchemaRef of schema.allOf) {
        validate(node, document, asSchema(subSchemaRef), schema, validationResult, matchingSchemas, options);
      }
    }
    const notSchema = asSchema(schema.not);
    if (notSchema) {
      const subValidationResult = new ValidationResult(isKubernetes);
      const subMatchingSchemas = matchingSchemas.newSub();
      validate(node, document, notSchema, schema, subValidationResult, subMatchingSchemas, options);
      if (!subValidationResult.hasProblems()) {
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          message: localize('notSchemaWarning', 'Matches a schema that is not allowed.'),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
        });
      }
      for (const ms of subMatchingSchemas.schemas) {
        ms.inverted = !ms.inverted;
        matchingSchemas.add(ms);
      }
    }

    const testAlternatives = (alternatives: JSONSchemaRef[], maxOneMatch: boolean): number => {
      const matches = [];

      // remember the best match that is used for error messages
      let bestMatch: {
        schema: JSONSchema;
        validationResult: ValidationResult;
        matchingSchemas: SchemaCollector;
      } = null;
      for (const subSchemaRef of alternatives) {
        const subSchema = asSchema(subSchemaRef);
        const subValidationResult = new ValidationResult(isKubernetes);
        const subMatchingSchemas = matchingSchemas.newSub();
        validate(node, document, subSchema, schema, subValidationResult, subMatchingSchemas, options);
        if (!subValidationResult.hasProblems()) {
          matches.push(subSchema);
        }
        if (!bestMatch) {
          bestMatch = {
            schema: subSchema,
            validationResult: subValidationResult,
            matchingSchemas: subMatchingSchemas,
          };
        } else if (isKubernetes) {
          bestMatch = alternativeComparison(subValidationResult, bestMatch, subSchema, subMatchingSchemas);
        } else {
          bestMatch = genericComparison(maxOneMatch, subValidationResult, bestMatch, subSchema, subMatchingSchemas);
        }
      }

      if (matches.length > 1 && maxOneMatch) {
        const [offset] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length: 1 },
          severity: DiagnosticSeverity.Warning,
          message: localize('oneOfWarning', 'Matches multiple schemas when only one must validate.'),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
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

    const testBranch = (schema: JSONSchemaRef, originalSchema: JSONSchema): void => {
      const subValidationResult = new ValidationResult(isKubernetes);
      const subMatchingSchemas = matchingSchemas.newSub();

      validate(node, document, asSchema(schema), originalSchema, subValidationResult, subMatchingSchemas, options);

      validationResult.merge(subValidationResult);
      validationResult.propertiesMatches += subValidationResult.propertiesMatches;
      validationResult.propertiesValueMatches += subValidationResult.propertiesValueMatches;
      matchingSchemas.merge(subMatchingSchemas);
    };

    const testCondition = (
      ifSchema: JSONSchemaRef,
      originalSchema: JSONSchema,
      thenSchema?: JSONSchemaRef,
      elseSchema?: JSONSchemaRef
    ): void => {
      const subSchema = asSchema(ifSchema);
      const subValidationResult = new ValidationResult(isKubernetes);
      const subMatchingSchemas = matchingSchemas.newSub();

      validate(node, document, subSchema, originalSchema, subValidationResult, subMatchingSchemas, options);
      matchingSchemas.merge(subMatchingSchemas);

      if (!subValidationResult.hasProblems()) {
        if (thenSchema) {
          testBranch(thenSchema, originalSchema);
        }
      } else if (elseSchema) {
        testBranch(elseSchema, originalSchema);
      }
    };

    const ifSchema = asSchema(schema.if);
    if (ifSchema) {
      testCondition(ifSchema, schema, asSchema(schema.then), asSchema(schema.else));
    }

    if (Array.isArray(schema.enum)) {
      const val = getNodeValue(node);
      let enumValueMatch = false;
      for (const e of schema.enum) {
        if (equals(val, e)) {
          enumValueMatch = true;
          break;
        }
      }
      validationResult.enumValues = schema.enum;
      validationResult.enumValueMatch = enumValueMatch;
      if (!enumValueMatch) {
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          code: ErrorCode.EnumValueMismatch,
          message:
            schema.errorMessage ||
            localize(
              'enumWarning',
              'Value is not accepted. Valid values: {0}.',
              schema.enum
                .map((v) => {
                  return JSON.stringify(v);
                })
                .join(', ')
            ),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
        });
      }
    }

    if (isDefined(schema.const)) {
      const val = getNodeValue(node);
      if (!equals(val, schema.const)) {
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          code: ErrorCode.EnumValueMismatch,
          problemType: ProblemType.constWarning,
          message: schema.errorMessage || getWarningMessage(ProblemType.constWarning, [JSON.stringify(schema.const)]),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
          problemArgs: [JSON.stringify(schema.const)],
        });
        validationResult.enumValueMatch = false;
      } else {
        validationResult.enumValueMatch = true;
      }
      validationResult.enumValues = [schema.const];
    }
    const parent = getParent(document, node);
    if (schema.deprecationMessage && parent) {
      const [offset, length] = toOffsetLength(parent.range);
      validationResult.problems.push({
        location: { offset, length },
        severity: DiagnosticSeverity.Warning,
        message: schema.deprecationMessage,
        source: getSchemaSource(schema, originalSchema),
        schemaUri: getSchemaUri(schema, originalSchema),
      });
    }
  }

  function _validateNumberNode(node: Scalar<number>, schema: JSONSchema, validationResult: ValidationResult): void {
    const val = node.value;

    if (isNumber(schema.multipleOf)) {
      if (val % schema.multipleOf !== 0) {
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          message: localize('multipleOfWarning', 'Value is not divisible by {0}.', schema.multipleOf),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
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
      return undefined;
    }
    function getLimit(limit: number | undefined, exclusive: boolean | number | undefined): number | undefined {
      if (!isBoolean(exclusive) || !exclusive) {
        return limit;
      }
      return undefined;
    }
    const exclusiveMinimum = getExclusiveLimit(schema.minimum, schema.exclusiveMinimum);
    if (isNumber(exclusiveMinimum) && val <= exclusiveMinimum) {
      const [offset, length] = toOffsetLength(node.range);
      validationResult.problems.push({
        location: { offset, length },
        severity: DiagnosticSeverity.Warning,
        message: localize('exclusiveMinimumWarning', 'Value is below the exclusive minimum of {0}.', exclusiveMinimum),
        source: getSchemaSource(schema, originalSchema),
        schemaUri: getSchemaUri(schema, originalSchema),
      });
    }
    const exclusiveMaximum = getExclusiveLimit(schema.maximum, schema.exclusiveMaximum);
    if (isNumber(exclusiveMaximum) && val >= exclusiveMaximum) {
      const [offset, length] = toOffsetLength(node.range);
      validationResult.problems.push({
        location: { offset, length },
        severity: DiagnosticSeverity.Warning,
        message: localize('exclusiveMaximumWarning', 'Value is above the exclusive maximum of {0}.', exclusiveMaximum),
        source: getSchemaSource(schema, originalSchema),
        schemaUri: getSchemaUri(schema, originalSchema),
      });
    }
    const minimum = getLimit(schema.minimum, schema.exclusiveMinimum);
    if (isNumber(minimum) && val < minimum) {
      const [offset, length] = toOffsetLength(node.range);
      validationResult.problems.push({
        location: { offset, length },
        severity: DiagnosticSeverity.Warning,
        message: localize('minimumWarning', 'Value is below the minimum of {0}.', minimum),
        source: getSchemaSource(schema, originalSchema),
        schemaUri: getSchemaUri(schema, originalSchema),
      });
    }
    const maximum = getLimit(schema.maximum, schema.exclusiveMaximum);
    if (isNumber(maximum) && val > maximum) {
      const [offset, length] = toOffsetLength(node.range);
      validationResult.problems.push({
        location: { offset, length },
        severity: DiagnosticSeverity.Warning,
        message: localize('maximumWarning', 'Value is above the maximum of {0}.', maximum),
        source: getSchemaSource(schema, originalSchema),
        schemaUri: getSchemaUri(schema, originalSchema),
      });
    }
  }

  function _validateStringNode(node: Scalar<string>, schema: JSONSchema, validationResult: ValidationResult): void {
    if (isNumber(schema.minLength) && node.value.length < schema.minLength) {
      const [offset, length] = toOffsetLength(node.range);
      validationResult.problems.push({
        location: { offset, length },
        severity: DiagnosticSeverity.Warning,
        message: localize('minLengthWarning', 'String is shorter than the minimum length of {0}.', schema.minLength),
        source: getSchemaSource(schema, originalSchema),
        schemaUri: getSchemaUri(schema, originalSchema),
      });
    }

    if (isNumber(schema.maxLength) && node.value.length > schema.maxLength) {
      const [offset, length] = toOffsetLength(node.range);
      validationResult.problems.push({
        location: { offset, length },
        severity: DiagnosticSeverity.Warning,
        message: localize('maxLengthWarning', 'String is longer than the maximum length of {0}.', schema.maxLength),
        source: getSchemaSource(schema, originalSchema),
        schemaUri: getSchemaUri(schema, originalSchema),
      });
    }

    if (isString(schema.pattern)) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(node.value)) {
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          message:
            schema.patternErrorMessage ||
            schema.errorMessage ||
            localize('patternWarning', 'String does not match the pattern of "{0}".', schema.pattern),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
        });
      }
    }

    if (schema.format) {
      switch (schema.format) {
        case 'uri':
        case 'uri-reference':
          {
            let errorMessage;
            if (!node.value) {
              errorMessage = localize('uriEmpty', 'URI expected.');
            } else {
              try {
                const uri = URI.parse(node.value);
                if (!uri.scheme && schema.format === 'uri') {
                  errorMessage = localize('uriSchemeMissing', 'URI with a scheme is expected.');
                }
              } catch (e) {
                errorMessage = e.message;
              }
            }
            if (errorMessage) {
              const [offset, length] = toOffsetLength(node.range);
              validationResult.problems.push({
                location: { offset, length },
                severity: DiagnosticSeverity.Warning,
                message:
                  schema.patternErrorMessage ||
                  schema.errorMessage ||
                  localize('uriFormatWarning', 'String is not a URI: {0}', errorMessage),
                source: getSchemaSource(schema, originalSchema),
                schemaUri: getSchemaUri(schema, originalSchema),
              });
            }
          }
          break;
        case 'color-hex':
        case 'date-time':
        case 'date':
        case 'time':
        case 'email':
          {
            const format = formats[schema.format];
            if (!node.value || !format.pattern.exec(node.value)) {
              const [offset, length] = toOffsetLength(node.range);
              validationResult.problems.push({
                location: { offset, length },
                severity: DiagnosticSeverity.Warning,
                message: schema.patternErrorMessage || schema.errorMessage || format.errorMessage,
                source: getSchemaSource(schema, originalSchema),
                schemaUri: getSchemaUri(schema, originalSchema),
              });
            }
          }
          break;
        default:
      }
    }
  }
  function _validateArrayNode(
    node: YAMLSeq,
    schema: JSONSchema,
    validationResult: ValidationResult,
    matchingSchemas: SchemaCollector
  ): void {
    if (Array.isArray(schema.items)) {
      const subSchemas = schema.items;
      for (let index = 0; index < subSchemas.length; index++) {
        const subSchemaRef = subSchemas[index];
        const subSchema = asSchema(subSchemaRef);
        const itemValidationResult = new ValidationResult(isKubernetes);
        const item = node.items[index];
        if (item) {
          validate(item as Node, document, subSchema, schema, itemValidationResult, matchingSchemas, options);
          validationResult.mergePropertyMatch(itemValidationResult);
          validationResult.mergeEnumValues(itemValidationResult);
        } else if (node.items.length >= subSchemas.length) {
          validationResult.propertiesValueMatches++;
        }
      }
      if (node.items.length > subSchemas.length) {
        if (typeof schema.additionalItems === 'object') {
          for (let i = subSchemas.length; i < node.items.length; i++) {
            const itemValidationResult = new ValidationResult(isKubernetes);
            validate(
              node.items[i] as Node,
              document,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <any>schema.additionalItems,
              schema,
              itemValidationResult,
              matchingSchemas,
              options
            );
            validationResult.mergePropertyMatch(itemValidationResult);
            validationResult.mergeEnumValues(itemValidationResult);
          }
        } else if (schema.additionalItems === false) {
          const [offset, length] = toOffsetLength(node.range);
          validationResult.problems.push({
            location: { offset, length },
            severity: DiagnosticSeverity.Warning,
            message: localize(
              'additionalItemsWarning',
              'Array has too many items according to schema. Expected {0} or fewer.',
              subSchemas.length
            ),
            source: getSchemaSource(schema, originalSchema),
            schemaUri: getSchemaUri(schema, originalSchema),
          });
        }
      }
    } else {
      const itemSchema = asSchema(schema.items);
      if (itemSchema) {
        for (const item of node.items) {
          const itemValidationResult = new ValidationResult(isKubernetes);
          validate(item as Node, document, itemSchema, schema, itemValidationResult, matchingSchemas, options);
          validationResult.mergePropertyMatch(itemValidationResult);
          validationResult.mergeEnumValues(itemValidationResult);
        }
      }
    }

    const containsSchema = asSchema(schema.contains);
    if (containsSchema) {
      const doesContain = node.items.some((item) => {
        const itemValidationResult = new ValidationResult(isKubernetes);
        validate(item as Node, document, containsSchema, schema, itemValidationResult, NoOpSchemaCollector.instance, options);
        return !itemValidationResult.hasProblems();
      });

      if (!doesContain) {
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          message: schema.errorMessage || localize('requiredItemMissingWarning', 'Array does not contain required item.'),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
        });
      }
    }

    if (isNumber(schema.minItems) && node.items.length < schema.minItems) {
      const [offset, length] = toOffsetLength(node.range);
      validationResult.problems.push({
        location: { offset, length },
        severity: DiagnosticSeverity.Warning,
        message: localize('minItemsWarning', 'Array has too few items. Expected {0} or more.', schema.minItems),
        source: getSchemaSource(schema, originalSchema),
        schemaUri: getSchemaUri(schema, originalSchema),
      });
    }

    if (isNumber(schema.maxItems) && node.items.length > schema.maxItems) {
      const [offset, length] = toOffsetLength(node.range);
      validationResult.problems.push({
        location: { offset, length },
        severity: DiagnosticSeverity.Warning,
        message: localize('maxItemsWarning', 'Array has too many items. Expected {0} or fewer.', schema.maxItems),
        source: getSchemaSource(schema, originalSchema),
        schemaUri: getSchemaUri(schema, originalSchema),
      });
    }

    if (schema.uniqueItems === true) {
      const values = getNodeValue(node);
      const duplicates = values.some((value, index) => {
        return index !== values.lastIndexOf(value);
      });
      if (duplicates) {
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          message: localize('uniqueItemsWarning', 'Array has duplicate items.'),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
        });
      }
    }
  }

  function _validateObjectNode(
    node: YAMLMap,
    schema: JSONSchema,
    validationResult: ValidationResult,
    matchingSchemas: SchemaCollector
  ): void {
    const seenKeys: { [key: string]: Node } = Object.create(null);
    const unprocessedProperties: string[] = [];
    const unprocessedNodes: Pair[] = [...node.items];

    while (unprocessedNodes.length > 0) {
      const propertyNode = unprocessedNodes.pop();
      if (!isScalar(propertyNode.key)) {
        continue;
      }
      const key = propertyNode.key.value.toString();

      //Replace the merge key with the actual values of what the node value points to in seen keys
      if (key === '<<' && propertyNode.value) {
        if (isMap(propertyNode.value)) {
          unprocessedNodes.push(...propertyNode.value.items);
        } else if (isSeq(propertyNode.value)) {
          propertyNode.value.items.forEach((sequenceNode) => {
            if (sequenceNode && isIterable(sequenceNode['items'])) {
              unprocessedNodes.push(...sequenceNode['items']);
            }
          });
        }
      } else {
        seenKeys[key] = propertyNode.value as Node;
        unprocessedProperties.push(key);
      }
    }

    if (Array.isArray(schema.required)) {
      for (const propertyName of schema.required) {
        if (!seenKeys[propertyName]) {
          const parent = getParent(document, node);
          const keyNode = parent && isPair(parent) && (parent.key as Node);
          const [offset, length] = toOffsetLength(node.range);
          const location = keyNode ? { offset, length } : { offset, length: 1 };
          validationResult.problems.push({
            location: location,
            severity: DiagnosticSeverity.Warning,
            message: getWarningMessage(ProblemType.missingRequiredPropWarning, [propertyName]),
            source: getSchemaSource(schema, originalSchema),
            schemaUri: getSchemaUri(schema, originalSchema),
            problemArgs: [propertyName],
            problemType: ProblemType.missingRequiredPropWarning,
          });
        }
      }
    }

    const propertyProcessed = (prop: string): void => {
      let index = unprocessedProperties.indexOf(prop);
      while (index >= 0) {
        unprocessedProperties.splice(index, 1);
        index = unprocessedProperties.indexOf(prop);
      }
    };

    if (schema.properties) {
      for (const propertyName of Object.keys(schema.properties)) {
        propertyProcessed(propertyName);
        const propertySchema = schema.properties[propertyName];
        const child = seenKeys[propertyName];
        if (child) {
          if (isBoolean(propertySchema)) {
            if (!propertySchema) {
              const propertyNode = getParent(document, child) as Pair;
              const [offset, length] = toOffsetLength((propertyNode.key as Node).range);
              validationResult.problems.push({
                location: {
                  offset,
                  length,
                },
                severity: DiagnosticSeverity.Warning,
                message:
                  schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName),
                source: getSchemaSource(schema, originalSchema),
                schemaUri: getSchemaUri(schema, originalSchema),
              });
            } else {
              validationResult.propertiesMatches++;
              validationResult.propertiesValueMatches++;
            }
          } else {
            propertySchema.url = schema.url ?? originalSchema.url;
            const propertyValidationResult = new ValidationResult(isKubernetes);
            validate(child, document, propertySchema, schema, propertyValidationResult, matchingSchemas, options);
            validationResult.mergePropertyMatch(propertyValidationResult);
            validationResult.mergeEnumValues(propertyValidationResult);
          }
        }
      }
    }

    if (schema.patternProperties) {
      for (const propertyPattern of Object.keys(schema.patternProperties)) {
        const regex = new RegExp(propertyPattern);
        for (const propertyName of unprocessedProperties.slice(0)) {
          if (regex.test(propertyName)) {
            propertyProcessed(propertyName);
            const child = seenKeys[propertyName];
            if (child) {
              const propertySchema = schema.patternProperties[propertyPattern];
              if (isBoolean(propertySchema)) {
                if (!propertySchema) {
                  const propertyNode = getParent(document, child) as Pair;
                  const [offset, length] = toOffsetLength((propertyNode.key as Node).range);
                  validationResult.problems.push({
                    location: {
                      offset,
                      length,
                    },
                    severity: DiagnosticSeverity.Warning,
                    message:
                      schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName),
                    source: getSchemaSource(schema, originalSchema),
                    schemaUri: getSchemaUri(schema, originalSchema),
                  });
                } else {
                  validationResult.propertiesMatches++;
                  validationResult.propertiesValueMatches++;
                }
              } else {
                const propertyValidationResult = new ValidationResult(isKubernetes);
                validate(child, document, propertySchema, schema, propertyValidationResult, matchingSchemas, options);
                validationResult.mergePropertyMatch(propertyValidationResult);
                validationResult.mergeEnumValues(propertyValidationResult);
              }
            }
          }
        }
      }
    }
    if (typeof schema.additionalProperties === 'object') {
      for (const propertyName of unprocessedProperties) {
        const child = seenKeys[propertyName];
        if (child) {
          const propertyValidationResult = new ValidationResult(isKubernetes);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          validate(child, document, <any>schema.additionalProperties, schema, propertyValidationResult, matchingSchemas, options);
          validationResult.mergePropertyMatch(propertyValidationResult);
          validationResult.mergeEnumValues(propertyValidationResult);
        }
      }
    } else if (
      schema.additionalProperties === false ||
      (schema.type === 'object' && schema.additionalProperties === undefined && options.disableAdditionalProperties === true)
    ) {
      if (unprocessedProperties.length > 0) {
        for (const propertyName of unprocessedProperties) {
          const child = seenKeys[propertyName];
          if (child) {
            let propertyNode: Node = null;
            if (!isPair(child)) {
              propertyNode = getParent(document, child) as Node;
              if (isMap(propertyNode)) {
                propertyNode = propertyNode.items[0];
              }
            } else {
              propertyNode = child;
            }
            const [offset, length] = toOffsetLength(((propertyNode as Pair).key as Node).range);
            validationResult.problems.push({
              location: {
                offset,
                length,
              },
              severity: DiagnosticSeverity.Warning,
              message:
                schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName),
              source: getSchemaSource(schema, originalSchema),
              schemaUri: getSchemaUri(schema, originalSchema),
            });
          }
        }
      }
    }

    if (isNumber(schema.maxProperties)) {
      if (node.items.length > schema.maxProperties) {
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          message: localize('MaxPropWarning', 'Object has more properties than limit of {0}.', schema.maxProperties),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
        });
      }
    }

    if (isNumber(schema.minProperties)) {
      if (node.items.length < schema.minProperties) {
        const [offset, length] = toOffsetLength(node.range);
        validationResult.problems.push({
          location: { offset, length },
          severity: DiagnosticSeverity.Warning,
          message: localize(
            'MinPropWarning',
            'Object has fewer properties than the required number of {0}',
            schema.minProperties
          ),
          source: getSchemaSource(schema, originalSchema),
          schemaUri: getSchemaUri(schema, originalSchema),
        });
      }
    }

    if (schema.dependencies) {
      for (const key of Object.keys(schema.dependencies)) {
        const prop = seenKeys[key];
        if (prop) {
          const propertyDep = schema.dependencies[key];
          if (Array.isArray(propertyDep)) {
            for (const requiredProp of propertyDep) {
              if (!seenKeys[requiredProp]) {
                const [offset, length] = toOffsetLength(node.range);
                validationResult.problems.push({
                  location: { offset, length },
                  severity: DiagnosticSeverity.Warning,
                  message: localize(
                    'RequiredDependentPropWarning',
                    'Object is missing property {0} required by property {1}.',
                    requiredProp,
                    key
                  ),
                  source: getSchemaSource(schema, originalSchema),
                  schemaUri: getSchemaUri(schema, originalSchema),
                });
              } else {
                validationResult.propertiesValueMatches++;
              }
            }
          } else {
            const propertySchema = asSchema(propertyDep);
            if (propertySchema) {
              const propertyValidationResult = new ValidationResult(isKubernetes);
              validate(node, document, propertySchema, schema, propertyValidationResult, matchingSchemas, options);
              validationResult.mergePropertyMatch(propertyValidationResult);
              validationResult.mergeEnumValues(propertyValidationResult);
            }
          }
        }
      }
    }

    const propertyNames = asSchema(schema.propertyNames);
    if (propertyNames) {
      for (const f of node.items) {
        const key = f.key;
        if (key) {
          validate(key as Node, document, propertyNames, schema, validationResult, NoOpSchemaCollector.instance, options);
        }
      }
    }
  }

  //Alternative comparison is specifically used by the kubernetes/openshift schema but may lead to better results then genericComparison depending on the schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function alternativeComparison(subValidationResult, bestMatch, subSchema, subMatchingSchemas): any {
    const compareResult = subValidationResult.compareKubernetes(bestMatch.validationResult);
    if (compareResult > 0) {
      // our node is the best matching so far
      bestMatch = {
        schema: subSchema,
        validationResult: subValidationResult,
        matchingSchemas: subMatchingSchemas,
      };
    } else if (compareResult === 0) {
      // there's already a best matching but we are as good
      bestMatch.matchingSchemas.merge(subMatchingSchemas);
      bestMatch.validationResult.mergeEnumValues(subValidationResult);
    }
    return bestMatch;
  }

  //genericComparison tries to find the best matching schema using a generic comparison
  function genericComparison(
    maxOneMatch,
    subValidationResult: ValidationResult,
    bestMatch: {
      schema: JSONSchema;
      validationResult: ValidationResult;
      matchingSchemas: SchemaCollector;
    },
    subSchema,
    subMatchingSchemas
  ): {
    schema: JSONSchema;
    validationResult: ValidationResult;
    matchingSchemas: SchemaCollector;
  } {
    if (!maxOneMatch && !subValidationResult.hasProblems() && !bestMatch.validationResult.hasProblems()) {
      // no errors, both are equally good matches
      bestMatch.matchingSchemas.merge(subMatchingSchemas);
      bestMatch.validationResult.propertiesMatches += subValidationResult.propertiesMatches;
      bestMatch.validationResult.propertiesValueMatches += subValidationResult.propertiesValueMatches;
    } else {
      const compareResult = subValidationResult.compareGeneric(bestMatch.validationResult);
      if (compareResult > 0) {
        // our node is the best matching so far
        bestMatch = {
          schema: subSchema,
          validationResult: subValidationResult,
          matchingSchemas: subMatchingSchemas,
        };
      } else if (compareResult === 0) {
        // there's already a best matching but we are as good
        bestMatch.matchingSchemas.merge(subMatchingSchemas);
        bestMatch.validationResult.mergeEnumValues(subValidationResult);
        bestMatch.validationResult.mergeWarningGeneric(subValidationResult, [
          ProblemType.missingRequiredPropWarning,
          ProblemType.typeMismatchWarning,
          ProblemType.constWarning,
        ]);
      }
    }
    return bestMatch;
  }
}

export function asSchema(schema: JSONSchemaRef): JSONSchema {
  if (isBoolean(schema)) {
    return schema ? {} : { not: {} };
  }
  return schema;
}

function getSchemaSource(schema: JSONSchema, originalSchema: JSONSchema): string | undefined {
  if (schema) {
    let label: string;
    if (schema.title) {
      label = schema.title;
    } else if (originalSchema.title) {
      label = originalSchema.title;
    } else {
      const uriString = schema.url ?? originalSchema.url;
      if (uriString) {
        const url = URI.parse(uriString);
        if (url.scheme === 'file') {
          label = url.fsPath;
        }
        label = url.toString();
      }
    }
    if (label) {
      return `${YAML_SCHEMA_PREFIX}${label}`;
    }
  }

  return YAML_SOURCE;
}

function getSchemaUri(schema: JSONSchema, originalSchema: JSONSchema): string[] {
  const uriString = schema.url ?? originalSchema.url;
  return uriString ? [uriString] : [];
}

function getWarningMessage(problemType: ProblemType, args: string[]): string {
  return localize(problemType, ProblemTypeMessages[problemType], args.join(' | '));
}
