/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { JSONSchema, JSONSchemaRef } from '../../jsonSchema';
import { SchemaDialect } from '../../jsonSchema';
import type { ASTNode, ArrayASTNode, ObjectASTNode } from '../../jsonASTTypes';
import { isNumber } from '../../utils/objects';
import * as l10n from '@vscode/l10n';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { ErrorCode } from 'vscode-json-languageservice';
import { Draft07Validator } from './draft07Validator';
import { ValidationResult, asSchema } from './baseValidator';
import type { ISchemaCollector, Options } from './baseValidator';

export class Draft2019Validator extends Draft07Validator {
  protected override getCurrentDialect(): SchemaDialect {
    return SchemaDialect.draft2019;
  }

  /**
   * Keyword: contains + minContains/maxContains
   *
   * Draft-07 behavior: contains must match at least 1 item.
   * Draft-2019-09 behavior: minContains/maxContains constrain how many matches are required/allowed.
   */
  protected override applyContains(
    node: ArrayASTNode,
    schema: JSONSchema,
    originalSchema: JSONSchema,
    validationResult: ValidationResult,
    _matchingSchemas: ISchemaCollector,
    options: Options
  ): void {
    const containsSchema = asSchema(schema.contains);
    if (!containsSchema) return;

    const minContainsRaw = schema.minContains;
    const maxContainsRaw = schema.maxContains;

    const minContains = isNumber(minContainsRaw) ? minContainsRaw : 1;
    const maxContains = isNumber(maxContainsRaw) ? maxContainsRaw : undefined;

    let matchCount = 0;

    const items = (node.items ?? []) as ASTNode[];
    for (const item of items) {
      const itemValidationResult = new ValidationResult(options.isKubernetes);
      this.validateNode(item, containsSchema, schema, itemValidationResult, this.getNoOpCollector(), options);
      if (!itemValidationResult.hasProblems()) {
        matchCount++;
        if (maxContains !== undefined && matchCount > maxContains) {
          break;
        }
      }
    }

    if (matchCount < minContains) {
      validationResult.problems.push({
        location: { offset: node.offset, length: node.length },
        severity: DiagnosticSeverity.Warning,
        message: schema.errorMessage || l10n.t('Array has too few items matching "contains". Expected {0} or more.', minContains),
        source: this.getSchemaSource(schema, originalSchema),
        schemaUri: this.getSchemaUri(schema, originalSchema),
      });
    }

    if (maxContains !== undefined && matchCount > maxContains) {
      validationResult.problems.push({
        location: { offset: node.offset, length: node.length },
        severity: DiagnosticSeverity.Warning,
        message:
          schema.errorMessage || l10n.t('Array has too many items matching "contains". Expected {0} or fewer.', maxContains),
        source: this.getSchemaSource(schema, originalSchema),
        schemaUri: this.getSchemaUri(schema, originalSchema),
      });
    }
  }

  /**
   * Keyword: dependentRequired + dependentSchemas.
   */
  protected override applyDependencies(
    node: ObjectASTNode,
    schema: JSONSchema,
    originalSchema: JSONSchema,
    validationResult: ValidationResult,
    matchingSchemas: ISchemaCollector,
    options: Options,
    seenKeys: Record<string, ASTNode>
  ): void {
    // keep draft-07 dependencies support
    super.applyDependencies(node, schema, originalSchema, validationResult, matchingSchemas, options, seenKeys);

    const dependentRequired = schema.dependentRequired as Record<string, string[]> | undefined;
    if (dependentRequired && typeof dependentRequired === 'object') {
      for (const prop of Object.keys(dependentRequired)) {
        if (!seenKeys[prop]) continue;

        const requiredProps = dependentRequired[prop];
        if (!Array.isArray(requiredProps)) continue;

        for (const requiredProp of requiredProps) {
          if (!seenKeys[requiredProp]) {
            validationResult.problems.push({
              location: { offset: node.offset, length: node.length },
              severity: DiagnosticSeverity.Warning,
              message: l10n.t('Object is missing property {0} required by property {1}.', requiredProp, prop),
              source: this.getSchemaSource(schema, originalSchema),
              schemaUri: this.getSchemaUri(schema, originalSchema),
            });
          } else {
            validationResult.propertiesValueMatches++;
          }
        }
      }
    }

    const dependentSchemas = schema.dependentSchemas as Record<string, unknown> | undefined;
    if (dependentSchemas && typeof dependentSchemas === 'object') {
      for (const prop of Object.keys(dependentSchemas)) {
        if (!seenKeys[prop]) continue;

        const depSchema = asSchema(dependentSchemas[prop] as JSONSchemaRef);
        if (!depSchema) continue;

        const depValidationResult = new ValidationResult(options.isKubernetes);
        this.validateNode(node, depSchema, schema, depValidationResult, matchingSchemas, options);

        validationResult.mergePropertyMatch(depValidationResult);
        validationResult.mergeEnumValues(depValidationResult);
      }
    }
  }

  /**
   * Keyword: unevaluatedProperties
   */
  protected override applyUnevaluatedProperties(
    node: ObjectASTNode,
    schema: JSONSchema,
    originalSchema: JSONSchema,
    validationResult: ValidationResult,
    matchingSchemas: ISchemaCollector,
    options: Options,
    seenKeys?: Record<string, ASTNode>
  ): void {
    const unevaluated = schema.unevaluatedProperties;
    if (unevaluated === undefined) return;
    if (!seenKeys) return;

    // ensure evaluatedProperties exists
    validationResult.evaluatedProperties ??= new Set<string>();

    // remaining = properties not evaluated by properties/patternProperties/additionalProperties
    const remaining = Object.keys(seenKeys).filter((name) => !validationResult.evaluatedProperties?.has(name));
    if (remaining.length === 0) return;

    // unevaluatedProperties: false => forbid remaining properties
    if (unevaluated === false) {
      for (const propName of remaining) {
        const child = seenKeys[propName];
        if (!child) continue;

        const propertyNode = child.type === 'property' ? child : (child.parent as ASTNode);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const keyNode = (propertyNode as any).keyNode;
        if (!keyNode) continue;

        validationResult.problems.push({
          location: { offset: keyNode.offset, length: keyNode.length },
          severity: DiagnosticSeverity.Warning,
          code: ErrorCode.PropertyExpected,
          message: schema.errorMessage || l10n.t('Property {0} is not allowed.', propName),
          source: this.getSchemaSource(schema, originalSchema),
          schemaUri: this.getSchemaUri(schema, originalSchema),
        });

        validationResult.evaluatedProperties?.add(propName);
      }
      return;
    }

    // unevaluatedProperties: true => allow anything remaining, but mark evaluated
    if (unevaluated === true) {
      for (const propName of remaining) {
        validationResult.evaluatedProperties?.add(propName);
      }
      return;
    }

    // unevaluatedProperties: <schema> => validate value of each remaining property
    const unevaluatedSchema = asSchema(unevaluated as JSONSchemaRef);
    if (!unevaluatedSchema) return;

    for (const propName of remaining) {
      const child = seenKeys[propName];
      if (!child) continue;

      const valueNode = child.type === 'property' ? child.valueNode : child;
      if (!valueNode) continue;

      const subResult = new ValidationResult(options.isKubernetes);
      this.validateNode(valueNode, unevaluatedSchema, schema, subResult, matchingSchemas, options);

      validationResult.mergePropertyMatch(subResult);
      validationResult.mergeEnumValues(subResult);

      validationResult.evaluatedProperties?.add(propName);
    }
  }

  /**
   * Keyword: unevaluatedItems
   */
  protected override applyUnevaluatedItems(
    node: ArrayASTNode,
    schema: JSONSchema,
    originalSchema: JSONSchema,
    validationResult: ValidationResult,
    matchingSchemas: ISchemaCollector,
    options: Options
  ): void {
    const unevaluated = schema.unevaluatedItems;
    if (unevaluated === undefined) return;

    const items = (node.items ?? []) as ASTNode[];
    if (items.length === 0) return;

    const evaluated = validationResult.evaluatedItems ?? new Set<number>();
    const remaining: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (!evaluated.has(i)) remaining.push(i);
    }
    if (remaining.length === 0) return;

    // unevaluatedItems: false => forbid remaining indices
    if (unevaluated === false) {
      for (const idx of remaining) {
        const item = items[idx];
        validationResult.problems.push({
          location: { offset: item.offset, length: item.length || 1 },
          severity: DiagnosticSeverity.Warning,
          code: ErrorCode.PropertyExpected,
          message: schema.errorMessage || l10n.t('Array has too many items according to schema. Expected {0} or fewer.', idx),
          source: this.getSchemaSource(schema, originalSchema),
          schemaUri: this.getSchemaUri(schema, originalSchema),
        });
        validationResult.evaluatedItems ??= new Set<number>();
        validationResult.evaluatedItems.add(idx);
      }
      return;
    }

    // unevaluatedItems: true => allow everything remaining, but mark evaluated
    if (unevaluated === true) {
      validationResult.evaluatedItems ??= new Set<number>();
      for (const idx of remaining) validationResult.evaluatedItems.add(idx);
      return;
    }

    // unevaluatedItems: <schema> => validate remaining items against that schema
    const unevaluatedSchema = asSchema(unevaluated as JSONSchemaRef);
    if (!unevaluatedSchema) return;

    for (const idx of remaining) {
      const item = items[idx];
      const subResult = new ValidationResult(options.isKubernetes);

      // validate the item node with the unevaluatedItems subschema
      this.validateNode(item, unevaluatedSchema, schema, subResult, matchingSchemas, options);

      validationResult.merge(subResult);
      validationResult.mergeEnumValues(subResult);

      validationResult.evaluatedItems ??= new Set<number>();
      validationResult.evaluatedItems.add(idx);
    }
  }
}
