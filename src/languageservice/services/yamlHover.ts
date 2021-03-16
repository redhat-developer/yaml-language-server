/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Hover, Position } from 'vscode-languageserver-types';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { LanguageSettings } from '../yamlLanguageService';
import { YAMLSchemaService } from './yamlSchemaService';
import { JSONHover } from 'vscode-json-languageservice/lib/umd/services/jsonHover';
import { setKubernetesParserOption } from '../parser/isKubernetes';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { yamlDocumentsCache } from '../parser/yaml-documents';

export class YAMLHover {
  private shouldHover: boolean;
  private jsonHover;

  constructor(schemaService: YAMLSchemaService) {
    this.shouldHover = true;
    this.jsonHover = new JSONHover(schemaService, [], Promise);
  }

  public configure(languageSettings: LanguageSettings): void {
    if (languageSettings) {
      this.shouldHover = languageSettings.hover;
    }
  }

  public doHover(document: TextDocument, position: Position, isKubernetes = false): Promise<Hover> {
    if (!this.shouldHover || !document) {
      return Promise.resolve(undefined);
    }
    const doc = yamlDocumentsCache.getYamlDocument(document);
    const offset = document.offsetAt(position);
    const currentDoc = matchOffsetToDocument(offset, doc);
    if (currentDoc === null) {
      return Promise.resolve(undefined);
    }

    setKubernetesParserOption(doc.documents, isKubernetes);
    const currentDocIndex = doc.documents.indexOf(currentDoc);
    currentDoc.currentDocIndex = currentDocIndex;
    return this.jsonHover.doHover(document, position, currentDoc);
  }
}
