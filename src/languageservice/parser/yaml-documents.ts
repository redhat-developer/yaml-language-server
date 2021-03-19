/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { YAMLDocument, parse as parseYAML } from './yamlParser07';

interface YamlCachedDocument {
  version: number;
  document: YAMLDocument;
}
export class YamlDocuments {
  // a mapping of URIs to cached documents
  private cache = new Map<string, YamlCachedDocument>();

  getYamlDocument(document: TextDocument, customTags: string[] = []): YAMLDocument {
    this.ensureCache(document, customTags);
    return this.cache.get(document.uri).document;
  }

  /**
   * For test purpose only!
   */
  clear(): void {
    this.cache.clear();
  }

  private ensureCache(document: TextDocument, customTags: string[]): void {
    const key = document.uri;
    if (!this.cache.has(key)) {
      this.cache.set(key, { version: -1, document: new YAMLDocument([]) });
    }

    if (this.cache.get(key).version !== document.version) {
      let text = document.getText();
      // if text is contains only whitespace wrap all text in object to force schema selection
      if (!/\S/.test(text)) {
        text = `{${text}}`;
      }
      const doc = parseYAML(text, customTags);
      this.cache.get(key).document = doc;
      this.cache.get(key).version = document.version;
    }
  }
}

export const yamlDocumentsCache = new YamlDocuments();
