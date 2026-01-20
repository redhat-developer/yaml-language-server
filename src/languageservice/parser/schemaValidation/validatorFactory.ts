/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDialect } from '../../jsonSchema';
import { BaseValidator } from './baseValidator';
import { Draft04Validator } from './draft04Validator';
import { Draft07Validator } from './draft07Validator';
import { Draft2019Validator } from './draft2019Validator';
import { Draft2020Validator } from './draft2020Validator';

export function getValidator(dialect: SchemaDialect): BaseValidator {
  switch (dialect) {
    case SchemaDialect.draft04:
      return new Draft04Validator();
    case SchemaDialect.draft07:
      return new Draft07Validator();
    case SchemaDialect.draft2019:
      return new Draft2019Validator();
    case SchemaDialect.draft2020:
      return new Draft2020Validator();
    case SchemaDialect.undefined:
    default:
      return new Draft07Validator(); // fallback
  }
}
