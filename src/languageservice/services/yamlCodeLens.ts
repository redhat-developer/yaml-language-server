/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeLens, Range } from 'vscode-languageserver-types';
import { YamlCommands } from '../../commands.ts';
import { yamlDocumentsCache } from '../parser/yaml-documents.ts';
import { YAMLSchemaService } from './yamlSchemaService.ts';
import { JSONSchema } from '../jsonSchema.ts';
import { Telemetry } from '../telemetry.ts';
import { getSchemaUrls } from '../utils/schemaUrls.ts';
import { getSchemaTitle } from '../utils/schemaUtils.ts';

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
