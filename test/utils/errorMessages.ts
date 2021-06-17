/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * List of error messages
 */

/**
 * Type Errors
 */
export const StringTypeError = 'Incorrect type. Expected "string".';
export const NumberTypeError = 'Incorrect type. Expected "number".';
export const BooleanTypeError = 'Incorrect type. Expected "boolean".';
export const ArrayTypeError = 'Incorrect type. Expected "array".';
export const ObjectTypeError = 'Incorrect type. Expected "object".';
export const TypeMismatchWarning = 'Incorrect type. Expected "{0}".';
export const MissingRequiredPropWarning = 'Missing property "{0}".';
export const ConstWarning = 'Value must be {0}.';

export function propertyIsNotAllowed(name: string): string {
  return `Property ${name} is not allowed.`;
}

/**
 * Parse errors
 */
export const BlockMappingEntryError = 'Implicit map keys need to be followed by map values';

/**
 * Value Errors
 */
export const IncludeWithoutValueError = '!include without value';

/**
 * Duplicate Key error
 */
export const DuplicateKeyError = 'Map keys must be unique';
