/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { parse as parseYAML } from '../parser/yamlParser07';
import { findLinks as JSONFindLinks } from 'vscode-json-languageservice/lib/umd/services/jsonLinks';
import { DocumentLink } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

export function findLinks(document: TextDocument): Promise<DocumentLink[]> {
  const doc = parseYAML(document.getText());
  // Find links across all YAML Documents then report them back once finished
  const linkPromises = [];
  for (const yamlDoc of doc.documents) {
    linkPromises.push(JSONFindLinks(document, yamlDoc));
  }
  // Wait for all the promises to return and then flatten them into one DocumentLink array
  return Promise.all(linkPromises).then((yamlLinkArray) => [].concat(...yamlLinkArray));
}
