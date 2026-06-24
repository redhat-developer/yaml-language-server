/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { JSONSchema } from '../../jsonSchema';

import { BaseValidator } from './baseValidator';
import { SchemaDraft } from '../../jsonLanguageTypes';
import { isNumber } from '../../utils/objects';

export class Draft07Validator extends BaseValidator {
  protected override getCurrentSchemaDraft(): SchemaDraft {
    return SchemaDraft.v7;
  }

  /**
   * Keyword: exclusiveMinimum/exclusiveMaximum are treated as numeric bounds
   */
  protected getNumberLimits(schema: JSONSchema): {
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
  } {
    const minimum = isNumber(schema.minimum) ? schema.minimum : undefined;
    const maximum = isNumber(schema.maximum) ? schema.maximum : undefined;

    const exclusiveMinimum = isNumber(schema.exclusiveMinimum) ? schema.exclusiveMinimum : undefined;
    const exclusiveMaximum = isNumber(schema.exclusiveMaximum) ? schema.exclusiveMaximum : undefined;

    return {
      minimum: exclusiveMinimum === undefined ? minimum : undefined,
      maximum: exclusiveMaximum === undefined ? maximum : undefined,
      exclusiveMinimum,
      exclusiveMaximum,
    };
  }
}
