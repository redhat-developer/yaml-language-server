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
import { isMap, isPair, isScalar } from 'yaml';
import { findUsages, toExportedPos, toExportedRange } from './gitlabciUtils';
import { URI } from 'vscode-uri';
import { SettingsState } from '../../yamlSettings';

export class YamlCodeLens {
  constructor(
    private schemaService: YAMLSchemaService,
    private readonly telemetry?: Telemetry,
    private readonly settings?: SettingsState
  ) {}

  async getCodeLens(document: TextDocument): Promise<CodeLens[]> {
    const result = [];
    try {
      const yamlDocument = yamlDocumentsCache.getYamlDocument(document);

      if (this.settings?.gitlabci?.enabled && this.settings?.gitlabci?.codelensEnabled) {
        // GitlabCI Job Usages
        const usages = findUsages(yamlDocumentsCache.getAllDocuments());
        for (const doc of yamlDocument.documents) {
          if (isMap(doc.internalDocument.contents)) {
            for (const jobNode of doc.internalDocument.contents.items) {
              // If at least one usage
              if (isPair(jobNode) && isScalar(jobNode.key) && usages.has(jobNode.key.value as string)) {
                const jobUsages = usages.get(jobNode.key.value as string);
                const nodeRange = Range.create(
                  document.positionAt(jobNode.key.range[0]),
                  document.positionAt(jobNode.key.range[1])
                );
                const lens = CodeLens.create(nodeRange);
                // Locations for all usages
                const locations = [];
                for (const loc of jobUsages) {
                  locations.push({
                    uri: URI.parse(loc.targetUri),
                    range: toExportedRange(loc.targetRange),
                  });
                }
                lens.command = {
                  title: jobUsages.length === 1 ? '1 usage' : `${jobUsages.length} usages`,
                  command: 'editor.action.peekLocations',
                  arguments: [URI.parse(document.uri), toExportedPos(nodeRange.end), locations],
                };

                result.push(lens);
              }
            }
          }
        }
      }

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
