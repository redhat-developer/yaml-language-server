/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line: no-any
export interface StringifySettings {
    newLineFirst: boolean;
    indentFirstObject: boolean;
    shouldIndentWithTab: boolean;
}

// tslint:disable-next-line: no-any
export function stringifyObject(obj: any, indent: string, stringifyLiteral: (val: any) => string, settings: StringifySettings, depth = 0): string {
    if (obj !== null && typeof obj === 'object') {

        /**
         * When we are autocompleting a snippet from a property we need the indent so everything underneath the property
         * is propertly indented. When we are auto completion from a value we don't want the indent because the cursor
         * is already in the correct place
         */
        let newIndent = ((depth === 0 && settings.shouldIndentWithTab) || depth > 0) ? (indent + '  ') : '';
        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return '';
            }
            let result = ((depth === 0 && settings.newLineFirst) || depth > 0) ? '\n' : '';
            for (let i = 0; i < obj.length; i++) {
                result += newIndent + stringifyObject(obj[i], indent, stringifyLiteral, settings, depth += 1);
                if (i < obj.length - 1) {
                    result += '\n';
                }
            }
            result += indent;
            return result;
        } else {
            let keys = Object.keys(obj);
            if (keys.length === 0) {
                return '';
            }
            let result = ((depth === 0 && settings.newLineFirst) || depth > 0) ? '\n' : '';
            for (let i = 0; i < keys.length; i++) {
                let key = keys[i];

                // The first child of an array needs to be treated specially, otherwise identations will be off
                if (depth === 0 && i === 0 && !settings.indentFirstObject) {
                    result += indent + key + ': ' + stringifyObject(obj[key], newIndent, stringifyLiteral, settings, depth += 1);
                } else {
                    result += newIndent + key + ': ' + stringifyObject(obj[key], newIndent, stringifyLiteral, settings, depth += 1);
                }
                if (i < keys.length - 1) {
                    result += '\n';
                }
            }
            result += indent;
            return result;
        }
    }
    return stringifyLiteral(obj);
}
