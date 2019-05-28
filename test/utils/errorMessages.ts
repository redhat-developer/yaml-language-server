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
export const StringTypeError = "Incorrect type. Expected \"string\".";
export const NumberTypeError = "Incorrect type. Expected \"number\".";
export const BooleanTypeError = "Incorrect type. Expected \"boolean\".";
export const ArrayTypeError = "Incorrect type. Expected \"array\".";
export const ObjectTypeError = "Incorrect type. Expected \"object\".";

/**
 * Parse errors
 */
export const BlockMappingEntryError = "can not read a block mapping entry; a multiline key may not be an implicit key";
export const ColonMissingError = "can not read an implicit mapping pair; a colon is missed";

/**
 * Value Errors
 */
export const IncludeWithoutValueError = "!include without value";
