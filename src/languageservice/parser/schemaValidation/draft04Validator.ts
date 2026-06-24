/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { JSONSchema } from '../../jsonSchema';

import { BaseValidator } from './baseValidator';
import { SchemaDraft } from '../../jsonLanguageTypes';
import { isBoolean, isNumber } from '../../utils/objects';

export class Draft04Validator extends BaseValidator {
  protected override getCurrentSchemaDraft(): SchemaDraft {
    return SchemaDraft.v4;
  }

  /**
   * Keyword: exclusiveMinimum/exclusiveMaximum
   *
   * Booleans that make minimum/maximum exclusive.
   */
  protected override getNumberLimits(schema: JSONSchema): {
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
  } {
    const minimum = isNumber(schema.minimum) ? schema.minimum : undefined;
    const maximum = isNumber(schema.maximum) ? schema.maximum : undefined;

    const exclusiveMinimum = isBoolean(schema.exclusiveMinimum) && schema.exclusiveMinimum ? minimum : undefined;
    const exclusiveMaximum = isBoolean(schema.exclusiveMaximum) && schema.exclusiveMaximum ? maximum : undefined;

    return {
      minimum: exclusiveMinimum === undefined ? minimum : undefined,
      maximum: exclusiveMaximum === undefined ? maximum : undefined,
      exclusiveMinimum,
      exclusiveMaximum,
    };
  }
}
