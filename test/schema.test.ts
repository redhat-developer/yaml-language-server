'use strict';

import assert = require('assert');
import * as SchemaService from '../src/languageservice/services/jsonSchemaService';
import * as JsonSchema from '../src/languageservice/jsonSchema';
import fs = require('fs');
import url = require('url');
import path = require('path');

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
	let fileName = fixtureDocuments[uri];
	if (fileName) {
		return new Promise<string>((c, e) => {
			let fixturePath = path.join(__dirname, './fixtures', fileName);
			fs.readFile(fixturePath, 'UTF-8', (err, result) => {
				err ? e("Resource not found.") : c(result.toString());
			});
		});
	}
	return Promise.reject<string>("Resource not found.");
};


let workspaceContext = {
	resolveRelativePath: (relativePath: string, resource: string) => {
		return url.resolve(resource, relativePath);
	}
};

suite('JSON Schema', () => {
	test('Resolving $refs', function (testDone) {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main": {
					id: 'https://myschemastore/main',
					type: 'object',
					properties: {
						child: {
							'$ref': 'https://myschemastore/child'
						}
					}
				},
				"https://myschemastore/child": {
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
		}).then(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Resolving $refs 2', function (testDone) {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"http://json.schemastore.org/swagger-2.0": {
					id: 'http://json.schemastore.org/swagger-2.0',
					type: 'object',
					properties: {
						"responseValue": {
							"$ref": "#/definitions/jsonReference"
						}
					},
					definitions: {
						"jsonReference": {
							"type": "object",
							"required": ["$ref"],
							"properties": {
								"$ref": {
									"type": "string"
								}
							}
						}
					}
				}
			}
		});

		service.getResolvedSchema('http://json.schemastore.org/swagger-2.0').then(fs => {
			assert.deepEqual(fs.schema.properties['responseValue'], {
				type: 'object',
				required: ["$ref"],
				properties: { $ref: { type: 'string' } }
			});
		}).then(() => testDone(), (error) => {
			testDone(error);
		});

	});

	test('Resolving $refs 3', function (testDone) {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
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
				"https://myschemastore/main/schema2.json": {
					id: 'https://myschemastore/main/schema2.json',
					definitions: {
						"hello": {
							"type": "string",
							"enum": ["object"],
						}
					}
				}
			}
		});

		service.getResolvedSchema('https://myschemastore/main/schema1.json').then(fs => {
			assert.deepEqual(fs.schema.properties['p1'], {
				type: 'string',
				enum: ["object"]
			});
			assert.deepEqual(fs.schema.properties['p2'], {
				type: 'string',
				enum: ["object"]
			});
			assert.deepEqual(fs.schema.properties['p3'], {
				type: 'string',
				enum: ["object"]
			});
		}).then(() => testDone(), (error) => {
			testDone(error);
		});

	});

	test('FileSchema', function (testDone) {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"main": {
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
			let section = fs.getSection(['child', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		}).then(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Array FileSchema', function (testDone) {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"main": {
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
			let section = fs.getSection(['child', '0', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		}).then(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Missing subschema', function (testDone) {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"main": {
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
			let section = fs.getSection(['child', 'grandchild']);
			assert.strictEqual(section, null);
		}).then(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Preloaded Schema', function (testDone) {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		let id = 'https://myschemastore/test1';
		let schema: JsonSchema.JSONSchema = {
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

		service.getSchemaForResource('test.json').then((schema) => {
			let section = schema.getSection(['child', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		}).then(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Null Schema', function (testDone) {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		service.getSchemaForResource('test.json').then((schema) => {
			assert.equal(schema, null);
		}).then(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Schema not found', function (testDone) {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		service.loadSchema('test.json').then((schema) => {
			assert.notEqual(schema.errors.length, 0);
		}).then(() => testDone(), (error) => {
			testDone(error);
		});
	});
});