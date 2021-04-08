/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { YAMLDocument, SingleYAMLDocument } from '../parser/yamlParser07';

export function getLineOffsets(textDocString: string): number[] {
  const lineOffsets: number[] = [];
  const text = textDocString;
  let isLineStart = true;
  for (let i = 0; i < text.length; i++) {
    if (isLineStart) {
      lineOffsets.push(i);
      isLineStart = false;
    }
    const ch = text.charAt(i);
    isLineStart = ch === '\r' || ch === '\n';
    if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
      i++;
    }
  }
  if (isLineStart && text.length > 0) {
    lineOffsets.push(text.length);
  }

  return lineOffsets;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function removeDuplicatesObj(objArray: any[]): any[] {
  const nonDuplicateSet = new Set();
  const nonDuplicateArr = [];
  for (const obj in objArray) {
    const currObj = objArray[obj];
    const stringifiedObj = JSON.stringify(currObj);
    if (!nonDuplicateSet.has(stringifiedObj)) {
      nonDuplicateArr.push(currObj);
      nonDuplicateSet.add(stringifiedObj);
    }
  }

  return nonDuplicateArr;
}

export function matchOffsetToDocument(offset: number, jsonDocuments: YAMLDocument): SingleYAMLDocument | null {
  for (const jsonDoc of jsonDocuments.documents) {
    if (jsonDoc.root && jsonDoc.root.offset <= offset && jsonDoc.root.length + jsonDoc.root.offset >= offset) {
      return jsonDoc;
    }
  }

  // TODO: Fix this so that it returns the correct document
  return null;
}

export function filterInvalidCustomTags(customTags: string[]): string[] {
  const validCustomTags = ['mapping', 'scalar', 'sequence'];

  return customTags.filter((tag) => {
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
export function isArrayEqual(fst: Array<unknown>, snd: Array<unknown>): boolean {
  if (!snd || !fst) {
    return false;
  }
  if (snd.length !== fst.length) {
    return false;
  }
  for (let index = fst.length - 1; index >= 0; index--) {
    if (fst[index] !== snd[index]) {
      return false;
    }
  }
  return true;
}
