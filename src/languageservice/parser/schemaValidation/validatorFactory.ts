/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDraft } from '../../jsonLanguageTypes';
import type { BaseValidator } from './baseValidator';
import { Draft04Validator } from './draft04Validator';
import { Draft07Validator } from './draft07Validator';
import { Draft2019Validator } from './draft2019Validator';
import { Draft2020Validator } from './draft2020Validator';

export function getValidator(schemaDraft: SchemaDraft): BaseValidator {
  switch (schemaDraft) {
    case SchemaDraft.v4:
      return new Draft04Validator();
    case SchemaDraft.v7:
      return new Draft07Validator();
    case SchemaDraft.v2019_09:
      return new Draft2019Validator();
    case SchemaDraft.v2020_12:
      return new Draft2020Validator();
    default:
      return new Draft07Validator(); // fallback
  }
}
