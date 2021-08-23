/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeLens, Range } from 'vscode-languageserver-types';
import { YamlCommands } from '../../commands';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { YAMLSchemaService } from './yamlSchemaService';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { JSONSchema, JSONSchemaRef } from '../jsonSchema';
import { CodeLensParams } from 'vscode-languageserver-protocol';
import { isBoolean } from '../utils/objects';
import { Telemetry } from '../../languageserver/telemetry';

export class YamlCodeLens {
  constructor(private schemaService: YAMLSchemaService, private readonly telemetry: Telemetry) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getCodeLens(document: TextDocument, params: CodeLensParams): Promise<CodeLens[]> {
    const yamlDocument = yamlDocumentsCache.getYamlDocument(document);
    const result = [];
    try {
      for (const currentYAMLDoc of yamlDocument.documents) {
        const schema = await this.schemaService.getSchemaForResource(document.uri, currentYAMLDoc);
        if (schema?.schema) {
          const schemaUrls = getSchemaUrl(schema?.schema);
          if (schemaUrls.size === 0) {
            continue;
          }
          for (const urlToSchema of schemaUrls) {
            const lens = CodeLens.create(Range.create(0, 0, 0, 0));
            lens.command = {
              title: getCommandTitle(urlToSchema[0], urlToSchema[1]),
              command: YamlCommands.JUMP_TO_SCHEMA,
              arguments: [urlToSchema[0]],
            };
            result.push(lens);
          }
        }
      }
    } catch (err) {
      this.telemetry.sendError('yaml.codeLens.error', { error: err, documentUri: document.uri });
    }

    return result;
  }
  resolveCodeLens(param: CodeLens): Thenable<CodeLens> | CodeLens {
    return param;
  }
}

function getCommandTitle(url: string, schema: JSONSchema): string {
  const uri = URI.parse(url);
  let baseName = path.basename(uri.fsPath);
  if (!path.extname(uri.fsPath)) {
    baseName += '.json';
  }
  if (Object.getOwnPropertyDescriptor(schema, 'name')) {
    return Object.getOwnPropertyDescriptor(schema, 'name').value + ` (${baseName})`;
  } else if (schema.title) {
    return schema.title + ` (${baseName})`;
  }

  return baseName;
}

function getSchemaUrl(schema: JSONSchema): Map<string, JSONSchema> {
  const result = new Map<string, JSONSchema>();
  if (!schema) {
    return result;
  }
  const url = schema.url;
  if (url) {
    if (url.startsWith('schemaservice://combinedSchema/')) {
      addSchemasForOf(schema, result);
    } else {
      result.set(schema.url, schema);
    }
  } else {
    addSchemasForOf(schema, result);
  }
  return result;
}

function addSchemasForOf(schema: JSONSchema, result: Map<string, JSONSchema>): void {
  if (schema.allOf) {
    addInnerSchemaUrls(schema.allOf, result);
  }
  if (schema.anyOf) {
    addInnerSchemaUrls(schema.anyOf, result);
  }
  if (schema.oneOf) {
    addInnerSchemaUrls(schema.oneOf, result);
  }
}

function addInnerSchemaUrls(schemas: JSONSchemaRef[], result: Map<string, JSONSchema>): void {
  for (const subSchema of schemas) {
    if (!isBoolean(subSchema)) {
      if (subSchema.url && !result.has(subSchema.url)) {
        result.set(subSchema.url, subSchema);
      }
    }
  }
}
