'use strict';

import assert = require('assert');
import * as SchemaService from '../src/languageservice/services/yamlSchemaService';
import * as JsonSchema from '../src/languageservice/jsonSchema';
import fs = require('fs');
import url = require('url');
import path = require('path');
import { XHRResponse, xhr } from 'request-light';
import { MODIFICATION_ACTIONS, SchemaDeletions } from '../src/languageservice/services/yamlSchemaService';
import { KUBERNETES_SCHEMA_URL } from '../src/languageservice/utils/schemaUrls';

const fixtureDocuments = {
    'http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json': 'deploymentTemplate.json',
    'http://schema.management.azure.com/schemas/2015-01-01/deploymentParameters.json': 'deploymentParameters.json',
    'http://schema.management.azure.com/schemas/2015-01-01/Microsoft.Authorization.json': 'Microsoft.Authorization.json',
    'http://schema.management.azure.com/schemas/2015-01-01/Microsoft.Resources.json': 'Microsoft.Resources.json',
    'http://schema.management.azure.com/schemas/2014-04-01-preview/Microsoft.Sql.json': 'Microsoft.Sql.json',
    'http://schema.management.azure.com/schemas/2014-06-01/Microsoft.Web.json': 'Microsoft.Web.json',
    'http://schema.management.azure.com/schemas/2014-04-01/SuccessBricks.ClearDB.json': 'SuccessBricks.ClearDB.json',
    'http://schema.management.azure.com/schemas/2015-08-01/Microsoft.Compute.json': 'Microsoft.Compute.json'
};

const requestServiceMock = function (uri: string): Promise<string> {
    if (uri.length && uri[uri.length - 1] === '#') {
        uri = uri.substr(0, uri.length - 1);
    }

    const fileName = fixtureDocuments[uri];

    if (fileName) {
        return new Promise<string>((c, e) => {
            const fixturePath = path.join(__dirname, './fixtures', fileName);
            fs.readFile(fixturePath, 'UTF-8', (err, result) => {
                err ? e('Resource not found.') : c(result.toString());
            });
        });
    }
    return Promise.reject<string>('Resource not found.');
};

const workspaceContext = {
    resolveRelativePath: (relativePath: string, resource: string) =>
        url.resolve(resource, relativePath)
};

const schemaRequestServiceForURL = (uri: string): Thenable<string> => {
    const headers = { 'Accept-Encoding': 'gzip, deflate' };
    return xhr({ url: uri, followRedirects: 5, headers }).then(response =>
        response.responseText, (error: XHRResponse) =>
        Promise.reject(error.responseText || error.toString()));
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
                            '$ref': 'https://myschemastore/child'
                        }
                    }
                },
                'https://myschemastore/child': {
                    id: 'https://myschemastore/child',
                    type: 'bool',
                    description: 'Test description'
                }
            }
        });

        service.getResolvedSchema('https://myschemastore/main').then(solvedSchema => {
            assert.deepEqual(solvedSchema.schema.properties['child'], {
                id: 'https://myschemastore/child',
                type: 'bool',
                description: 'Test description'
            });
        }).then(() => testDone(), error => {
            testDone(error);
        });
    });

    test('Resolving $refs 2', function (testDone) {
        const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
        service.setSchemaContributions({
            schemas: {
                'https://json.schemastore.org/swagger-2.0': {
                    id: 'https://json.schemastore.org/swagger-2.0',
                    type: 'object',
                    properties: {
                        'responseValue': {
                            '$ref': '#/definitions/jsonReference'
                        }
                    },
                    definitions: {
                        'jsonReference': {
                            'type': 'object',
                            'required': ['$ref'],
                            'properties': {
                                '$ref': {
                                    'type': 'string'
                                }
                            }
                        }
                    }
                }
            }
        });

        service.getResolvedSchema('https://json.schemastore.org/swagger-2.0').then(fs => {
            assert.deepEqual(fs.schema.properties['responseValue'], {
                type: 'object',
                required: ['$ref'],
                properties: { $ref: { type: 'string' } }
            });
        }).then(() => testDone(), error => {
            testDone(error);
        });

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
                            '$ref': 'schema2.json#/definitions/hello'
                        },
                        p2: {
                            '$ref': './schema2.json#/definitions/hello'
                        },
                        p3: {
                            '$ref': '/main/schema2.json#/definitions/hello'
                        }
                    }
                },
                'https://myschemastore/main/schema2.json': {
                    id: 'https://myschemastore/main/schema2.json',
                    definitions: {
                        'hello': {
                            'type': 'string',
                            'enum': ['object'],
                        }
                    }
                }
            }
        });

        service.getResolvedSchema('https://myschemastore/main/schema1.json').then(fs => {
            assert.deepEqual(fs.schema.properties['p1'], {
                type: 'string',
                enum: ['object']
            });
            assert.deepEqual(fs.schema.properties['p2'], {
                type: 'string',
                enum: ['object']
            });
            assert.deepEqual(fs.schema.properties['p3'], {
                type: 'string',
                enum: ['object']
            });
        }).then(() => testDone(), error => {
            testDone(error);
        });

    });

    test('FileSchema', function (testDone) {
        const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);

        service.setSchemaContributions({
            schemas: {
                'main': {
                    id: 'main',
                    type: 'object',
                    properties: {
                        child: {
                            type: 'object',
                            properties: {
                                'grandchild': {
                                    type: 'number',
                                    description: 'Meaning of Life'
                                }
                            }
                        }
                    }
                }
            }
        });

        service.getResolvedSchema('main').then(fs => {
            const section = fs.getSection(['child', 'grandchild']);
            assert.equal(section.description, 'Meaning of Life');
        }).then(() => testDone(), error => {
            testDone(error);
        });
    });

    test('Array FileSchema', function (testDone) {
        const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);

        service.setSchemaContributions({
            schemas: {
                'main': {
                    id: 'main',
                    type: 'object',
                    properties: {
                        child: {
                            type: 'array',
                            items: {
                                'type': 'object',
                                'properties': {
                                    'grandchild': {
                                        type: 'number',
                                        description: 'Meaning of Life'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        service.getResolvedSchema('main').then(fs => {
            const section = fs.getSection(['child', '0', 'grandchild']);
            assert.equal(section.description, 'Meaning of Life');
        }).then(() => testDone(), error => {
            testDone(error);
        });
    });

    test('Missing subschema', function (testDone) {
        const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);

        service.setSchemaContributions({
            schemas: {
                'main': {
                    id: 'main',
                    type: 'object',
                    properties: {
                        child: {
                            type: 'object'
                        }
                    }
                }
            }
        });

        service.getResolvedSchema('main').then(fs => {
            const section = fs.getSection(['child', 'grandchild']);
            assert.strictEqual(section, undefined);
        }).then(() => testDone(), error => {
            testDone(error);
        });
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
                        'grandchild': {
                            type: 'number',
                            description: 'Meaning of Life'
                        }
                    }
                }
            }
        };

        service.registerExternalSchema(id, ['*.json'], schema);

        service.getSchemaForResource('test.json').then(schema => {
            const section = schema.getSection(['child', 'grandchild']);
            assert.equal(section.description, 'Meaning of Life');
        }).then(() => testDone(), error => {
            testDone(error);
        });
    });

    test('Null Schema', function (testDone) {
        const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);

        service.getSchemaForResource('test.json').then(schema => {
            assert.equal(schema, null);
        }).then(() => testDone(), error => {
            testDone(error);
        });
    });

    test('Schema not found', function (testDone) {
        const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);

        service.loadSchema('test.json').then(schema => {
            assert.notEqual(schema.errors.length, 0);
        }).then(() => testDone(), error => {
            testDone(error);
        });
    });

    test('Schema with non uri registers correctly', function (testDone) {
        const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
        const non_uri = 'non_uri';
        service.registerExternalSchema(non_uri, ['*.yml', '*.yaml'], {
           'properties': {
              'test_node': {
                  'description': 'my test_node description',
                  'enum': [
                      'test 1',
                      'test 2'
                  ]
              }
           }
        });
       service.getResolvedSchema(non_uri).then(schema => {
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
                            enum: [
                                'v1'
                            ]
                        },
                        kind: {
                            type: 'string',
                            enum: [
                                'Pod'
                            ]
                        }
                    }
                }
            }
        });

        await service.addContent({
            action: MODIFICATION_ACTIONS.add,
            path: 'properties/apiVersion',
            key: 'enum',
            content: [
                'v2',
                'v3',
            ],
            schema: 'https://myschemastore/main/schema1.json'
        });

        const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
        assert.deepEqual(fs.schema.properties['apiVersion'], {
            type: 'string',
            enum: ['v2', 'v3']
        });
        assert.deepEqual(fs.schema.properties['kind'], {
            type: 'string',
            enum: ['Pod']
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
                            enum: [
                                'v1'
                            ]
                        },
                        kind: {
                            type: 'string',
                            enum: [
                                'Pod'
                            ]
                        }
                    }
                }
            }
        });

        await service.deleteContent({
            action: MODIFICATION_ACTIONS.delete,
            path: 'properties',
            key: 'apiVersion',
            schema: 'https://myschemastore/main/schema1.json'
        } as SchemaDeletions);

        const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
        assert.notDeepEqual(fs.schema.properties['apiVersion'], {
            type: 'string',
            enum: ['v2', 'v3']
        });
        assert.equal(fs.schema.properties['apiVersion'], undefined);
        assert.deepEqual(fs.schema.properties['kind'], {
            type: 'string',
            enum: ['Pod']
        });
    });

    test('Modifying schema works with kubernetes resolution', async () => {
        const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
        service.registerExternalSchema(KUBERNETES_SCHEMA_URL);

        await service.addContent({
            action: MODIFICATION_ACTIONS.add,
            path: 'oneOf/1/properties/kind',
            key: 'enum',
            content: [
                'v2',
                'v3',
            ],
            schema: KUBERNETES_SCHEMA_URL
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
            schema: KUBERNETES_SCHEMA_URL
        });

        const fs = await service.getResolvedSchema(KUBERNETES_SCHEMA_URL);
        assert.equal(fs.schema.oneOf[1].properties['kind']['enum'], undefined);
    });

    test('Adding a brand new schema', async () => {
        const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
        service.saveSchema('hello_world', {
            enum: [
                'test1',
                'test2'
            ]
        });

        const hello_world_schema = await service.getResolvedSchema('hello_world');
        assert.deepEqual(hello_world_schema.schema.enum, ['test1', 'test2']);
    });

    test('Deleting an existing schema', async () => {
        const service = new SchemaService.YAMLSchemaService(schemaRequestServiceForURL, workspaceContext);
        service.saveSchema('hello_world', {
            enum: [
                'test1',
                'test2'
            ]
        });

        await service.deleteSchema('hello_world');

        const hello_world_schema = await service.getResolvedSchema('hello_world');
        assert.equal(hello_world_schema, null);
    });
});
