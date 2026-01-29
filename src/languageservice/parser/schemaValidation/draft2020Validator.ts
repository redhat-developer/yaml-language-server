/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { JSONSchema, JSONSchemaRef } from '../../jsonSchema';
import { SchemaDialect } from '../../jsonSchema';
import type { ASTNode, ArrayASTNode } from '../../jsonASTTypes';
import { isNumber } from '../../utils/objects';
import * as l10n from '@vscode/l10n';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { Draft2019Validator } from './draft2019Validator';
import type { ISchemaCollector, Options } from './baseValidator';
import { ValidationResult, asSchema } from './baseValidator';

export class Draft2020Validator extends Draft2019Validator {
  protected override getCurrentDialect(): SchemaDialect {
    return SchemaDialect.draft2020;
  }

  /**
   * Keyword: prefixItems + items
   */
  protected override validateArrayNode(
    node: ArrayASTNode,
    schema: JSONSchema,
    originalSchema: JSONSchema,
    validationResult: ValidationResult,
    matchingSchemas: ISchemaCollector,
    options: Options
  ): void {
    const items = (node.items ?? []) as ASTNode[];
    // prefixItems/items/contains contribute to evaluatedItems
    validationResult.evaluatedItems ??= new Set<number>();

    const prefixItems = schema.prefixItems;
    // validate prefixItems
    if (Array.isArray(prefixItems)) {
      const limit = Math.min(prefixItems.length, items.length);
      for (let i = 0; i < limit; i++) {
        const subSchema = asSchema(prefixItems[i]);
        if (!subSchema) {
          validationResult.evaluatedItems.add(i);
          continue;
        }
        const itemValidationResult = new ValidationResult(options.isKubernetes);
        this.validateNode(items[i], subSchema, schema, itemValidationResult, matchingSchemas, options);

        validationResult.mergePropertyMatch(itemValidationResult);
        validationResult.mergeEnumValues(itemValidationResult);

        // mark as evaluated even if invalid (avoids duplicate unevaluatedItems noise)
        validationResult.evaluatedItems.add(i);
      }
    }

    // validate remaining items against items
    const itemsKeyword = schema.items;
    const prefixLen = Array.isArray(prefixItems) ? prefixItems.length : 0;
    if (items.length > prefixLen) {
      if (itemsKeyword === false) {
        // "items": false => no items allowed beyond prefixItems
        validationResult.problems.push({
          location: { offset: node.offset, length: node.length },
          severity: DiagnosticSeverity.Warning,
          message: l10n.t('Array has too many items according to schema. Expected {0} or fewer.', prefixLen),
          source: this.getSchemaSource(schema, originalSchema),
          schemaUri: this.getSchemaUri(schema, originalSchema),
        });

        // mark these as evaluated by "items": false (so unevaluatedItems doesn't also complain)
        for (let i = prefixLen; i < items.length; i++) {
          validationResult.evaluatedItems.add(i);
        }
      } else {
        const tailSchema = asSchema(itemsKeyword as JSONSchemaRef);
        // if items is undefined, there's no constraint for remaining items and they remain unevaluated
        if (tailSchema) {
          for (let i = prefixLen; i < items.length; i++) {
            const itemValidationResult = new ValidationResult(options.isKubernetes);
            this.validateNode(items[i], tailSchema, schema, itemValidationResult, matchingSchemas, options);

            validationResult.mergePropertyMatch(itemValidationResult);
            validationResult.mergeEnumValues(itemValidationResult);

            // mark as evaluated even if invalid (avoids duplicate unevaluatedItems noise)
            validationResult.evaluatedItems.add(i);
          }
        }
      }
    }

    // contains enforces min/max and marks matching indices as evaluated
    this.applyContains(node, schema, originalSchema, validationResult, matchingSchemas, options);

    // generic array keywords
    this.applyArrayLength(node, schema, originalSchema, validationResult, options);
    this.applyUniqueItems(node, schema, originalSchema, validationResult);
  }

  /**
   * Draft 2020-12: contains keyword affects the unevaluatedItems keyword
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

    const items = (node.items ?? []) as ASTNode[];

    const minContainsRaw = schema.minContains;
    const maxContainsRaw = schema.maxContains;

    const minContains = isNumber(minContainsRaw) ? minContainsRaw : 1;
    const maxContains = isNumber(maxContainsRaw) ? maxContainsRaw : undefined;

    let matchCount = 0;

    // ensure evaluatedItems exists
    validationResult.evaluatedItems ??= new Set<number>();

    for (let i = 0; i < items.length; i++) {
      const itemValidationResult = new ValidationResult(options.isKubernetes);
      this.validateNode(items[i], containsSchema, schema, itemValidationResult, this.getNoOpCollector(), options);
      if (!itemValidationResult.hasProblems()) {
        // items that match contains are considered evaluated
        validationResult.evaluatedItems.add(i);

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
}
