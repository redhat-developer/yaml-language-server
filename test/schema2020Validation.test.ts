/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SCHEMA_ID, TestCustomSchemaProvider, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import { ServiceSetup } from './utils/serviceSetup';
import { Diagnostic } from 'vscode-languageserver-types';
import { expect } from 'chai';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import { KUBERNETES_SCHEMA_URL } from '../src/languageservice/utils/schemaUrls';
import { JSONSchema } from '../src/languageservice/jsonSchema';

describe('Validation Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let validationHandler: ValidationHandler;
  let yamlSettings: SettingsState;
  let schemaProvider: TestCustomSchemaProvider;

  before(() => {
    languageSettingsSetup = new ServiceSetup()
      .withValidate()
      .withCompletion()
      .withCustomTags(['!Test', '!Ref sequence'])
      .withSchemaFileMatch({ uri: KUBERNETES_SCHEMA_URL, fileMatch: ['.drone.yml'] })
      .withSchemaFileMatch({ uri: 'https://json.schemastore.org/drone', fileMatch: ['.drone.yml'] })
      .withSchemaFileMatch({ uri: KUBERNETES_SCHEMA_URL, fileMatch: ['test.yml'] })
      .withSchemaFileMatch({
        uri: 'https://raw.githubusercontent.com/composer/composer/master/res/composer-schema.json',
        fileMatch: ['test.yml'],
      });
    const {
      validationHandler: valHandler,
      yamlSettings: settings,
      schemaProvider: testSchemaProvider,
    } = setupLanguageService(languageSettingsSetup.languageSettings);
    validationHandler = valHandler;
    yamlSettings = settings;
    schemaProvider = testSchemaProvider;
  });

  function parseSetup(content: string, customSchemaID?: string): Promise<Diagnostic[]> {
    const testTextDocument = setupSchemaIDTextDocument(content, customSchemaID);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return validationHandler.validateTextDocument(testTextDocument);
  }

  afterEach(() => {
    schemaProvider.deleteSchema(SCHEMA_ID);
  });

  describe('keyword: prefixItems + items', () => {
    describe('Open tuple', () => {
      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
        } as JSONSchema);
      });
      it('allows extra items by default (items is unconstrained)', async () => {
        const content = `- hello
- 123
- { totally: "anything" }`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });
      it('fails when a prefixItems position has the wrong type', async () => {
        const content = `- 123\n- hello`;
        const result = await parseSetup(content);
        expect(result).to.have.length(2);
        expect(result[0].message).to.include('Incorrect type');
        expect(result[0].message).to.include('string');
        expect(result[1].message).to.include('Incorrect type');
        expect(result[1].message).to.include('number');
      });
    });

    describe('Closed tuple', () => {
      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
          items: false,
        } as JSONSchema);
      });
      it('forbids extra items after prefixItems', async () => {
        const content = `- hello\n- 123\n- extra`;
        const result = await parseSetup(content);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Array has too many items according to schema. Expected 2 or fewer.');
      });
      it('passes when length is within prefixItems', async () => {
        const content = `- hello\n- 123`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });
    });

    describe('Tuple with constrained extra items', () => {
      beforeEach(() => {
        schemaProvider.addSchema(SCHEMA_ID, {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
          items: { type: 'boolean' },
        } as JSONSchema);
      });
      it('fails when an extra item does not match items schema', async () => {
        const content = `- hello
- 123
- notBoolean`;
        const result = await parseSetup(content);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type');
        expect(result[0].message).to.include('boolean');
      });
      it('passes when extra items match items schema', async () => {
        const content = `- hello
- 123
- true
- false`;
        const result = await parseSetup(content);
        expect(result).to.be.empty;
      });
    });
  });

  describe('contains and unevaluatedItems tests', () => {
    beforeEach(() => {
      schemaProvider.addSchema(SCHEMA_ID, {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'array',
        contains: { type: 'string' },
        unevaluatedItems: { type: 'number' },
      } as JSONSchema);
    });
    it('passes when there is at least one string and all non-matching items are numbers', async () => {
      const content = `- hello
- 1
- 2`;
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });
    it('passes even if multiple items are strings (strings match contains => evaluated)', async () => {
      const content = `- hello
- oops
- 3`;
      const result = await parseSetup(content);
      expect(result).to.be.empty;
    });
    it('fails if a non-matching item is not a number', async () => {
      const content = `- hello\n- a: 1`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type');
      expect(result[0].message).to.include('number');
    });
    it('fails if no item matches contains (minContains defaults to 1)', async () => {
      const content = `- 1\n- 2`;
      const result = await parseSetup(content);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Array has too few items matching');
      expect(result[0].message).to.include('contains');
      expect(result[0].message).to.include('Expected 1 or more');
    });
  });
  it('passes ["a","b","ccc"] because "ccc" is evaluated by contains', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'string' }],
      contains: { type: 'string', minLength: 3 },
      unevaluatedItems: false,
    } as JSONSchema);
    const content = `- a
- b
- ccc`;
    const result = await parseSetup(content);
    expect(result).to.be.empty;
  });
  it('fails ["a","b","ccc"] using boolean-algebra workaround', async () => {
    schemaProvider.addSchema(SCHEMA_ID, {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'string' }],
      not: {
        items: {
          not: { type: 'string', minLength: 3 },
        },
      },
      unevaluatedItems: false,
    } as JSONSchema);
    const content = `- a
- b
- ccc`;
    const result = await parseSetup(content);
    expect(result).to.not.be.empty;
    expect(result[0].message).to.include('Array has too many items according to schema. Expected 2 or fewer.');
  });

  describe('Mixed dialect subschema instance validation in Compound Schema Document', () => {
    it('draft-2020 root with draft-04 subschema', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          age: {
            allOf: [
              {
                $schema: 'http://json-schema.org/draft-04/schema#',
                type: 'number',
                minimum: 0,
                exclusiveMinimum: true,
              },
            ],
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const failResult = await parseSetup('age: 0');
      expect(failResult).to.have.length(1);
      expect(failResult[0].message).to.include('exclusive minimum of 0');
      const passResult = await parseSetup('age: 1');
      expect(passResult).to.be.empty;
    });

    it('draft-2020 root with draft-07 subschema', async () => {
      const schema: JSONSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          score: {
            anyOf: [
              {
                $schema: 'http://json-schema.org/draft-07/schema#',
                type: 'number',
                exclusiveMinimum: 0,
              },
            ],
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const failResult = await parseSetup('score: 0');
      expect(failResult).to.have.length(1);
      expect(failResult[0].message).to.include('exclusive minimum of 0');
      const passResult = await parseSetup('score: 1');
      expect(passResult).to.be.empty;
    });

    it('draft-07 root with draft-2019 subschema', async () => {
      const schema: JSONSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        required: ['productId'],
        properties: {
          productId: { type: 'string' },
          metadata: {
            $schema: 'https://json-schema.org/draft/2019-09/schema',
            type: 'object',
            properties: {
              tags: {
                type: 'array',
                contains: { type: 'string' },
                maxContains: 5,
              },
            },
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);
      const failContent = `productId: "PROD-123"
metadata:
  tags:
    - "electronics"
    - "sale"
    - "featured"
    - "new"
    - "popular"
    - "trending"`;
      const failResult = await parseSetup(failContent);
      expect(failResult).to.have.length(1);
      expect(failResult[0].message).to.include('too many items matching "contains"');
      expect(failResult[0].message).to.include('5 or fewer');
      const passContent = `productId: "PROD-123"
metadata:
  tags:
    - "electronics"
    - "sale"
    - "featured"
    - "new"
    - "popular"`;
      const passResult = await parseSetup(passContent);
      expect(passResult).to.be.empty;
    });
  });

  describe('$dynamicAnchor and $dynamicRef resolution', () => {
    const treeSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'http://localhost:1234/draft2020-12/tree.json',
      $dynamicAnchor: 'node',
      type: 'object',
      properties: {
        data: true,
        children: {
          type: 'array',
          items: { $dynamicRef: '#node' },
        },
      },
    };
    const extendibleDynamicRefSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'http://localhost:1234/draft2020-12/extendible-dynamic-ref.json',
      type: 'object',
      additionalProperties: false,
      properties: {
        elements: {
          type: 'array',
          items: { $dynamicRef: '#elements' },
        },
      },
      $defs: {
        elements: {
          $comment: 'base dynamic anchor',
          $dynamicAnchor: 'elements',
        },
      },
    };
    const detachedDynamicRefSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'http://localhost:1234/draft2020-12/detached-dynamicref.json',
      $defs: {
        foo: { $dynamicRef: '#number' },
        number: { $dynamicAnchor: 'number', type: 'number' },
      },
    };

    describe('basic $dynamicRef behavior', () => {
      it('A $dynamicRef to a $dynamicAnchor in the same schema resource behaves like a normal $ref to an $anchor', async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/dynamicRef-dynamicAnchor-same-schema/root',
          type: 'array',
          items: { $dynamicRef: '#items' },
          $defs: {
            foo: {
              $dynamicAnchor: 'items',
              type: 'string',
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);

        expect(await parseSetup("['foo', 'bar']")).to.be.empty;

        const result = await parseSetup("['foo', 42]");
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string');
      });

      it('A $dynamicRef to an $anchor in the same schema resource behaves like a normal $ref to an $anchor', async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/dynamicRef-anchor-same-schema/root',
          type: 'array',
          items: { $dynamicRef: '#items' },
          $defs: {
            foo: {
              $anchor: 'items',
              type: 'string',
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);

        expect(await parseSetup("['foo', 'bar']")).to.be.empty;

        const result = await parseSetup("['foo', 42]");
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string');
      });

      it('A $ref to a $dynamicAnchor in the same schema resource behaves like a normal $ref to an $anchor', async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/ref-dynamicAnchor-same-schema/root',
          type: 'array',
          items: { $ref: '#items' },
          $defs: {
            foo: {
              $dynamicAnchor: 'items',
              type: 'string',
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);

        expect(await parseSetup("['foo', 'bar']")).to.be.empty;

        const result = await parseSetup("['foo', 42]");
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string');
      });

      it('A $dynamicRef resolves to the first $dynamicAnchor still in scope that is encountered when the schema is evaluated', async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/typical-dynamic-resolution/root',
          $ref: 'list',
          $defs: {
            foo: {
              $dynamicAnchor: 'items',
              type: 'string',
            },
            list: {
              $id: 'list',
              type: 'array',
              items: { $dynamicRef: '#items' },
              $defs: {
                items: {
                  $comment: 'This is only needed to satisfy the bookending requirement',
                  $dynamicAnchor: 'items',
                },
              },
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);

        expect(await parseSetup("['foo', 'bar']")).to.be.empty;

        const result = await parseSetup("['foo', 42]");
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string');
      });

      it('A $dynamicRef without anchor in fragment behaves identical to $ref', async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/dynamicRef-without-anchor/root',
          $ref: 'list',
          $defs: {
            foo: {
              $dynamicAnchor: 'items',
              type: 'string',
            },
            list: {
              $id: 'list',
              type: 'array',
              items: { $dynamicRef: '#/$defs/items' },
              $defs: {
                items: {
                  $comment: 'This is only needed to satisfy the bookending requirement',
                  $dynamicAnchor: 'items',
                  type: 'number',
                },
              },
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);

        const invalid = await parseSetup("['foo', 'bar']");
        expect(invalid).to.have.length(1);
        expect(invalid[0].message).to.include('Incorrect type.');
        expect(invalid[0].message).to.include('number');

        expect(await parseSetup('[24, 42]')).to.be.empty;
      });

      it("A $dynamicRef with intermediate scopes that don't include a matching $dynamicAnchor does not affect dynamic scope resolution", async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/dynamic-resolution-with-intermediate-scopes/root',
          $ref: 'intermediate-scope',
          $defs: {
            foo: {
              $dynamicAnchor: 'items',
              type: 'string',
            },
            'intermediate-scope': {
              $id: 'intermediate-scope',
              $ref: 'list',
            },
            list: {
              $id: 'list',
              type: 'array',
              items: { $dynamicRef: '#items' },
              $defs: {
                items: {
                  $comment: 'This is only needed to satisfy the bookending requirement',
                  $dynamicAnchor: 'items',
                },
              },
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);

        expect(await parseSetup("['foo', 'bar']")).to.be.empty;

        const result = await parseSetup("['foo', 42]");
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string');
      });

      it('An $anchor with the same name as a $dynamicAnchor is not used for dynamic scope resolution', async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/dynamic-resolution-ignores-anchors/root',
          $ref: 'list',
          $defs: {
            foo: {
              $anchor: 'items',
              type: 'string',
            },
            list: {
              $id: 'list',
              type: 'array',
              items: { $dynamicRef: '#items' },
              $defs: {
                items: {
                  $comment: 'This is only needed to satisfy the bookending requirement',
                  $dynamicAnchor: 'items',
                },
              },
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        expect(await parseSetup("['foo', 42]")).to.be.empty;
      });

      it('A $dynamicRef without a matching $dynamicAnchor in the same schema resource behaves like a normal $ref to $anchor', async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/dynamic-resolution-without-bookend/root',
          $ref: 'list',
          $defs: {
            foo: {
              $dynamicAnchor: 'items',
              type: 'string',
            },
            list: {
              $id: 'list',
              type: 'array',
              items: { $dynamicRef: '#items' },
              $defs: {
                items: {
                  $comment: 'This is only needed to give the reference somewhere to resolve to when it behaves like $ref',
                  $anchor: 'items',
                },
              },
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        expect(await parseSetup("['foo', 42]")).to.be.empty;
      });

      it('A $dynamicRef with a non-matching $dynamicAnchor in the same schema resource behaves like a normal $ref to $anchor', async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/unmatched-dynamic-anchor/root',
          $ref: 'list',
          $defs: {
            foo: {
              $dynamicAnchor: 'items',
              type: 'string',
            },
            list: {
              $id: 'list',
              type: 'array',
              items: { $dynamicRef: '#items' },
              $defs: {
                items: {
                  $comment: 'This is only needed to give the reference somewhere to resolve to when it behaves like $ref',
                  $anchor: 'items',
                  $dynamicAnchor: 'foo',
                },
              },
            },
          },
        };
        schemaProvider.addSchemaWithUri(SCHEMA_ID, schema.$id, schema);
        expect(await parseSetup("['foo', 42]")).to.be.empty;
      });
    });

    describe('relative dynamic references', () => {
      it('A $dynamicRef that initially resolves to a schema with a matching $dynamicAnchor resolves to the first $dynamicAnchor in the dynamic scope', async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/relative-dynamic-reference/root',
          $dynamicAnchor: 'meta',
          type: 'object',
          properties: {
            foo: { const: 'pass' },
          },
          $ref: 'extended',
          $defs: {
            extended: {
              $id: 'extended',
              $dynamicAnchor: 'meta',
              type: 'object',
              properties: {
                bar: { $ref: 'bar' },
              },
            },
            bar: {
              $id: 'bar',
              type: 'object',
              properties: {
                baz: { $dynamicRef: 'extended#meta' },
              },
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        expect(
          await parseSetup(`foo: "pass"
bar:
  baz: 
    foo: pass`)
        ).to.be.empty;

        const result = await parseSetup(`foo: "pass"
bar:
  baz: 
    foo: fail`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Value must be');
        expect(result[0].message).to.include('pass');
      });

      it('A $dynamicRef that initially resolves to a schema without a matching $dynamicAnchor behaves like a normal $ref to $anchor', async () => {
        const schema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://test.json-schema.org/relative-dynamic-reference-without-bookend/root',
          $dynamicAnchor: 'meta',
          type: 'object',
          properties: {
            foo: { const: 'pass' },
          },
          $ref: 'extended',
          $defs: {
            extended: {
              $id: 'extended',
              $anchor: 'meta',
              type: 'object',
              properties: {
                bar: { $ref: 'bar' },
              },
            },
            bar: {
              $id: 'bar',
              type: 'object',
              properties: {
                baz: { $dynamicRef: 'extended#meta' },
              },
            },
          },
        };
        schemaProvider.addSchema(SCHEMA_ID, schema);
        expect(
          await parseSetup(`foo: "pass"
bar:
  baz: 
    foo: fail`)
        ).to.be.empty;
      });
    });

    it('multiple dynamic paths to the $dynamicRef keyword', async () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://test.json-schema.org/dynamic-ref-with-multiple-paths/main',
        if: {
          properties: {
            kindOfList: { const: 'numbers' },
          },
          required: ['kindOfList'],
        },
        then: { $ref: 'numberList' },
        else: { $ref: 'stringList' },

        $defs: {
          genericList: {
            $id: 'genericList',
            properties: {
              list: {
                items: { $dynamicRef: '#itemType' },
              },
            },
            $defs: {
              defaultItemType: {
                $comment: 'Only needed to satisfy bookending requirement',
                $dynamicAnchor: 'itemType',
              },
            },
          },
          numberList: {
            $id: 'numberList',
            $defs: {
              itemType: {
                $dynamicAnchor: 'itemType',
                type: 'number',
              },
            },
            $ref: 'genericList',
          },
          stringList: {
            $id: 'stringList',
            $defs: {
              itemType: {
                $dynamicAnchor: 'itemType',
                type: 'string',
              },
            },
            $ref: 'genericList',
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);

      expect(await parseSetup(`kindOfList: "numbers"\nlist: [1.1]`)).to.be.empty;

      const numbersInvalid = await parseSetup(`kindOfList: "numbers"\nlist: ["foo"]`);
      expect(numbersInvalid).to.have.length(1);
      expect(numbersInvalid[0].message).to.include('Incorrect type.');
      expect(numbersInvalid[0].message).to.include('number');

      const stringsInvalid = await parseSetup(`kindOfList: "strings"\nlist: [1.1]`);
      expect(stringsInvalid).to.have.length(1);
      expect(stringsInvalid[0].message).to.include('Incorrect type.');
      expect(stringsInvalid[0].message).to.include('string');

      expect(await parseSetup(`kindOfList: "strings"\nlist: ["foo"]`)).to.be.empty;
    });

    it('after leaving a dynamic scope, it is not used by a $dynamicRef', async () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://test.json-schema.org/dynamic-ref-leaving-dynamic-scope/main',
        if: {
          $id: 'first_scope',
          $defs: {
            thingy: {
              $comment: 'this is first_scope#thingy',
              $dynamicAnchor: 'thingy',
              type: 'number',
            },
          },
        },
        then: {
          $id: 'second_scope',
          $ref: 'start',
          $defs: {
            thingy: {
              $comment: 'this is second_scope#thingy, the final destination of the $dynamicRef',
              $dynamicAnchor: 'thingy',
              type: 'null',
            },
          },
        },
        $defs: {
          start: {
            $comment: 'this is the landing spot from $ref',
            $id: 'start',
            $dynamicRef: 'inner_scope#thingy',
          },
          thingy: {
            $comment: 'this is the first stop for the $dynamicRef',
            $id: 'inner_scope',
            $dynamicAnchor: 'thingy',
            type: 'string',
          },
        },
      };
      schemaProvider.addSchema(SCHEMA_ID, schema);

      const stringInvalid = await parseSetup('a string');
      expect(stringInvalid).to.have.length(1);
      expect(stringInvalid[0].message).to.include('null');

      const numberInvalid = await parseSetup('42');
      expect(numberInvalid).to.have.length(1);
      expect(stringInvalid[0].message).to.include('null');

      expect(await parseSetup(null)).to.be.empty;
    });

    describe('strict-tree schema, guards against misspelled properties', () => {
      const strictTreeSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'http://localhost:1234/draft2020-12/strict-tree.json',
        $dynamicAnchor: 'node',

        $ref: 'tree.json',
        unevaluatedProperties: false,
      };

      beforeEach(() => {
        schemaProvider.addSchemaWithUri(SCHEMA_ID, treeSchema.$id, treeSchema);
        schemaProvider.addSchemaWithUri(SCHEMA_ID, strictTreeSchema.$id, strictTreeSchema);
      });

      it('instance with misspelled field', async () => {
        const result = await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-tree.json
children:
  - daat: 1`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property daat is not allowed.');
      });

      it('instance with correct field', async () => {
        expect(
          await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-tree.json
children:
  - data: 1`)
        ).to.be.empty;
      });
    });

    describe('tests for implementation dynamic anchor and reference link', () => {
      const strictExtendibleSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'http://localhost:1234/draft2020-12/strict-extendible.json',
        $ref: 'extendible-dynamic-ref.json',
        $defs: {
          elements: {
            $dynamicAnchor: 'elements',
            properties: {
              a: true,
            },
            required: ['a'],
            additionalProperties: false,
          },
        },
      };

      beforeEach(() => {
        schemaProvider.addSchemaWithUri(SCHEMA_ID, extendibleDynamicRefSchema.$id, extendibleDynamicRefSchema);
        schemaProvider.addSchemaWithUri(SCHEMA_ID, strictExtendibleSchema.$id, strictExtendibleSchema);
      });

      it('incorrect parent schema', async () => {
        const result = await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-extendible.json
a: true`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property a is not allowed.');
      });

      it('incorrect extended schema', async () => {
        const result = await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-extendible.json
elements:
  - b: 1`);
        expect(result).to.have.length(2);
        expect(result[0].message).to.include('Missing property');
        expect(result[1].message).to.include('Property b is not allowed.');
      });

      it('correct extended schema', async () => {
        expect(
          await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-extendible.json
elements:
  - a: 1`)
        ).to.be.empty;
      });
    });

    describe('$ref and $dynamicAnchor are independent of order - $defs first', () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'http://localhost:1234/draft2020-12/strict-extendible-allof-defs-first.json',
        allOf: [
          {
            $ref: 'extendible-dynamic-ref.json',
          },
          {
            $defs: {
              elements: {
                $dynamicAnchor: 'elements',
                properties: {
                  a: true,
                },
                required: ['a'],
                additionalProperties: false,
              },
            },
          },
        ],
      };

      beforeEach(() => {
        schemaProvider.addSchemaWithUri(SCHEMA_ID, extendibleDynamicRefSchema.$id, extendibleDynamicRefSchema);
        schemaProvider.addSchemaWithUri(SCHEMA_ID, schema.$id, schema);
      });

      it('incorrect parent schema', async () => {
        const result =
          await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-extendible-allof-defs-first.json
a: true`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property a is not allowed.');
      });

      it('incorrect extended schema', async () => {
        const result =
          await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-extendible-allof-defs-first.json
elements:
  - b: 1`);
        expect(result).to.have.length(2);
        expect(result.some((d) => d.message.includes('Missing property') && d.message.includes('a'))).to.eq(true);
        expect(result.some((d) => d.message.includes('Property b is not allowed.'))).to.eq(true);
      });

      it('correct extended schema', async () => {
        expect(
          await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-extendible-allof-defs-first.json
elements:
  - a: 1`)
        ).to.be.empty;
      });
    });

    describe('$ref and $dynamicAnchor are independent of order - $ref first', () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'http://localhost:1234/draft2020-12/strict-extendible-allof-ref-first.json',
        allOf: [
          {
            $defs: {
              elements: {
                $dynamicAnchor: 'elements',
                properties: {
                  a: true,
                },
                required: ['a'],
                additionalProperties: false,
              },
            },
          },
          {
            $ref: 'extendible-dynamic-ref.json',
          },
        ],
      };

      beforeEach(() => {
        schemaProvider.addSchemaWithUri(SCHEMA_ID, extendibleDynamicRefSchema.$id, extendibleDynamicRefSchema);
        schemaProvider.addSchemaWithUri(SCHEMA_ID, schema.$id, schema);
      });

      it('incorrect parent schema', async () => {
        const result =
          await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-extendible-allof-ref-first.json
a: true`);
        expect(result).to.have.length(1);
        expect(result[0].message).to.include('Property a is not allowed.');
      });

      it('incorrect extended schema', async () => {
        const result =
          await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-extendible-allof-ref-first.json
elements:
  - b: 1`);
        expect(result).to.have.length(2);
        expect(result.some((d) => d.message.includes('Missing property') && d.message.includes('a'))).to.eq(true);
        expect(result.some((d) => d.message.includes('Property b is not allowed.'))).to.eq(true);
      });

      it('correct extended schema', async () => {
        expect(
          await parseSetup(`# yaml-language-server: $schema=http://localhost:1234/draft2020-12/strict-extendible-allof-ref-first.json
elements:
  - a: 1`)
        ).to.be.empty;
      });
    });

    it('$ref to $dynamicRef finds detached $dynamicAnchor', async () => {
      const schemaId = 'http://localhost:4242/dynamic-ref-detached.json';
      const schema = {
        $ref: 'http://localhost:1234/draft2020-12/detached-dynamicref.json#/$defs/foo',
      };
      schemaProvider.addSchemaWithUri(SCHEMA_ID, detachedDynamicRefSchema.$id, detachedDynamicRefSchema);
      schemaProvider.addSchemaWithUri(SCHEMA_ID, schemaId, schema);

      expect(
        await parseSetup(`# yaml-language-server: $schema=${schemaId}
1`)
      ).to.be.empty;

      const result = await parseSetup(`# yaml-language-server: $schema=${schemaId}
a`);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type.');
      expect(result[0].message).to.include('number');
    });

    it('$dynamicRef points to a boolean schema', async () => {
      const schemaId = 'http://localhost:4242/dynamic-ref-boolean.json';
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $defs: {
          true: true as unknown as JSONSchema,
          false: false as unknown as JSONSchema,
        },
        properties: {
          true: {
            $dynamicRef: '#/$defs/true',
          },
          false: {
            $dynamicRef: '#/$defs/false',
          },
        },
      };
      schemaProvider.addSchemaWithUri(SCHEMA_ID, schemaId, schema);

      expect(
        await parseSetup(`# yaml-language-server: $schema=${schemaId}
"true": 1`)
      ).to.be.empty;

      const result = await parseSetup(`# yaml-language-server: $schema=${schemaId}
"false": 1`);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Matches a schema that is not allowed.');
    });

    it('$dynamicRef skips over intermediate resources - direct reference', async () => {
      const schemaId = 'https://test.json-schema.org/dynamic-ref-skips-intermediate-resource/main';
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: schemaId,
        type: 'object',
        properties: {
          'bar-item': {
            $ref: 'item',
          },
        },
        $defs: {
          bar: {
            $id: 'bar',
            type: 'array',
            items: {
              $ref: 'item',
            },
            $defs: {
              item: {
                $id: 'item',
                type: 'object',
                properties: {
                  content: {
                    $dynamicRef: '#content',
                  },
                },
                $defs: {
                  defaultContent: {
                    $dynamicAnchor: 'content',
                    type: 'integer',
                  },
                },
              },
              content: {
                $dynamicAnchor: 'content',
                type: 'string',
              },
            },
          },
        },
      };
      schemaProvider.addSchemaWithUri(SCHEMA_ID, schema.$id, schema);

      expect(
        await parseSetup(`# yaml-language-server: $schema=${schemaId}
bar-item:
  content: 42`)
      ).to.be.empty;

      const result = await parseSetup(`# yaml-language-server: $schema=${schemaId}
bar-item:
  content: value`);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('Incorrect type.');
      expect(result[0].message).to.include('integer');
    });

    it('$dynamicRef avoids the root of each schema, but scopes are still registered', async () => {
      const schemaId = 'https://test.json-schema.org/dynamic-ref-avoids-root-of-each-schema/base';
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: schemaId,
        $ref: 'first#/$defs/stuff',
        $defs: {
          first: {
            $id: 'first',
            $defs: {
              stuff: {
                $ref: 'second#/$defs/stuff',
              },
              length: {
                $comment: 'unused, because there is no $dynamicAnchor here',
                maxLength: 1,
              },
            },
          },
          second: {
            $id: 'second',
            $defs: {
              stuff: {
                $ref: 'third#/$defs/stuff',
              },
              length: {
                $dynamicAnchor: 'length',
                maxLength: 2,
              },
            },
          },
          third: {
            $id: 'third',
            $defs: {
              stuff: {
                $dynamicRef: '#length',
              },
              length: {
                $dynamicAnchor: 'length',
                maxLength: 3,
              },
            },
          },
        },
      };
      schemaProvider.addSchemaWithUri(SCHEMA_ID, schema.$id, schema);

      expect(
        await parseSetup(`# yaml-language-server: $schema=${schemaId}
hi`)
      ).to.be.empty;

      const result = await parseSetup(`# yaml-language-server: $schema=${schemaId}
hey`);
      expect(result).to.have.length(1);
      expect(result[0].message).to.include('String is longer than the maximum length of 2.');
    });
  });
});
