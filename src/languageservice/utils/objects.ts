/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export function equals(one: any, other: any): boolean {
  if (one === other) {
    return true;
  }
  if (one === null || one === undefined || other === null || other === undefined) {
    return false;
  }
  if (typeof one !== typeof other) {
    return false;
  }
  if (typeof one !== 'object') {
    return false;
  }
  if (Array.isArray(one) !== Array.isArray(other)) {
    return false;
  }

  let i: number, key: string;

  if (Array.isArray(one)) {
    if (one.length !== other.length) {
      return false;
    }
    for (i = 0; i < one.length; i++) {
      if (!equals(one[i], other[i])) {
        return false;
      }
    }
  } else {
    const oneKeys: string[] = [];

    for (key in one) {
      oneKeys.push(key);
    }
    oneKeys.sort();
    const otherKeys: string[] = [];
    for (key in other) {
      otherKeys.push(key);
    }
    otherKeys.sort();
    if (!equals(oneKeys, otherKeys)) {
      return false;
    }
    for (i = 0; i < oneKeys.length; i++) {
      if (!equals(one[oneKeys[i]], other[oneKeys[i]])) {
        return false;
      }
    }
  }
  return true;
}

export function isNumber(val: unknown): val is number {
  return typeof val === 'number';
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function isDefined(val: unknown): val is object {
  return typeof val !== 'undefined';
}

export function isBoolean(val: unknown): val is boolean {
  return typeof val === 'boolean';
}

export function isString(val: unknown): val is string {
  return typeof val === 'string';
}

/**
 * Check that provided value is Iterable
 * @param val the value to check
 * @returns true if val is iterable, false otherwise
 */
export function isIterable(val: unknown): boolean {
  return Symbol.iterator in Object(val);
}
