/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SingleYAMLDocument } from "../parser/yamlParser";

export function removeDuplicates(arr, prop) {
    var new_arr = [];
    var lookup  = {};

    for (var i in arr) {
        lookup[arr[i][prop]] = arr[i];
    }

    for (i in lookup) {
        new_arr.push(lookup[i]);
    }

    return new_arr;
}

export function getLineOffsets(textDocString: String): number[] {
		
		let lineOffsets: number[] = [];
		let text = textDocString;
		let isLineStart = true;
		for (let i = 0; i < text.length; i++) {
			if (isLineStart) {
				lineOffsets.push(i);
				isLineStart = false;
			}
			let ch = text.charAt(i);
			isLineStart = (ch === '\r' || ch === '\n');
			if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
				i++;
			}
		}
		if (isLineStart && text.length > 0) {
			lineOffsets.push(text.length);
		}
		
		return lineOffsets;
}

export function removeDuplicatesObj(objArray){
	
	let nonDuplicateSet = new Set();
	let nonDuplicateArr = [];
	for(let obj in objArray){

		let currObj = objArray[obj];
		let stringifiedObj = JSON.stringify(currObj);
		if(!nonDuplicateSet.has(stringifiedObj)){
			nonDuplicateArr.push(currObj);
			nonDuplicateSet.add(stringifiedObj);
		}

	}

	return nonDuplicateArr;

}

export function matchOffsetToDocument(offset: number, jsonDocuments): SingleYAMLDocument {
	
	for(let jsonDoc in jsonDocuments.documents){
		let currJsonDoc = jsonDocuments.documents[jsonDoc];
		if(currJsonDoc.root && currJsonDoc.root.end >= offset && currJsonDoc.root.start <= offset){
			return currJsonDoc;
		}
	}

	return null;

}

export function filterInvalidCustomTags(customTags: String[]): String[] {
	const validCustomTags = ['mapping', 'scalar', 'sequence'];

	return customTags.filter(tag => {
		if (typeof tag === 'string') {
			const typeInfo = tag.split(' ');
			const type = (typeInfo[1] && typeInfo[1].toLowerCase()) || 'scalar';

			// We need to check if map is a type because map will throw an error within the yaml-ast-parser
			if (type === 'map') {
				return false;
			}

			return validCustomTags.indexOf(type) !== -1;
		}
		return false;
	});
}