/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeLens, Range } from 'vscode-languageserver-types';
import { YamlCommands } from '../../commands';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { YAMLSchemaService } from './yamlSchemaService';
import { JSONSchema } from '../jsonSchema';
import { Telemetry } from '../telemetry';
import { getSchemaUrls } from '../utils/schemaUrls';
import { getSchemaTitle } from '../utils/schemaUtils';

export class YamlCodeLens {
  constructor(
    private schemaService: YAMLSchemaService,
    private readonly telemetry?: Telemetry
  ) {}

  async getCodeLens(document: TextDocument): Promise<CodeLens[]> {
    const result = [];
    try {
      const yamlDocument = yamlDocumentsCache.getYamlDocument(document);
      let schemaUrls = new Map<string, JSONSchema>();
      for (const currentYAMLDoc of yamlDocument.documents) {
        const schema = await this.schemaService.getSchemaForResource(document.uri, currentYAMLDoc);
        if (schema?.schema) {
          // merge schemas from all docs to avoid duplicates
          schemaUrls = new Map([...getSchemaUrls(schema?.schema), ...schemaUrls]);
        }
      }
      for (const urlToSchema of schemaUrls) {
        const lens = CodeLens.create(Range.create(0, 0, 0, 0));
        lens.command = {
          title: getSchemaTitle(urlToSchema[1], urlToSchema[0]),
          command: YamlCommands.JUMP_TO_SCHEMA,
          arguments: [urlToSchema[0]],
        };
        result.push(lens);
      }
    } catch (err) {
      this.telemetry?.sendError('yaml.codeLens.error', err);
    }

    return result;
  }
  resolveCodeLens(param: CodeLens): PromiseLike<CodeLens> | CodeLens {
    return param;
  }
}
