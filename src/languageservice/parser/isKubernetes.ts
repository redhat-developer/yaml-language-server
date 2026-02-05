/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FilePatternAssociation } from '../utils/filePatternAssociation';
import * as Parser from './jsonDocument';

export function setKubernetesParserOption(jsonDocuments: Parser.JSONDocument[], option: boolean): void {
  for (const jsonDoc of jsonDocuments) {
    jsonDoc.isKubernetes = option;
  }
}

export function isKubernetesAssociatedDocument(textDocument: TextDocument, paths: string[]): boolean {
  for (const path in paths) {
    const globPath = paths[path];
    const fpa = new FilePatternAssociation(globPath);

    if (fpa.matchesPattern(textDocument.uri)) {
      return true;
    }
  }
  return false;
}
