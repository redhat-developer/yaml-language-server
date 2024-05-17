/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SingleYAMLDocument } from '../parser/yamlParser07';
import { JSONDocument } from '../parser/jsonParser07';

/**
 * Retrieve schema if declared by `$schema`.
 * Public for testing purpose, not part of the API.
 * @param doc
 */
export function getDollarSchema(doc: SingleYAMLDocument | JSONDocument): string | undefined {
  if (doc instanceof SingleYAMLDocument && doc.root && doc.root.type === 'object') {
    let dollarSchema = doc.root.properties['$schema'];
    dollarSchema = typeof dollarSchema === 'string' ? dollarSchema.trim() : undefined;
    if (typeof dollarSchema === 'string') {
      return dollarSchema.trim();
    }
    if (dollarSchema) {
      console.log('The $schema attribute is not a string, and will be ignored');
    }
  }
  return undefined;
}
