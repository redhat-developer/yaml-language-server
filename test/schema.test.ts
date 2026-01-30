import * as assert from 'assert';
import * as parser from '../src/languageservice/parser/yamlParser07';
import * as SchemaService from '../src/languageservice/services/yamlSchemaService';
import * as JsonSchema from '../src/languageservice/jsonSchema';
import * as url from 'url';
import * as path from 'path';
import { XHRResponse, xhr } from 'request-light';
import { MODIFICATION_ACTIONS, SchemaDeletions } from '../src/languageservice/services/yamlSchemaService';
import { KUBERNETES_SCHEMA_URL } from '../src/languageservice/utils/schemaUrls';
import { expect } from 'chai';
import { ServiceSetup } from './utils/serviceSetup';
import {
  SCHEMA_ID,
  TestCustomSchemaProvider,
  setupLanguageService,
  setupSchemaIDTextDocument,
  setupTextDocument,
  TEST_URI,
} from './utils/testHelper';
import { LanguageService, SchemaPriority } from '../src';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { Diagnostic, MarkupContent, Position } from 'vscode-languageserver-types';
import { LineCounter } from 'yaml';
import { getSchemaFromModeline } from '../src/languageservice/services/modelineUtil';
import { getGroupVersionKindFromDocument } from '../src/languageservice/services/crdUtil';

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

describe('JSON Schema', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageService: LanguageService;

  beforeEach(() => {
    languageSettingsSetup = new ServiceSetup()
      .withValidate()
      .withCustomTags(['!Test', '!Ref sequence'])
      .withSchemaFileMatch({ uri: KUBERNETES_SCHEMA_URL, fileMatch: ['.drone.yml'] })
      .withSchemaFileMatch({ uri: 'https://json.schemastore.org/drone', fileMatch: ['.drone.yml'] })
      .withSchemaFileMatch({ uri: KUBERNETES_SCHEMA_URL, fileMatch: ['test.yml'] })
      .withSchemaFileMatch({ uri: 'https://json.schemastore.org/composer', fileMatch: ['test.yml'] });
    const { languageService: langService } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageService = langService;
  });

  it('Resolving $refs', function (testDone) {
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
          id: 'https://myschemastore/child',
          type: 'bool',
          description: 'Test description',
          _$ref: 'https://myschemastore/child',
          url: 'https://myschemastore/child',
          _baseUrl: 'https://myschemastore/child',
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

  it('Resolving $refs 2', function (testDone) {
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
          type: 'object',
          required: ['$ref'],
          properties: { $ref: { type: 'string' } },
          _$ref: '#/definitions/jsonReference',
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

  it('Resolving $refs 3', function (testDone) {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
    service.setSchemaContributions({
      schemas: {
        'https://myschemastore/main/schema1.json': {
          id: 'https://myschemastore/main/schema1.json',
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
          type: 'string',
          enum: ['object'],
          _$ref: 'schema2.json#/definitions/hello',
          url: 'https://myschemastore/main/schema2.json',
        });
        assert.deepEqual(fs.schema.properties['p2'], {
          type: 'string',
          enum: ['object'],
          _$ref: './schema2.json#/definitions/hello',
          url: 'https://myschemastore/main/schema2.json',
        });
        assert.deepEqual(fs.schema.properties['p3'], {
          type: 'string',
          enum: ['object'],
          _$ref: '/main/schema2.json#/definitions/hello',
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

  describe('Compound Schema Documents', () => {
    let validationHandler: ValidationHandler;
    let yamlSettings: SettingsState;
    let schemaProvider: TestCustomSchemaProvider;

    before(() => {
      const languageSettingsSetup = new ServiceSetup().withValidate();
      const {
        validationHandler: valHandler,
        yamlSettings: settings,
        schemaProvider: provider,
      } = setupLanguageService(languageSettingsSetup.languageSettings);
      validationHandler = valHandler;
      yamlSettings = settings;
      schemaProvider = provider;
    });

    function parseSetup(content: string, customSchemaID?: string): Promise<Diagnostic[]> {
      const testTextDocument = setupSchemaIDTextDocument(content, customSchemaID);
      yamlSettings.documents = new TextDocumentTestManager();
      (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
      return validationHandler.validateTextDocument(testTextDocument);
    }

    describe('embedded resources', () => {
      const ROOT_URI = 'https://example.com/schema/customer';
      const rootSchema: JsonSchema.JSONSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://example.com/schema/customer',
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { $ref: '/schema/common#/$defs/phone' },
          address: { $ref: '/schema/address' },
        },
        required: ['name', 'phone', 'address'],
        additionalProperties: false,
        $defs: {
          'https://example.com/schema/address': {
            $id: 'https://example.com/schema/address',
            type: 'object',
            properties: {
              address: { type: 'string' },
              city: { type: 'string' },
              postalCode: { $ref: '/schema/common#USZip' },
              state: { $ref: '#/$defs/states' },
            },
            required: ['address', 'city', 'postalCode', 'state'],
            additionalProperties: false,
            $defs: {
              states: {
                enum: ['CA', 'NY'],
              },
            },
          },
          'https://example.com/schema/common': {
            $schema: 'https://json-schema.org/draft/2019-09/schema',
            $id: 'https://example.com/schema/common',
            $defs: {
              phone: {
                type: 'string',
                pattern: '^[+]?[(]?[0-9]{3}[)]?[-s.]?[0-9]{3}[-s.]?[0-9]{4,6}$',
              },
              usaPostalCode: {
                $anchor: 'USZip',
                type: 'string',
                pattern: '^[0-9]{5}(?:-[0-9]{4})?$',
              },
              unsignedInt: {
                type: 'integer',
                minimum: 0,
              },
            },
          },
        },
      };

      beforeEach(() => {
        schemaProvider.addSchemaWithUri(ROOT_URI, ROOT_URI, rootSchema);
      });

      afterEach(() => {
        schemaProvider.deleteSchema(ROOT_URI);
      });

      it('accepts valid instances that reference embedded resources', async () => {
        const content = `name: "Customer1"
phone: "123-123-1234"
address:
  address: "123 King St"
  city: "San Francisco"
  postalCode: "12345-6789"
  state: "CA"
`;
        const result = await parseSetup(content, ROOT_URI);
        expect(result).to.be.empty;
      });

      it('reports validation errors across embedded resources', async () => {
        const content = `name: 123
phone: "not a phone"
address:
  address: "123 King St"
  city: "Toronto"
  postalCode: "ABCDE"
  state: "ZZ"
`;
        const result = await parseSetup(content, ROOT_URI);
        expect(result).to.have.length(4);
        expect(result[0].message).to.include('Incorrect type.');
        expect(result[0].message).to.include('string');
        expect(result[1].message).to.include('String does not match the pattern');
        expect(result[2].message).to.include('String does not match the pattern');
        expect(result[3].message).to.include('Value is not accepted. Valid values:');
        expect(result[3].message).to.include('CA');
        expect(result[3].message).to.include('NY');
      });
    });

    describe('cross-dialect behavior', () => {
      describe('ref sibling semantics across dialects', () => {
        const ROOT_URI = 'https://example.com/schema/root';

        describe('draft-07 root with draft-2019-09 embedded resource', () => {
          const rootSchema: JsonSchema.JSONSchema = {
            $schema: 'http://json-schema.org/draft-07/schema#',
            $id: 'https://example.com/schema/root',
            type: 'object',
            properties: {
              code: { $ref: '/schema/embedded' },
            },
            required: ['code'],
            additionalProperties: false,
            $defs: {
              'https://example.com/schema/embedded': {
                $schema: 'https://json-schema.org/draft/2019-09/schema',
                $id: 'https://example.com/schema/embedded',
                $defs: {
                  BaseString: { type: 'string' },
                },
                allOf: [
                  {
                    $ref: '#/$defs/BaseString',
                    minLength: 5,
                    pattern: '^foo',
                  },
                ],
              },
            },
          };

          beforeEach(() => {
            schemaProvider.addSchemaWithUri(ROOT_URI, ROOT_URI, rootSchema);
          });

          afterEach(() => {
            schemaProvider.deleteSchema(ROOT_URI);
          });

          it('applies $ref sibling constraints inside embedded 2019-09 resource', async () => {
            const content = `code: "bar"`;
            const result = await parseSetup(content, ROOT_URI);
            expect(result).to.have.length(2);
            expect(result[0].message).to.include('String is shorter than the minimum length of 5.');
            expect(result[1].message).to.include('String does not match the pattern');
          });

          it('accepts value that satisfies embedded 2019-09 constraints', async () => {
            const content = `code: "foobar"`;
            const result = await parseSetup(content, ROOT_URI);
            expect(result).to.be.empty;
          });
        });

        describe('draft-2019-09 root with draft-07 embedded resource', () => {
          const rootSchema: JsonSchema.JSONSchema = {
            $schema: 'https://json-schema.org/draft/2019-09/schema',
            $id: 'https://example.com/schema/root',
            type: 'object',
            properties: {
              code: { $ref: '/schema/embedded' },
            },
            required: ['code'],
            additionalProperties: false,
            $defs: {
              'https://example.com/schema/embedded': {
                $schema: 'http://json-schema.org/draft-07/schema#',
                $id: 'https://example.com/schema/embedded',
                $defs: {
                  BaseString: { type: 'string' },
                },
                allOf: [
                  {
                    $ref: '#/$defs/BaseString',
                    minLength: 999,
                    pattern: '^SHOULD_NOT_APPLY$',
                  },
                ],
              },
            },
          };

          beforeEach(() => {
            schemaProvider.addSchemaWithUri(ROOT_URI, ROOT_URI, rootSchema);
          });

          afterEach(() => {
            schemaProvider.deleteSchema(ROOT_URI);
          });

          it('ignores $ref sibling constraints inside embedded draft-07 resource', async () => {
            const content = `code: "bar"`;
            const result = await parseSetup(content, ROOT_URI);
            expect(result).to.be.empty;
          });

          it('still enforces the referenced target schema (type string)', async () => {
            const content = `code: 123`;
            const result = await parseSetup(content, ROOT_URI);
            expect(result).to.have.length(1);
            expect(result[0].message).to.include('Incorrect type.');
            expect(result[0].message).to.include('string');
          });
        });
      });

      describe('meta validation for mixed-dialect subschemas', () => {
        afterEach(() => {
          schemaProvider.deleteSchema(SCHEMA_ID);
        });

        it('draft-2020 root with draft-04 subschema', async () => {
          const schema: JsonSchema.JSONSchema = {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: {
              age: {
                allOf: [
                  {
                    $schema: 'http://json-schema.org/draft-04/schema#',
                    type: 'number',
                    minimum: 0,
                    exclusiveMinimum: 0,
                  },
                ],
              },
            },
          };
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const failResult = await parseSetup('age: 0');
          expect(failResult).to.have.length(1);
          expect(failResult[0].message).to.include('is not valid:');
          expect(failResult[0].message).to.include(SCHEMA_ID);
          expect(failResult[0].message).to.include('exclusiveMinimum : must be boolean');
        });

        it('draft-2020 root with draft-07 subschema', async () => {
          const schema: JsonSchema.JSONSchema = {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: {
              score: {
                anyOf: [
                  {
                    $schema: 'http://json-schema.org/draft-07/schema#',
                    type: 'number',
                    exclusiveMinimum: true,
                  },
                ],
              },
            },
          };
          schemaProvider.addSchema(SCHEMA_ID, schema);
          const failResult = await parseSetup('score: 0');
          expect(failResult).to.have.length(1);
          expect(failResult[0].message).to.include('is not valid:');
          expect(failResult[0].message).to.include(SCHEMA_ID);
          expect(failResult[0].message).to.include('exclusiveMinimum : must be number');
        });
      });
    });
  });

  it('FileSchema', function (testDone) {
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

  it('Array FileSchema', function (testDone) {
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

  it('Missing subschema', function (testDone) {
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

  it('Preloaded Schema', function (testDone) {
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

  it('Schema has url', async () => {
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

  it('Null Schema', function (testDone) {
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

  it('Schema not found', function (testDone) {
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

  it('Schema with non uri registers correctly', function (testDone) {
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
  it('Modifying schema', async () => {
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

  it('Deleting schema', async () => {
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

  it('Deleting schemas', async () => {
    const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
    service.setSchemaContributions({
      schemas: {
        'https://myschemastore/main/schema1.json': {
          type: 'object',
        },
      },
    });
    await service.deleteSchemas({
      action: MODIFICATION_ACTIONS.deleteAll,
      schemas: ['https://myschemastore/main/schema1.json'],
    } as SchemaService.SchemaDeletionsAll);
    const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
    assert.equal(fs, undefined);
  });

  it('Modifying schema works with kubernetes resolution', async () => {
    const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
    service.registerExternalSchema(KUBERNETES_SCHEMA_URL);

    await service.addContent({
      action: MODIFICATION_ACTIONS.add,
      path: '/oneOf/1/properties',
      key: 'foobar',
      content: ['hello', 'world'],
      schema: KUBERNETES_SCHEMA_URL,
    });

    const fs = await service.getResolvedSchema(KUBERNETES_SCHEMA_URL);
    assert.deepEqual(fs.schema.oneOf[1].properties['foobar'], ['hello', 'world']);
  });

  it('Deleting schema works with Kubernetes resolution', async () => {
    const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
    service.registerExternalSchema(KUBERNETES_SCHEMA_URL);

    await service.deleteContent({
      action: MODIFICATION_ACTIONS.delete,
      path: 'oneOf/1',
      key: 'properties',
      schema: KUBERNETES_SCHEMA_URL,
    });

    const fs = await service.getResolvedSchema(KUBERNETES_SCHEMA_URL);
    assert.equal(fs.schema.oneOf[1].properties, undefined);
  });

  it('Adding a brand new schema', async () => {
    const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
    service.saveSchema('hello_world', {
      enum: ['test1', 'test2'],
    });

    const hello_world_schema = await service.getResolvedSchema('hello_world');
    assert.deepEqual(hello_world_schema.schema.enum, ['test1', 'test2']);
  });

  it('Deleting an existing schema', async () => {
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
    const schemaModelineSample = path.join(__dirname, './fixtures/sample-modeline.json');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schemaDefaultSnippetSample = require(path.join(__dirname, './fixtures/defaultSnippets-const-if-else.json'));
    const languageSettingsSetup = new ServiceSetup().withCompletion();

    it('Modeline Schema takes precendence over all other schema APIs', async () => {
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
      languageService.configure(languageSettingsSetup.languageSettings);
      languageService.registerCustomSchemaProvider((uri: string) => Promise.resolve(uri));
      const testTextDocument = setupTextDocument(`# yaml-language-server: $schema=${schemaModelineSample}\n\n`);
      const result = await languageService.doComplete(testTextDocument, Position.create(1, 0), false);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].label, 'modeline');
    });

    it('Manually setting schema takes precendence over all other lower priority schemas', async () => {
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
      languageService.configure(languageSettingsSetup.languageSettings);
      const testTextDocument = setupTextDocument('');
      const result = await languageService.doComplete(testTextDocument, Position.create(0, 0), false);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].label, 'settings');
    });

    it('SchemaAssociation takes precendence over SchemaStore', async () => {
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
      languageService.configure(languageSettingsSetup.languageSettings);
      const testTextDocument = setupTextDocument('');
      const result = await languageService.doComplete(testTextDocument, Position.create(0, 0), false);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].label, 'association');
    });

    it('SchemaStore is highest priority if nothing else is available', async () => {
      languageSettingsSetup.withSchemaFileMatch({
        fileMatch: ['test.yaml'],
        uri: TEST_URI,
        priority: SchemaPriority.SchemaStore,
        schema: schemaStoreSample,
      });
      languageService.configure(languageSettingsSetup.languageSettings);
      const testTextDocument = setupTextDocument('');
      const result = await languageService.doComplete(testTextDocument, Position.create(0, 0), false);
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].label, 'schemastore');
    });

    it('Default snippet with description', async () => {
      languageSettingsSetup.withSchemaFileMatch({
        fileMatch: ['test.yaml'],
        uri: TEST_URI,
        priority: SchemaPriority.SchemaStore,
        schema: schemaDefaultSnippetSample,
      });
      languageService.configure(languageSettingsSetup.languageSettings);
      const testTextDocument = setupTextDocument('foo:  ');
      const result = await languageService.doComplete(testTextDocument, Position.create(0, 5), false);
      assert.strictEqual(result.items.length, 2);
      assert.notStrictEqual(result.items[0].documentation, undefined);
      assert.notStrictEqual(result.items[1].documentation, undefined);
      assert.strictEqual((result.items[0].documentation as MarkupContent).value, '# FooBar\n```Foo Bar```');
      assert.strictEqual((result.items[1].documentation as MarkupContent).value, '# FooBaz\n```Foo Baz```');
    });
  });

  describe('Test getGroupVersionKindFromDocument', function () {
    it('builtin kubernetes resource group should not get resolved', async () => {
      checkReturnGroupVersionKind('apiVersion: v1\nkind: Pod', true, undefined, 'v1', 'Pod');
    });

    it('builtin kubernetes resource with complex apiVersion should get resolved ', async () => {
      checkReturnGroupVersionKind(
        'apiVersion: admissionregistration.k8s.io/v1\nkind: MutatingWebhook',
        false,
        'admissionregistration.k8s.io',
        'v1',
        'MutatingWebhook'
      );
    });

    it('custom argo application CRD should get resolved', async () => {
      checkReturnGroupVersionKind(
        'apiVersion: argoproj.io/v1alpha1\nkind: Application',
        false,
        'argoproj.io',
        'v1alpha1',
        'Application'
      );
    });

    it('custom argo application CRD with whitespace should get resolved', async () => {
      checkReturnGroupVersionKind(
        'apiVersion: argoproj.io/v1alpha1\nkind: Application ',
        false,
        'argoproj.io',
        'v1alpha1',
        'Application'
      );
    });

    it('custom argo application CRD with other fields should get resolved', async () => {
      checkReturnGroupVersionKind(
        'someOtherVal: test\napiVersion: argoproj.io/v1alpha1\nkind: Application\nmetadata:\n  name: my-app',
        false,
        'argoproj.io',
        'v1alpha1',
        'Application'
      );
    });

    function checkReturnGroupVersionKind(
      content: string,
      error: boolean,
      expectedGroup: string,
      expectedVersion: string,
      expectedKind: string
    ): void {
      const yamlDoc = parser.parse(content);
      const res = getGroupVersionKindFromDocument(yamlDoc.documents[0]);
      if (error) {
        assert.strictEqual(res, undefined);
      } else {
        assert.strictEqual(res.group, expectedGroup);
        assert.strictEqual(res.version, expectedVersion);
        assert.strictEqual(res.kind, expectedKind);
      }
    }
  });

  describe('Test getSchemaFromModeline', function () {
    it('simple case', async () => {
      checkReturnSchemaUrl('# yaml-language-server: $schema=expectedUrl', 'expectedUrl');
    });

    it('with several spaces between # and yaml-language-server', async () => {
      checkReturnSchemaUrl('#    yaml-language-server: $schema=expectedUrl', 'expectedUrl');
    });

    it('with several spaces between yaml-language-server and :', async () => {
      checkReturnSchemaUrl('# yaml-language-server   : $schema=expectedUrl', 'expectedUrl');
    });

    it('with several spaces between : and $schema', async () => {
      checkReturnSchemaUrl('# yaml-language-server:    $schema=expectedUrl', 'expectedUrl');
    });

    it('with several spaces at the end', async () => {
      checkReturnSchemaUrl('# yaml-language-server: $schema=expectedUrl   ', 'expectedUrl');
    });

    it('with several spaces at several places', async () => {
      checkReturnSchemaUrl('#   yaml-language-server  :   $schema=expectedUrl   ', 'expectedUrl');
    });

    it('with several attributes', async () => {
      checkReturnSchemaUrl(
        '# yaml-language-server: anotherAttribute=test $schema=expectedUrl aSecondAttribtute=avalue',
        'expectedUrl'
      );
    });

    it('with tabs', async () => {
      checkReturnSchemaUrl('#\tyaml-language-server:\t$schema=expectedUrl', 'expectedUrl');
    });

    it('with several $schema - pick the first', async () => {
      checkReturnSchemaUrl('# yaml-language-server: $schema=url1 $schema=url2', 'url1');
    });

    it('no schema returned if not yaml-language-server', async () => {
      checkReturnSchemaUrl('# somethingelse: $schema=url1', undefined);
    });

    it('no schema returned if not $schema', async () => {
      checkReturnSchemaUrl('# yaml-language-server: $notschema=url1', undefined);
    });

    function checkReturnSchemaUrl(modeline: string, expectedResult: string): void {
      const yamlDoc = new parser.SingleYAMLDocument(new LineCounter());
      yamlDoc.lineComments = [modeline];
      assert.strictEqual(getSchemaFromModeline(yamlDoc), expectedResult);
    }
  });
});
