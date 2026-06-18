/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Forked from vscode-json-languageservice@6.0.0-next.1
// Source: https://github.com/microsoft/vscode-json-languageservice/blob/810471bbb462bb6b87351c2232e209a3bb4062ca/src/utils/strings.ts

export function startsWith(haystack: string, needle: string): boolean {
  if (haystack.length < needle.length) {
    return false;
  }

  for (let i = 0; i < needle.length; i++) {
    if (haystack[i] !== needle[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Determines if haystack ends with needle.
 */
export function endsWith(haystack: string, needle: string): boolean {
  const diff = haystack.length - needle.length;
  if (diff > 0) {
    return haystack.lastIndexOf(needle) === diff;
  } else if (diff === 0) {
    return haystack === needle;
  } else {
    return false;
  }
}

export function convertSimple2RegExpPattern(pattern: string): string {
  return pattern.replace(/[-\\{}+?|^$.,[]()#\s]/g, '\\$&').replace(/[*]/g, '.*');
}

export function repeat(value: string, count: number): string {
  let s = '';
  while (count > 0) {
    if ((count & 1) === 1) {
      s += value;
    }
    value += value;
    count = count >>> 1;
  }
  return s;
}

export function extendedRegExp(pattern: string): RegExp | undefined {
  let flags = '';
  if (startsWith(pattern, '(?i)')) {
    pattern = pattern.substring(4);
    flags = 'i';
  }
  try {
    return new RegExp(pattern, flags + 'u');
  } catch {
    // could be an exception due to the 'u ' flag
    try {
      return new RegExp(pattern, flags);
    } catch {
      // invalid pattern
      return undefined;
    }
  }
}

// from https://tanishiking.github.io/posts/count-unicode-codepoint/#work-hard-with-for-statements
export function stringLength(str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    count++;
    // obtain the i-th 16-bit
    const code = str.charCodeAt(i);
    if (0xd800 <= code && code <= 0xdbff) {
      // if the i-th 16bit is an upper surrogate
      // skip the next 16 bits (lower surrogate)
      i++;
    }
  }
  return count;
}
