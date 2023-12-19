/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServiceSetup } from './utils/serviceSetup';
import {
  caretPosition,
  SCHEMA_ID,
  setupLanguageService,
  setupSchemaIDTextDocument,
  TestCustomSchemaProvider,
} from './utils/testHelper';
import * as assert from 'assert';
import { Hover, MarkupContent, Position } from 'vscode-languageserver-types';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { expect } from 'chai';
import { TestTelemetry } from './utils/testsTypes';

describe('Hover Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;
  let telemetry: TestTelemetry;
  let schemaProvider: TestCustomSchemaProvider;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withHover().withSchemaFileMatch({
      uri: 'http://google.com',
      fileMatch: ['bad-schema.yaml'],
    });
    const {
      languageHandler: langHandler,
      yamlSettings: settings,
      telemetry: testTelemetry,
      schemaProvider: testSchemaProvider,
    } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageHandler = langHandler;
    yamlSettings = settings;
    telemetry = testTelemetry;
    schemaProvider = testSchemaProvider;
  });

  afterEach(() => {
    schemaProvider.deleteSchema(SCHEMA_ID);
  });

  /**
   * Generates hover information for the given document and caret (cursor) position.
   * @param content The content of the document.
   * @param position The position of the caret in the document.
   * Alternatively, `position` can be omitted if the caret is located in the content using `|` bookends.
   * For example, `content = 'ab|c|d'` places the caret over the `'c'`, at `position = 2`
   * @returns An instance of `Hover`.
   */
  function parseSetup(content: string, position?: number): Promise<Hover> {
    if (typeof position === 'undefined') {
      ({ content, position } = caretPosition(content));
    }

    const testTextDocument = setupSchemaIDTextDocument(content);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return languageHandler.hoverHandler({
      position: testTextDocument.positionAt(position),
      textDocument: testTextDocument,
    });
  }

  describe('Hover', function () {
    it('Hover on key on root', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description:
              'The directory from which bower should run. All relative paths will be calculated according to this setting.',
          },
        },
      });
      const content = 'c|w|d: test'; // len: 9, pos: 1
      const hover = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(hover.contents), true);
      assert.strictEqual((hover.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (hover.contents as MarkupContent).value,
        `The directory from which bower should run\\. All relative paths will be calculated according to this setting\\.\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover on value on root', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description:
              'The directory from which bower should run. All relative paths will be calculated according to this setting.',
          },
        },
      });
      const content = 'cwd: t|e|st'; // len: 9, pos: 6
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `The directory from which bower should run\\. All relative paths will be calculated according to this setting\\.\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover on key with depth', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            type: 'object',
            properties: {
              postinstall: {
                type: 'string',
                description: 'A script to run after install',
              },
            },
          },
        },
      });
      const content = 'scripts:\n  post|i|nstall: test'; // len: 28, pos: 15
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `A script to run after install\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover on value with depth', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            type: 'object',
            properties: {
              postinstall: {
                type: 'string',
                description: 'A script to run after install',
              },
            },
          },
        },
      });
      const content = 'scripts:\n  postinstall: te|s|t'; // len: 28, pos: 26
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `A script to run after install\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover works on both root node and child nodes works', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            type: 'object',
            properties: {
              postinstall: {
                type: 'string',
                description: 'A script to run after install',
              },
            },
            description: 'Contains custom hooks used to trigger other automated tools',
          },
        },
      });
      const content1 = 'scr|i|pts:\n  postinstall: test'; // len: 28, pos: 3
      const firstHover = await parseSetup(content1);

      assert.strictEqual(MarkupContent.is(firstHover.contents), true);
      assert.strictEqual((firstHover.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (firstHover.contents as MarkupContent).value,
        `Contains custom hooks used to trigger other automated tools\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );

      const content2 = 'scripts:\n  post|i|nstall: test'; // len: 28, pos: 15
      const secondHover = await parseSetup(content2);

      assert.strictEqual(MarkupContent.is(secondHover.contents), true);
      assert.strictEqual(
        (secondHover.contents as MarkupContent).value,
        `A script to run after install\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover does not show results when there isnt description field', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = 'ana|l|ytics: true'; // len: 15, pos: 3
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).value, '');
    });

    it('Hover on first document in multi document', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = '---\nanalytics: true\n...\n---\njson: test\n...';
      const result = await parseSetup(content, 10);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).value, '');
    });

    it('Hover on second document in multi document', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
          json: {
            type: 'string',
            description: 'A file path to the configuration file',
          },
        },
      });
      const content = '---\nanalytics: true\n...\n---\njs|o|n: test\n...'; // len: 42, pos: 30
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `A file path to the configuration file\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover should not return anything on key', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {},
      });
      const content = 'm|y|_unknown_hover: test'; // len: 22, pos: 1
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).value, '');
    });

    it('Hover should not return anything on value', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {},
      });
      const content = 'my_unknown_hover: tes|t|'; // len: 22, pos: 21
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).value, '');
    });

    it('Hover works on array nodes', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          authors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Full name of the author.',
                },
              },
            },
          },
        },
      });
      const content = 'authors:\n  - n|a|me: Josh'; // len: 23, pos: 14
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `Full name of the author\\.\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover works on additional array nodes', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          authors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Full name of the author.',
                },
                email: {
                  type: 'string',
                  description: 'Email address of the author.',
                },
              },
            },
          },
        },
      });
      const content = 'authors:\n  - name: Josh\n  - |e|mail: jp'; // len: 37, pos: 28
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `Email address of the author\\.\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover works on oneOf reference array nodes', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        definitions: {
          stringoptions: {
            $id: '#/definitions/stringoptions',
            type: 'array',
            additionalItems: false,
            uniqueItems: true,
            minItems: 1,
            items: {
              oneOf: [
                {
                  type: 'string',
                },
              ],
            },
          },
        },
        properties: {
          ignition: {
            type: 'object',
            properties: {
              proxy: {
                type: 'object',
                properties: {
                  no_proxy: {
                    $ref: '#/definitions/stringoptions',
                    title: 'no_proxy (list of strings):',
                    description:
                      'Specifies a list of strings to hosts that should be excluded from proxying. Each value is represented by an IP address prefix (1.2.3.4), an IP address prefix in CIDR notation (1.2.3.4/8), a domain name, or a special DNS label (*). An IP address prefix and domain name can also include a literal port number (1.2.3.4:80). A domain name matches that name and all subdomains. A domain name with a leading . matches subdomains only. For example foo.com matches foo.com and bar.foo.com; .y.com matches x.y.com but not y.com. A single asterisk (*) indicates that no proxying should be done.',
                  },
                },
              },
            },
          },
          storage: {
            type: 'object',
            properties: {
              raid: {
                type: 'array',
                items: {
                  oneOf: [
                    {
                      properties: {
                        name: {
                          type: 'string',
                          title: 'name (string):',
                          description: 'The name to use for the resulting md device.',
                        },
                        devices: {
                          $ref: '#/definitions/stringoptions',
                          title: 'devices (list of strings):',
                          description: 'The list of devices (referenced by their absolute path) in the array.',
                        },
                        options: {
                          $ref: '#/definitions/stringoptions',
                          title: 'options (list of strings):',
                          description: 'Any additional options to be passed to mdadm.',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      });

      const content1 = `ignition:
  proxy:
    no_proxy:
      - 10|.|10.10.10
      - service.local
storage:
  raid:
    - name: Raid
      devices:
        - /dev/disk/by-id/ata-WDC_WD10SPZX-80Z10T2_WD-WX41A49H9FT4
        - /dev/disk/by-id/ata-WDC_WD10SPZX-80Z10T2_WD-WXL1A49KPYFD`; // len: 257, pos: 43

      let result = await parseSetup(content1);
      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `#### no\\_proxy \\(list of strings\\):\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );

      const content2 = `ignition:
  proxy:
    no_proxy:
      - 10.10.10.10
      - service.local
storage:
  raid:
    - name: Raid
      devices:
        - /dev/disk/by-id/ata-WDC_WD|1|0SPZX-80Z10T2_WD-WX41A49H9FT4
        - /dev/disk/by-id/ata-WDC_WD10SPZX-80Z10T2_WD-WXL1A49KPYFD`; // len: 257, pos: 160

      result = await parseSetup(content2);
      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `#### devices \\(list of strings\\):\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover on refs node', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: {
            type: 'string',
            description: 'Title of this file',
          },
          refs: {
            type: 'object',
          },
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Name of the user',
                },
                place: {
                  type: 'string',
                  description: 'Place of residence',
                },
              },
            },
          },
        },
      });

      const content = `title: meetup
refs:
  place: &default_place NYC
users:
  - name: foo
    place: SFC
  - name: bar
    |p|lace: *default_place`;
      const result = await parseSetup(content);
      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `Place of residence\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover on null property', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          childObject: {
            type: 'object',
            description: 'should return this description',
          },
        },
      });
      const content = 'c|h|ildObject: \n'; // len: 14, pos: 1
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `should return this description\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('hover on value and its description has multiline, indentation and special string', async () => {
      (() => {
        languageSettingsSetup = new ServiceSetup()
          .withHover()
          .withIndentation('  ')
          .withSchemaFileMatch({
            uri: 'http://google.com',
            fileMatch: ['bad-schema.yaml'],
          });
        const {
          languageHandler: langHandler,
          yamlSettings: settings,
          telemetry: testTelemetry,
          schemaProvider: testSchemaProvider,
        } = setupLanguageService(languageSettingsSetup.languageSettings);
        languageHandler = langHandler;
        yamlSettings = settings;
        telemetry = testTelemetry;
        schemaProvider = testSchemaProvider;
      })();
      //https://github.com/redhat-developer/vscode-yaml/issues/886
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        title: 'Person',
        properties: {
          firstName: {
            type: 'string',
            description: 'At the top level my_var is shown properly.\n\n    Issue with my_var2\n      here my_var3',
          },
        },
      });
      const content = 'fi|r|stName: '; // len: 12, pos: 1
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `#### Person\n\nAt the top level my\\_var is shown properly\\.\n\n&emsp;&emsp;Issue with my\\_var2\n\n&emsp;&emsp;&emsp;here my\\_var3\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover displays enum descriptions if present', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          animal: {
            type: 'string',
            description: 'should return this description',
            enum: ['cat', 'dog', 'non'],
            enumDescriptions: ['', 'Canis familiaris'],
          },
        },
      });
      const content = 'animal:\n  ca|t|'; // len: 13, pos: 12
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `should return this description

Allowed Values:

* \`cat\`
* \`dog\`: Canis familiaris
* \`non\`

Source: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover works on examples', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          animal: {
            type: 'string',
            description: 'should return this description',
            enum: ['cat', 'dog'],
            examples: ['cat', 'dog'],
          },
        },
      });
      const content = 'animal:\n  ca|t|'; // len: 13, pos: 12
      const result = await parseSetup(content);

      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual((result.contents as MarkupContent).kind, 'markdown');
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `should return this description

Allowed Values:

* \`cat\`
* \`dog\`

Examples:

* \`\`\`"cat"\`\`\`
* \`\`\`"dog"\`\`\`

Source: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('Hover on property next value on null', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          childObject: {
            type: 'object',
            description: 'childObject description',
            properties: {
              prop: {
                type: 'string',
                description: 'should return this description',
              },
            },
          },
        },
      });
      const content = 'childObject:\r\n  |p|rop:\r\n  '; // len: 25, pos: 16
      const result = await parseSetup(content);
      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `should return this description\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
    });

    it('should work with bad schema', async () => {
      const doc = setupSchemaIDTextDocument('foo:\n bar', 'bad-schema.yaml');
      yamlSettings.documents = new TextDocumentTestManager();
      (yamlSettings.documents as TextDocumentTestManager).set(doc);
      const result = await languageHandler.hoverHandler({
        position: Position.create(0, 1),
        textDocument: doc,
      });

      expect(result).to.be.null;
    });
  });

  describe('Hover on anyOf', () => {
    it('should show all matched schemas in anyOf', async () => {
      schemaProvider.addSchema(SCHEMA_ID, {
        title: 'The Root',
        description: 'Root Object',
        type: 'object',
        properties: {
          child: {
            title: 'Child',
            anyOf: [
              {
                $ref: '#/definitions/FirstChoice',
              },
              {
                $ref: '#/definitions/SecondChoice',
              },
            ],
          },
        },
        required: ['child'],
        additionalProperties: false,
        definitions: {
          FirstChoice: {
            title: 'FirstChoice',
            description: 'The first choice',
            type: 'object',
            properties: {
              choice: {
                title: 'Choice',
                default: 'first',
                enum: ['first'],
                type: 'string',
              },
              property_a: {
                title: 'Property A',
                type: 'string',
              },
            },
            required: ['property_a'],
          },
          SecondChoice: {
            title: 'SecondChoice',
            description: 'The second choice',
            type: 'object',
            properties: {
              choice: {
                title: 'Choice',
                default: 'second',
                enum: ['second'],
                type: 'string',
              },
              property_b: {
                title: 'Property B',
                type: 'string',
              },
            },
            required: ['property_b'],
          },
        },
      });
      let content = 'ch|i|ld:';
      let result = await parseSetup(content);
      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `#### FirstChoice || SecondChoice\n\nThe first choice || The second choice\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
      expect(telemetry.messages).to.be.empty;

      //use case 1:
      content = 'ch|i|ld: \n  property_a: test';
      result = await parseSetup(content);
      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `#### FirstChoice\n\nThe first choice\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
      expect(telemetry.messages).to.be.empty;

      //use case 2:
      content = 'ch|i|ld: \n  property_b: test';
      result = await parseSetup(content);
      assert.strictEqual(MarkupContent.is(result.contents), true);
      assert.strictEqual(
        (result.contents as MarkupContent).value,
        `#### SecondChoice\n\nThe second choice\n\nSource: [${SCHEMA_ID}](file:///${SCHEMA_ID})`
      );
      expect(telemetry.messages).to.be.empty;
    });
  });

  describe('Bug fixes', () => {
    it('should convert binary data correctly', async () => {
      const content =
        'foo: [ !!binary R0lG|O|DlhDAAMAIQAAP//9/X17unp5WZmZgAAAOfn515eXvPz7Y6OjuDg4J+fn5OTk6enp56enmleECcgggoBADs= ]\n'; // len: 107, pos: 20
      const result = await parseSetup(content);
      expect(telemetry.messages).to.be.empty;
      expect(result).to.be.null;
    });
  });
});
