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

export function stringifyObject(obj: any, indent: string, stringifyLiteral: (val: any) => string, settings: StringifySettings): string {
    if (obj !== null && typeof obj === 'object') {
        const newIndent = settings.shouldIndentWithTab ? (indent + '\t') : indent;
        const keys = Object.keys(obj);
        if (keys.length === 0) {
            return '';
        }
        let result = settings.newLineFirst ? '\n' : '';
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (i === 0 && !settings.indentFirstObject) {
                result += indent + key + ': ' + stringifyObject(obj[key], newIndent, stringifyLiteral, settings);
            } else {
                result += newIndent + key + ': ' + stringifyObject(obj[key], newIndent, stringifyLiteral, settings);
            }
            result += '\n';
        }
        result += indent;
        return result;
    }
    return stringifyLiteral(obj);
}
