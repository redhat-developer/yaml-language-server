/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface StringifySettings {
  newLineFirst: boolean;
  indentFirstObject: boolean;
  shouldIndentWithTab: boolean;
}

interface StringifySettingsInternal extends StringifySettings {
  indentation: string;
  existingProps: string[];
}

export function stringifyObject(
  obj: unknown,
  indent: string,
  stringifyLiteral: (val: unknown) => string,
  settings: StringifySettingsInternal,
  depth = 0,
  consecutiveArrays = 0
): string {
  if (obj !== null && typeof obj === 'object') {
    /**
     * When we are autocompleting a snippet from a property we need the indent so everything underneath the property
     * is properly indented. When we are auto completion from a value we don't want the indent because the cursor
     * is already in the correct place
     */
    const newIndent = (depth === 0 && settings.shouldIndentWithTab) || depth > 0 ? indent + settings.indentation : '';
    if (Array.isArray(obj)) {
      consecutiveArrays += 1;
      if (obj.length === 0) {
        return '';
      }
      // don't indent the first element of the primitive array
      const newIndent = depth > 0 ? indent + settings.indentation : '';
      let result = '';
      for (let i = 0; i < obj.length; i++) {
        let pseudoObj = obj[i];
        if (typeof obj[i] !== 'object' || obj[i] === null) {
          result += '\n' + newIndent + '- ' + stringifyLiteral(obj[i]);
          continue;
        }
        if (!Array.isArray(obj[i])) {
          pseudoObj = prependToObject(obj[i], consecutiveArrays);
        }
        result += stringifyObject(
          pseudoObj,
          indent,
          stringifyLiteral,
          // overwrite the settings for array, it's valid for object type - not array
          { ...settings, newLineFirst: true, shouldIndentWithTab: false },
          depth,
          consecutiveArrays
        );
      }
      return result;
    } else {
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        return '';
      }
      let result = (depth === 0 && settings.newLineFirst) || depth > 0 ? '\n' : '';
      let isFirstProp = true;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];

        if (depth === 0 && settings.existingProps.includes(key.replace(/^[-\s]+/, ''))) {
          // Don't add existing properties to the YAML
          continue;
        }

        const isObject = typeof obj[key] === 'object';
        const colonDelimiter = isObject ? ':' : ': '; // add space only when value is primitive
        const parentArrayCompensation = isObject && /^\s|-/.test(key) ? settings.indentation : ''; // add extra space if parent is an array
        const objectIndent = newIndent + parentArrayCompensation;

        const lineBreak = isFirstProp ? '' : '\n'; // break line only if it's not the first property

        // The first child of an array needs to be treated specially, otherwise indentations will be off
        if (depth === 0 && isFirstProp && !settings.indentFirstObject) {
          const value = stringifyObject(obj[key], objectIndent, stringifyLiteral, settings, depth + 1, 0);
          result += lineBreak + indent + key + colonDelimiter + value;
        } else {
          const value = stringifyObject(obj[key], objectIndent, stringifyLiteral, settings, depth + 1, 0);
          result += lineBreak + newIndent + key + colonDelimiter + value;
        }

        isFirstProp = false;
      }
      return result;
    }
  }
  return stringifyLiteral(obj);
}

function prependToObject(obj: Record<string, unknown>, consecutiveArrays: number): Record<string, unknown> {
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
