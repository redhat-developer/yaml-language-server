/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corp. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export type CustomTagInputType = 'mapping' | 'scalar' | 'sequence';
export type CustomTagReturnType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

export interface CustomTag {
  tag: string;
  inputType: CustomTagInputType;
  returnType?: CustomTagReturnType;
}

const validCustomTagInputTypes: CustomTagInputType[] = ['mapping', 'scalar', 'sequence'];

const customTagReturnTypeAliases: Record<string, CustomTagReturnType> = {
  mapping: 'object',
  object: 'object',
  sequence: 'array',
  array: 'array',
  scalar: 'string',
  string: 'string',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
  null: 'null',
};

export function parseCustomTag(customTagStr: unknown): CustomTag | undefined {
  if (typeof customTagStr !== 'string') return undefined;

  const typeInfo = customTagStr.trim().split(/\s+/);
  const tag = typeInfo[0];
  if (!tag) return undefined;

  const rawType = (typeInfo[1] && typeInfo[1].toLowerCase()) || 'scalar';
  const [inputType, returnType, extra] = rawType.split(':');
  const normalizedInputType = validCustomTagInputTypes.find((validType) => validType === inputType);
  if (extra || !normalizedInputType) return undefined;
  if (!rawType.includes(':')) {
    return { tag, inputType: normalizedInputType };
  }

  const normalizedReturnType = customTagReturnTypeAliases[returnType];
  if (!normalizedReturnType) return undefined;

  return { tag, inputType: normalizedInputType, returnType: normalizedReturnType };
}

export function getCustomTagReturnType(node: unknown): CustomTagReturnType | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }

  const returnType = (node as { customTagReturnType?: unknown }).customTagReturnType;
  if (typeof returnType !== 'string') {
    return undefined;
  }

  return Object.values(customTagReturnTypeAliases).includes(returnType as CustomTagReturnType)
    ? (returnType as CustomTagReturnType)
    : undefined;
}

export function setCustomTagReturnType(node: unknown, returnType: CustomTagReturnType | undefined): void {
  if (returnType && node && typeof node === 'object') {
    (node as { customTagReturnType?: CustomTagReturnType }).customTagReturnType = returnType;
  }
}
