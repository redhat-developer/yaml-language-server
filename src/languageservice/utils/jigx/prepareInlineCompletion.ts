/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ObjectASTNode } from '../../jsonASTTypes';
import { parse as parseYAML, SingleYAMLDocument } from '../../parser/yamlParser07';
import { matchOffsetToDocument } from '../arrUtils';

export function prepareInlineCompletion(text: string): { doc: SingleYAMLDocument; node: ObjectASTNode; rangeOffset: number } {
  let newText = '';
  let rangeOffset = 0;
  // Check if document contains only white spaces and line delimiters
  if (text.trim().length === 0) {
    // add empty object to be compatible with JSON
    newText = `{${text}}\n`;
  } else {
    rangeOffset = text.length - text.lastIndexOf('.') - 1;
    let index = 0;
    newText = text.replace(/\./g, () => {
      index++;
      return ':\n' + ' '.repeat(index * 2);
    });
  }
  const parsedDoc = parseYAML(newText);
  const offset = newText.length;
  const doc = matchOffsetToDocument(offset, parsedDoc);
  const node = doc.getNodeFromOffsetEndInclusive(newText.trim().length) as ObjectASTNode;
  return { doc, node, rangeOffset };
}
