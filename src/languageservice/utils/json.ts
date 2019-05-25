/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

export function stringifyObject(obj: any, indent: string, stringifyLiteral: (val: any) => string) : string {
	if (obj !== null && typeof obj === 'object') {
		let newIndent = indent + '\t';
		if (Array.isArray(obj)) {
			if (obj.length === 0) {
				return '[]';
			}
			let result = '[\n';
			for (let i = 0; i < obj.length; i++) {
				result += newIndent + stringifyObject(obj[i], newIndent, stringifyLiteral);
				if (i < obj.length - 1) {
					result += ',';
				}
				result += '\n';
			}
			result += indent + ']';
			return result;
		} else {
			let keys = Object.keys(obj);
			if (keys.length === 0) {
				return '{}';
			}
			let result = '{\n';
			for (let i = 0; i < keys.length; i++) {
				let key = keys[i];
				
				result += newIndent + JSON.stringify(key) + ': ' + stringifyObject(obj[key], newIndent, stringifyLiteral);
				if (i < keys.length - 1) {
					result += ',';
				}
				result += '\n';
			}
			result += indent + '}';
			return result;
		}
	}
	return stringifyLiteral(obj);
}