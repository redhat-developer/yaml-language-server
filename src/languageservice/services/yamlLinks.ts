/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { findLinks as JSONFindLinks } from 'vscode-json-languageservice/lib/umd/services/jsonLinks';
import { DocumentLink } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Telemetry } from '../telemetry';
import { yamlDocumentsCache } from '../parser/yaml-documents';

export class YamlLinks {
  constructor(private readonly telemetry?: Telemetry) {}

  findLinks(document: TextDocument): Promise<DocumentLink[]> {
    try {
      const doc = yamlDocumentsCache.getYamlDocument(document);
      // Find links across all YAML Documents then report them back once finished
      const linkPromises = [];
      for (const yamlDoc of doc.documents) {
        linkPromises.push(JSONFindLinks(document, yamlDoc));
      }
      // Wait for all the promises to return and then flatten them into one DocumentLink array
      return Promise.all(linkPromises).then((yamlLinkArray) => [].concat(...yamlLinkArray));
    } catch (err) {
      this.telemetry?.sendError('yaml.documentLink.error', err);
    }
  }
}
