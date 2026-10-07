/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeLens, Range } from 'vscode-languageserver-types';
import { YamlCommands } from '../../commands.js';
import { yamlDocumentsCache } from '../parser/yaml-documents.js';
import type { YAMLSchemaService } from './yamlSchemaService.js';
import type { Telemetry } from '../telemetry.js';
import { getSchemaUrls } from '../utils/schemaUrls.js';
import { getSchemaTitle } from '../utils/schemaUtils.js';

export class YamlCodeLens {
  constructor(
    private schemaService: YAMLSchemaService,
    private readonly telemetry?: Telemetry
  ) {}

  async getCodeLens(document: TextDocument): Promise<CodeLens[]> {
    const result = [];
    try {
      const yamlDocument = yamlDocumentsCache.getYamlDocument(document);
      for (const [index, currentYAMLDoc] of yamlDocument.documents.entries()) {
        currentYAMLDoc.currentDocIndex = index;
        const schema = await this.schemaService.getSchemaForResource(document.uri, currentYAMLDoc);
        if (!schema?.schema) {
          continue;
        }

        const schemaUrls = getSchemaUrls(schema.schema);
        const documentOffset = currentYAMLDoc.root?.offset ?? currentYAMLDoc.internalDocument?.range?.[0] ?? 0;
        let documentPosition = document.positionAt(documentOffset);
        if (currentYAMLDoc.root?.length === 0 && documentPosition.character > 0) {
          documentPosition = { line: documentPosition.line + 1, character: 0 };
        }
        const documentRange = Range.create(documentPosition, documentPosition);

        for (const urlToSchema of schemaUrls) {
          const lens = CodeLens.create(documentRange);
          lens.command = {
            title: getSchemaTitle(urlToSchema[1], urlToSchema[0]),
            command: YamlCommands.JUMP_TO_SCHEMA,
            arguments: [urlToSchema[0]],
          };
          result.push(lens);
        }
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
