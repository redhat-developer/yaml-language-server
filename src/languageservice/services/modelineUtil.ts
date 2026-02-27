/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SingleYAMLDocument } from '../parser/yamlParser07';
import { JSONDocument } from '../parser/jsonDocument';

/**
 * Retrieve schema if declared as modeline.
 * Public for testing purpose, not part of the API.
 * @param doc
 */
export function getSchemaFromModeline(doc: SingleYAMLDocument | JSONDocument): string {
  if (doc instanceof SingleYAMLDocument) {
    const yamlLanguageServerModeline = doc.lineComments.find((lineComment) => {
      return isModeline(lineComment);
    });
    if (yamlLanguageServerModeline != undefined) {
      const schemaMatchs = yamlLanguageServerModeline.match(/\$schema[=:]\s*(\S+)/);
      if (schemaMatchs !== null && schemaMatchs.length >= 1) {
        if (schemaMatchs.length >= 2) {
          console.log(
            'Several $schema attributes have been found on the yaml-language-server modeline. The first one will be picked.'
          );
        }
        return schemaMatchs[1];
      }
    }
  }
  return undefined;
}

export function isModeline(lineText: string): boolean {
  const matchModeline = lineText.match(/^#\s+(?:yaml-language-server\s*:|\$schema[=:])/g);
  return matchModeline !== null && matchModeline.length === 1;
}
