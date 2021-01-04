'use strict';

import * as assert from 'assert';
import * as parser from '../src/languageservice/parser/yamlParser07';
import * as SchemaService from '../src/languageservice/services/yamlSchemaService';
import * as JsonSchema from '../src/languageservice/jsonSchema';
import * as url from 'url';
import path = require('path');
import { XHRResponse, xhr } from 'request-light';
import { MODIFICATION_ACTIONS, SchemaDeletions } from '../src/languageservice/services/yamlSchemaService';
import { KUBERNETES_SCHEMA_URL } from '../src/languageservice/utils/schemaUrls';
import { expect } from 'chai';
import { ServiceSetup } from './utils/serviceSetup';
import { configureLanguageService, setupTextDocument, TEST_URI } from './utils/testHelper';
import { SchemaPriority } from '../src';
import { Position } from 'vscode-languageserver';

const requestServiceMock = function (uri: string): Promise<string> {
  return Promise.reject<string>(`Resource ${uri} not found.`);
};

const workspaceContext = {
  resolveRelativePath: (relativePath: string, resource: string) => {
    return url.resolve(resource, relativePath);
  },
};

const schemaRequestServiceForURL = (uri: string): Promise<string> => {
  const headers = { 'Accept-Encoding': 'gzip, deflate' };
  return xhr({ url: uri, followRedirects: 5, headers }).then(
    (response) => {
      return response.responseText;
    },
    (error: XHRResponse) => {
      return Promise.reject(error.responseText || error.toString());
    }
  );
};

suite('JSON Schema', () => {
  test('Resolving $refs', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
    service.setSchemaContributions({
      schemas: {
        'https://myschemastore/main': {
          id: 'https://myschemastore/main',
          type: 'object',
          properties: {
            child: {
              $ref: 'https://myschemastore/child',
            },
          },
        },
        'https://myschemastore/child': {
          id: 'https://myschemastore/child',
          type: 'bool',
          description: 'Test description',
        },
      },
    });

    service
      .getResolvedSchema('https://myschemastore/main')
      .then((solvedSchema) => {
        assert.deepEqual(solvedSchema.schema.properties['child'], {
          _$ref: 'https://myschemastore/child', //jigxBranchTest
          id: 'https://myschemastore/child',
          type: 'bool',
          description: 'Test description',
          url: 'https://myschemastore/child',
        });
      })
      .then(
        () => {
          return testDone();
        },
        (error) => {
          testDone(error);
        }
      );
  });

  test('Resolving $refs 2', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
    service.setSchemaContributions({
      schemas: {
        'https://json.schemastore.org/swagger-2.0': {
          id: 'https://json.schemastore.org/swagger-2.0',
          type: 'object',
          properties: {
            responseValue: {
              $ref: '#/definitions/jsonReference',
            },
          },
          definitions: {
            jsonReference: {
              type: 'object',
              required: ['$ref'],
              properties: {
                $ref: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    });

    service
      .getResolvedSchema('https://json.schemastore.org/swagger-2.0')
      .then((fs) => {
        assert.deepEqual(fs.schema.properties['responseValue'], {
          _$ref: '#/definitions/jsonReference', //jigxBranchTest
          type: 'object',
          required: ['$ref'],
          properties: { $ref: { type: 'string' } },
        });
      })
      .then(
        () => {
          return testDone();
        },
        (error) => {
          testDone(error);
        }
      );
  });

  test('Resolving $refs 3', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
    service.setSchemaContributions({
      schemas: {
        'https://myschemastore/main/schema1.json': {
          id: 'https://myschemastore/schema1.json',
          type: 'object',
          properties: {
            p1: {
              $ref: 'schema2.json#/definitions/hello',
            },
            p2: {
              $ref: './schema2.json#/definitions/hello',
            },
            p3: {
              $ref: '/main/schema2.json#/definitions/hello',
            },
          },
        },
        'https://myschemastore/main/schema2.json': {
          id: 'https://myschemastore/main/schema2.json',
          definitions: {
            hello: {
              type: 'string',
              enum: ['object'],
            },
          },
        },
      },
    });

    service
      .getResolvedSchema('https://myschemastore/main/schema1.json')
      .then((fs) => {
        assert.deepEqual(fs.schema.properties['p1'], {
          _$ref: 'schema2.json#/definitions/hello', //jigxBranchTest
          type: 'string',
          enum: ['object'],
          url: 'https://myschemastore/main/schema2.json',
        });
        assert.deepEqual(fs.schema.properties['p2'], {
          _$ref: './schema2.json#/definitions/hello', //jigxBranchTest
          type: 'string',
          enum: ['object'],
          url: 'https://myschemastore/main/schema2.json',
        });
        assert.deepEqual(fs.schema.properties['p3'], {
          _$ref: '/main/schema2.json#/definitions/hello', //jigxBranchTest
          type: 'string',
          enum: ['object'],
          url: 'https://myschemastore/main/schema2.json',
        });
      })
      .then(
        () => {
          return testDone();
        },
        (error) => {
          testDone(error);
        }
      );
  });

  test('FileSchema', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);

    service.setSchemaContributions({
      schemas: {
        main: {
          id: 'main',
          type: 'object',
          properties: {
            child: {
              type: 'object',
              properties: {
                grandchild: {
                  type: 'number',
                  description: 'Meaning of Life',
                },
              },
            },
          },
        },
      },
    });

    service
      .getResolvedSchema('main')
      .then((fs) => {
        const section = fs.getSection(['child', 'grandchild']);
        assert.equal(section.description, 'Meaning of Life');
      })
      .then(
        () => {
          return testDone();
        },
        (error) => {
          testDone(error);
        }
      );
  });

  test('Array FileSchema', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);

    service.setSchemaContributions({
      schemas: {
        main: {
          id: 'main',
          type: 'object',
          properties: {
            child: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  grandchild: {
                    type: 'number',
                    description: 'Meaning of Life',
                  },
                },
              },
            },
          },
        },
      },
    });

    service
      .getResolvedSchema('main')
      .then((fs) => {
        const section = fs.getSection(['child', '0', 'grandchild']);
        assert.equal(section.description, 'Meaning of Life');
      })
      .then(
        () => {
          return testDone();
        },
        (error) => {
          testDone(error);
        }
      );
  });

  test('Missing subschema', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);

    service.setSchemaContributions({
      schemas: {
        main: {
          id: 'main',
          type: 'object',
          properties: {
            child: {
              type: 'object',
            },
          },
        },
      },
    });

    service
      .getResolvedSchema('main')
      .then((fs) => {
        const section = fs.getSection(['child', 'grandchild']);
        assert.strictEqual(section, undefined);
      })
      .then(
        () => {
          return testDone();
        },
        (error) => {
          testDone(error);
        }
      );
  });

  test('Preloaded Schema', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
    const id = 'https://myschemastore/test1';
    const schema: JsonSchema.JSONSchema = {
      type: 'object',
      properties: {
        child: {
          type: 'object',
          properties: {
            grandchild: {
              type: 'number',
              description: 'Meaning of Life',
            },
          },
        },
      },
    };

    service.registerExternalSchema(id, ['*.json'], schema);

    service
      .getSchemaForResource('test.json', undefined)
      .then((schema) => {
        const section = schema.getSection(['child', 'grandchild']);
        assert.equal(section.description, 'Meaning of Life');
      })
      .then(
        () => {
          return testDone();
        },
        (error) => {
          testDone(error);
        }
      );
  });

  test('Schema has url', async () => {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
    const id = 'https://myschemastore/test1';
    const schema: JsonSchema.JSONSchema = {
      type: 'object',
      properties: {
        child: {
          type: 'object',
          properties: {
            grandchild: {
              type: 'number',
              description: 'Meaning of Life',
            },
          },
        },
      },
    };

    service.registerExternalSchema(id, ['*.json'], schema);

    const result = await service.getSchemaForResource('test.json', undefined);

    expect(result.schema.url).equal(id);
  });

  test('Null Schema', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);

    service
      .getSchemaForResource('test.json', undefined)
      .then((schema) => {
        assert.equal(schema, null);
      })
      .then(
        () => {
          return testDone();
        },
        (error) => {
          testDone(error);
        }
      );
  });

  test('Schema not found', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);

    service
      .loadSchema('test.json')
      .then((schema) => {
        assert.notEqual(schema.errors.length, 0);
      })
      .then(
        () => {
          return testDone();
        },
        (error) => {
          testDone(error);
        }
      );
  });

  test('Schema with non uri registers correctly', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
    const non_uri = 'non_uri';
    service.registerExternalSchema(non_uri, ['*.yml', '*.yaml'], {
      properties: {
        test_node: {
          description: 'my test_node description',
          enum: ['test 1', 'test 2'],
        },
      },
    });
    service.getResolvedSchema(non_uri).then((schema) => {
      assert.notEqual(schema, undefined);
      testDone();
    });
  });
  test('Modifying schema', async () => {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
    service.setSchemaContributions({
      schemas: {
        'https://myschemastore/main/schema1.json': {
          type: 'object',
          properties: {
            apiVersion: {
              type: 'string',
              enum: ['v1'],
            },
            kind: {
              type: 'string',
              enum: ['Pod'],
            },
          },
        },
      },
    });

    await service.addContent({
      action: MODIFICATION_ACTIONS.add,
      path: 'properties/apiVersion',
      key: 'enum',
      content: ['v2', 'v3'],
      schema: 'https://myschemastore/main/schema1.json',
    });

    const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
    assert.deepEqual(fs.schema.properties['apiVersion'], {
      type: 'string',
      enum: ['v2', 'v3'],
    });
    assert.deepEqual(fs.schema.properties['kind'], {
      type: 'string',
      enum: ['Pod'],
    });
  });

  test('Deleting schema', async () => {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
    service.setSchemaContributions({
      schemas: {
        'https://myschemastore/main/schema1.json': {
          type: 'object',
          properties: {
            apiVersion: {
              type: 'string',
              enum: ['v1'],
            },
            kind: {
              type: 'string',
              enum: ['Pod'],
            },
          },
        },
      },
    });

    await service.deleteContent({
      action: MODIFICATION_ACTIONS.delete,
      path: 'properties',
      key: 'apiVersion',
      schema: 'https://myschemastore/main/schema1.json',
    } as SchemaDeletions);

    const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
    assert.notDeepEqual(fs.schema.properties['apiVersion'], {
      type: 'string',
      enum: ['v2', 'v3'],
    });
    assert.equal(fs.schema.properties['apiVersion'], undefined);
    assert.deepEqual(fs.schema.properties['kind'], {
      type: 'string',
      enum: ['Pod'],
    });
  });

  test('Modifying schema works with kubernetes resolution', async () => {
    const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
    service.registerExternalSchema(KUBERNETES_SCHEMA_URL);

    await service.addContent({
      action: MODIFICATION_ACTIONS.add,
      path: 'oneOf/1/properties/kind',
      key: 'enum',
      content: ['v2', 'v3'],
      schema: KUBERNETES_SCHEMA_URL,
    });

    const fs = await service.getResolvedSchema(KUBERNETES_SCHEMA_URL);
    assert.deepEqual(fs.schema.oneOf[1].properties['kind']['enum'], ['v2', 'v3']);
  });

  test('Deleting schema works with Kubernetes resolution', async () => {
    const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
    service.registerExternalSchema(KUBERNETES_SCHEMA_URL);

    await service.deleteContent({
      action: MODIFICATION_ACTIONS.delete,
      path: 'oneOf/1/properties/kind',
      key: 'enum',
      schema: KUBERNETES_SCHEMA_URL,
    });

    const fs = await service.getResolvedSchema(KUBERNETES_SCHEMA_URL);
    assert.equal(fs.schema.oneOf[1].properties['kind']['enum'], undefined);
  });

  test('Adding a brand new schema', async () => {
    const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
    service.saveSchema('hello_world', {
      enum: ['test1', 'test2'],
    });

    const hello_world_schema = await service.getResolvedSchema('hello_world');
    assert.deepEqual(hello_world_schema.schema.enum, ['test1', 'test2']);
  });

  test('Deleting an existing schema', async () => {
    const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
    service.saveSchema('hello_world', {
      enum: ['test1', 'test2'],
    });

    await service.deleteSchema('hello_world');

    const hello_world_schema = await service.getResolvedSchema('hello_world');
    assert.equal(hello_world_schema, null);
  });

  describe('Test schema priority', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schemaAssociationSample = require(path.join(__dirname, './fixtures/sample-association.json'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schemaStoreSample = require(path.join(__dirname, './fixtures/sample-schemastore.json'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schemaSettingsSample = require(path.join(__dirname, './fixtures/sample-settings.json'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schemaModelineSample = require(path.join(__dirname, './fixtures/sample-modeline.json'));
    const languageSettingsSetup = new ServiceSetup().withCompletion();

    test('Modeline Schema takes precendence over all other schemas', async () => {
      languageSettingsSetup
        .withSchemaFileMatch({
          fileMatch: ['test.yaml'],
          uri: TEST_URI,
          priority: SchemaPriority.SchemaStore,
          schema: schemaStoreSample,
        })
        .withSchemaFileMatch({
          fileMatch: ['test.yaml'],
          uri: TEST_URI,
          priority: SchemaPriority.SchemaAssociation,
          schema: schemaAssociationSample,
        })
        .withSchemaFileMatch({
          fileMatch: ['test.yaml'],
          uri: TEST_URI,
          priority: SchemaPriority.Settings,
          schema: schemaSettingsSample,
        })
        .withSchemaFileMatch({
          fileMatch: ['test.yaml'],
          uri: TEST_URI,
          priority: SchemaPriority.Modeline,
          schema: schemaModelineSample,
        });
      const languageService = configureLanguageService(languageSettingsSetup.languageSettings);
      const testTextDocument = setupTextDocument('');
      const result = await languageService.doComplete(testTextDocument, Position.create(0, 0), false);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].label, 'modeline');
    });

    test('Manually setting schema takes precendence over all other lower priority schemas', async () => {
      languageSettingsSetup
        .withSchemaFileMatch({
          fileMatch: ['test.yaml'],
          uri: TEST_URI,
          priority: SchemaPriority.SchemaStore,
          schema: schemaStoreSample,
        })
        .withSchemaFileMatch({
          fileMatch: ['test.yaml'],
          uri: TEST_URI,
          priority: SchemaPriority.SchemaAssociation,
          schema: schemaAssociationSample,
        })
        .withSchemaFileMatch({
          fileMatch: ['test.yaml'],
          uri: TEST_URI,
          priority: SchemaPriority.Settings,
          schema: schemaSettingsSample,
        });
      const languageService = configureLanguageService(languageSettingsSetup.languageSettings);
      const testTextDocument = setupTextDocument('');
      const result = await languageService.doComplete(testTextDocument, Position.create(0, 0), false);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].label, 'settings');
    });

    test('SchemaAssociation takes precendence over SchemaStore', async () => {
      languageSettingsSetup
        .withSchemaFileMatch({
          fileMatch: ['test.yaml'],
          uri: TEST_URI,
          priority: SchemaPriority.SchemaStore,
          schema: schemaStoreSample,
        })
        .withSchemaFileMatch({
          fileMatch: ['test.yaml'],
          uri: TEST_URI,
          priority: SchemaPriority.SchemaAssociation,
          schema: schemaAssociationSample,
        });
      const languageService = configureLanguageService(languageSettingsSetup.languageSettings);
      const testTextDocument = setupTextDocument('');
      const result = await languageService.doComplete(testTextDocument, Position.create(0, 0), false);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].label, 'association');
    });

    test('SchemaStore is highest priority if nothing else is available', async () => {
      languageSettingsSetup.withSchemaFileMatch({
        fileMatch: ['test.yaml'],
        uri: TEST_URI,
        priority: SchemaPriority.SchemaStore,
        schema: schemaStoreSample,
      });
      const languageService = configureLanguageService(languageSettingsSetup.languageSettings);
      const testTextDocument = setupTextDocument('');
      const result = await languageService.doComplete(testTextDocument, Position.create(0, 0), false);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].label, 'schemastore');
    });
  });

  describe('Test getSchemaFromModeline', function () {
    test('simple case', async () => {
      checkReturnSchemaUrl('# yaml-language-server: $schema=expectedUrl', 'expectedUrl');
    });

    test('with several spaces between # and yaml-language-server', async () => {
      checkReturnSchemaUrl('#    yaml-language-server: $schema=expectedUrl', 'expectedUrl');
    });

    test('with several spaces between yaml-language-server and :', async () => {
      checkReturnSchemaUrl('# yaml-language-server   : $schema=expectedUrl', 'expectedUrl');
    });

    test('with several spaces between : and $schema', async () => {
      checkReturnSchemaUrl('# yaml-language-server:    $schema=expectedUrl', 'expectedUrl');
    });

    test('with several spaces at the end', async () => {
      checkReturnSchemaUrl('# yaml-language-server: $schema=expectedUrl   ', 'expectedUrl');
    });

    test('with several spaces at several places', async () => {
      checkReturnSchemaUrl('#   yaml-language-server  :   $schema=expectedUrl   ', 'expectedUrl');
    });

    test('with several attributes', async () => {
      checkReturnSchemaUrl(
        '# yaml-language-server: anotherAttribute=test $schema=expectedUrl aSecondAttribtute=avalue',
        'expectedUrl'
      );
    });

    test('with tabs', async () => {
      checkReturnSchemaUrl('#\tyaml-language-server:\t$schema=expectedUrl', 'expectedUrl');
    });

    test('with several $schema - pick the first', async () => {
      checkReturnSchemaUrl('# yaml-language-server: $schema=url1 $schema=url2', 'url1');
    });

    test('no schema returned if not yaml-language-server', async () => {
      checkReturnSchemaUrl('# somethingelse: $schema=url1', undefined);
    });

    test('no schema returned if not $schema', async () => {
      checkReturnSchemaUrl('# yaml-language-server: $notschema=url1', undefined);
    });

    function checkReturnSchemaUrl(modeline: string, expectedResult: string): void {
      const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
      const yamlDoc = new parser.SingleYAMLDocument([]);
      yamlDoc.lineComments = [modeline];
      assert.equal(service.getSchemaFromModeline(yamlDoc), expectedResult);
    }
  });
});
