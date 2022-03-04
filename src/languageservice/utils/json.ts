/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface StringifySettings {
  newLineFirst: boolean;
  indentFirstObject: boolean;
  shouldIndentWithTab: boolean;
}

export function stringifyObject(
  obj: unknown,
  indent: string,
  stringifyLiteral: (val: unknown) => string,
  settings: StringifySettings,
  depth = 0,
  consecutiveArrays = 0
): string {
  if (obj !== null && typeof obj === 'object') {
    /**
     * When we are autocompleting a snippet from a property we need the indent so everything underneath the property
     * is propertly indented. When we are auto completion from a value we don't want the indent because the cursor
     * is already in the correct place
     */
    const newIndent = (depth === 0 && settings.shouldIndentWithTab) || depth > 0 ? indent + '  ' : '';
    if (Array.isArray(obj)) {
      consecutiveArrays += 1;
      if (obj.length === 0) {
        return '';
      }
      let result = '';
      for (let i = 0; i < obj.length; i++) {
        let pseudoObj = obj[i];
        if (typeof obj[i] !== 'object') {
          result += '\n' + newIndent + '- ' + stringifyLiteral(obj[i]);
          continue;
        }
        if (!Array.isArray(obj[i])) {
          pseudoObj = preprendToObject(obj[i], consecutiveArrays);
        }
        result += stringifyObject(pseudoObj, indent, stringifyLiteral, settings, (depth += 1), consecutiveArrays);
      }
      return result;
    } else {
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        return '';
      }
      let result = (depth === 0 && settings.newLineFirst) || depth > 0 ? '\n' : '';
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const isObject = typeof obj[key] === 'object';
        const colonDelimiter = isObject ? ':' : ': '; // add space only when value is primitive
        const parentArrayCompensation = isObject && /^\s|-/.test(key) ? '  ' : ''; // add extra space if parent is an array
        const objectIndent = newIndent + parentArrayCompensation;

        // The first child of an array needs to be treated specially, otherwise identations will be off
        if (depth === 0 && i === 0 && !settings.indentFirstObject) {
          const value = stringifyObject(obj[key], objectIndent, stringifyLiteral, settings, (depth += 1), 0);
          result += indent + key + colonDelimiter + value;
        } else {
          const value = stringifyObject(obj[key], objectIndent, stringifyLiteral, settings, (depth += 1), 0);
          result += newIndent + key + colonDelimiter + value;
        }
        if (i < keys.length - 1) {
          result += '\n';
        }
      }
      return result;
    }
  }
  return stringifyLiteral(obj);
}

function preprendToObject(obj: Record<string, unknown>, consecutiveArrays: number): Record<string, unknown> {
  const newObj = {};
  for (let i = 0; i < Object.keys(obj).length; i++) {
    const key = Object.keys(obj)[i];
    if (i === 0) {
      newObj['- '.repeat(consecutiveArrays) + key] = obj[key];
    } else {
      newObj['  '.repeat(consecutiveArrays) + key] = obj[key];
    }
  }
  return newObj;
}
