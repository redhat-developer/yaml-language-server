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
  if ((doc instanceof SingleYAMLDocument || doc instanceof JSONDocument) && doc.root?.type === 'object') {
    let dollarSchema: string | undefined = undefined;
    for (const property of doc.root.properties) {
      if (property.keyNode?.value === '$schema' && typeof property.valueNode?.value === 'string') {
        dollarSchema = property.valueNode?.value;
        break;
      }
    }
    if (typeof dollarSchema === 'string') {
      return dollarSchema;
    }
    if (dollarSchema) {
      console.log('The $schema attribute is not a string, and will be ignored');
    }
  }
  return undefined;
}
