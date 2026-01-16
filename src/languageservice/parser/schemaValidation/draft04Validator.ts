/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { JSONSchema } from '../../jsonSchema';
import { isBoolean, isNumber } from '../../utils/objects';
import { BaseValidator } from './baseValidator';

/**
 * Keyword: exclusiveMinimum/exclusiveMaximum
 *
 * Booleans that make minimum/maximum exclusive.
 */
export class Draft04Validator extends BaseValidator {
  protected override getNumberLimits(schema: JSONSchema): {
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
  } {
    const minimum = isNumber(schema.minimum) ? schema.minimum : undefined;
    const maximum = isNumber(schema.maximum) ? schema.maximum : undefined;

    const exMin = schema.exclusiveMinimum;
    const exMax = schema.exclusiveMaximum;

    const exclusiveMinimum = isBoolean(exMin) && exMin ? minimum : undefined;
    const exclusiveMaximum = isBoolean(exMax) && exMax ? maximum : undefined;

    return {
      minimum: exclusiveMinimum === undefined ? minimum : undefined,
      maximum: exclusiveMaximum === undefined ? maximum : undefined,
      exclusiveMinimum,
      exclusiveMaximum,
    };
  }
}
