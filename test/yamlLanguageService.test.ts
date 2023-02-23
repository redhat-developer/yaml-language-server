/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assert } from 'chai';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { getLanguageService, LanguageService, SchemaRequestService, WorkspaceContextService } from '../src';
import { workspaceContext } from '../src/languageservice/services/schemaRequestHandler';
import { caretPosition, setupSchemaIDTextDocument } from './utils/testHelper';

/**
 * Builds a simple schema request service
 * @param contentMap Mapping of a schema uri to the schema content
 */
function schemaRequestServiceBuilder(contentMap: { [uri: string]: string }): SchemaRequestService {
  return async (uri: string) => {
    return contentMap[uri];
  };
}

describe('getLanguageService()', () => {
  it('successfully creates an instance without optional arguments', () => {
    getLanguageService({
      schemaRequestService: {} as SchemaRequestService,
      workspaceContext: {} as WorkspaceContextService,
    });
  });

  describe('minimal language service hover happy path', () => {
    const schemaUri = 'my.schema.uri';
    const schemaContentMap: { [uri: string]: string } = {};

    let schemaRequestService: SchemaRequestService;
    let textDocument: TextDocument;
    let hoverPosition: Position; // Position the 'mouse' is hovering on the content
    let minimalYamlService: LanguageService;

    before(async () => {
      // Setup object that resolves schema content
      schemaContentMap[schemaUri] = `
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
            "properties": {
                "firstName": {
                "type": "string",
                "description": "The person's first name."
                }
            }
        }
      `;
      schemaRequestService = schemaRequestServiceBuilder(schemaContentMap);

      // Setup the document and where the hover is on it
      const contentWithHoverPosition = 'fi|r|stName: "Nikolas"';
      const { content, position: offset } = caretPosition(contentWithHoverPosition);
      textDocument = setupSchemaIDTextDocument(content);
      hoverPosition = textDocument.positionAt(offset);

      // Setup minimal language service + indicate to provide hover functionality
      minimalYamlService = getLanguageService({
        schemaRequestService: schemaRequestService,
        workspaceContext: workspaceContext,
      });
      minimalYamlService.configure({
        hover: true,
        schemas: [
          {
            fileMatch: [textDocument.uri],
            uri: schemaUri,
          },
        ],
      });
    });

    it('successfully creates an instance without optional arguments', async () => {
      const result = await minimalYamlService.doHover(textDocument, hoverPosition);

      assert.deepEqual(result, {
        contents: {
          kind: 'markdown',
          value: "The person's first name\\.\n\nSource: [my.schema.uri](my.schema.uri)",
        },
        range: {
          start: {
            line: 0,
            character: 0,
          },
          end: {
            line: 0,
            character: 9,
          },
        },
      });
    });
  });
});
