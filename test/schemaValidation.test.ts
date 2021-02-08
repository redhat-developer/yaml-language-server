/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';
import { createExpectedError } from './utils/verifyError';
import { ServiceSetup } from './utils/serviceSetup';
import {
  StringTypeError,
  BooleanTypeError,
  ArrayTypeError,
  ObjectTypeError,
  IncludeWithoutValueError,
  ColonMissingError,
  BlockMappingEntryError,
  DuplicateKeyError,
  propertyIsNotAllowed,
} from './utils/errorMessages';
import * as assert from 'assert';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { expect } from 'chai';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import { LanguageService } from '../src/languageservice/yamlLanguageService';
import { KUBERNETES_SCHEMA_URL } from '../src/languageservice/utils/schemaUrls';

describe('Validation Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let validationHandler: ValidationHandler;
  let languageService: LanguageService;
  let yamlSettings: SettingsState;

  before(() => {
    languageSettingsSetup = new ServiceSetup()
      .withValidate()
      .withCustomTags(['!Test', '!Ref sequence'])
      .withSchemaFileMatch({ uri: KUBERNETES_SCHEMA_URL, fileMatch: ['.drone.yml'] })
      .withSchemaFileMatch({ uri: 'https://json.schemastore.org/drone', fileMatch: ['.drone.yml'] })
      .withSchemaFileMatch({ uri: KUBERNETES_SCHEMA_URL, fileMatch: ['test.yml'] })
      .withSchemaFileMatch({ uri: 'https://json.schemastore.org/composer', fileMatch: ['test.yml'] });
    const { languageService: langService, validationHandler: valHandler, yamlSettings: settings } = setupLanguageService(
      languageSettingsSetup.languageSettings
    );
    languageService = langService;
    validationHandler = valHandler;
    yamlSettings = settings;
  });

  function parseSetup(content: string, customSchemaID?: string): Promise<Diagnostic[]> {
    const testTextDocument = setupSchemaIDTextDocument(content, customSchemaID);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return validationHandler.validateTextDocument(testTextDocument);
  }

  afterEach(() => {
    languageService.deleteSchema(SCHEMA_ID);
  });

  describe('Boolean tests', () => {
    it('Boolean true test', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = 'analytics: true';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Basic false test', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = 'analytics: false';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Test that boolean value without quotations is valid', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = 'analytics: no';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Test that boolean value in quotations is interpreted as string not boolean', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = 'analytics: "no"';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
          assert.deepEqual(
            result[0],
            createExpectedError(BooleanTypeError, 0, 11, 0, 15, DiagnosticSeverity.Error, `yaml-schema: file:///${SCHEMA_ID}`)
          );
        })
        .then(done, done);
    });

    it('Error on incorrect value type (boolean)', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
          },
        },
      });
      const content = 'cwd: False';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
          assert.deepEqual(
            result[0],
            createExpectedError(StringTypeError, 0, 5, 0, 10, DiagnosticSeverity.Error, `yaml-schema: file:///${SCHEMA_ID}`)
          );
        })
        .then(done, done);
    });
  });

  describe('String tests', () => {
    it('Test that boolean inside of quotations is of type string', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'string',
          },
        },
      });
      const content = 'analytics: "no"';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Type string validates under children', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            type: 'object',
            properties: {
              register: {
                type: 'string',
              },
            },
          },
        },
      });
      const content = 'registry:\n  register: file://test_url';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Type String does not error on valid node', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
          },
        },
      });
      const content = 'cwd: this';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Error on incorrect value type (string)', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = 'analytics: hello';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
          assert.deepEqual(
            result[0],
            createExpectedError(BooleanTypeError, 0, 11, 0, 16, DiagnosticSeverity.Error, `yaml-schema: file:///${SCHEMA_ID}`)
          );
        })
        .then(done, done);
    });

    it('Test that boolean is invalid when no strings present and schema wants string', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
          },
        },
      });
      const content = 'cwd: no';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
          assert.deepEqual(
            result[0],
            createExpectedError(StringTypeError, 0, 5, 0, 7, DiagnosticSeverity.Error, `yaml-schema: file:///${SCHEMA_ID}`)
          );
        })
        .then(done, done);
    });
  });

  describe('Number tests', () => {
    it('Type Number does not error on valid node', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          timeout: {
            type: 'number',
          },
        },
      });
      const content = 'timeout: 60000';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Error on incorrect value type (number)', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
          },
        },
      });
      const content = 'cwd: 100000';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
          assert.deepEqual(
            result[0],
            createExpectedError(StringTypeError, 0, 5, 0, 11, DiagnosticSeverity.Error, `yaml-schema: file:///${SCHEMA_ID}`)
          );
        })
        .then(done, done);
    });
  });

  describe('Object tests', () => {
    it('Basic test on nodes with children', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            type: 'object',
            properties: {
              preinstall: {
                type: 'string',
              },
              postinstall: {
                type: 'string',
              },
            },
          },
        },
      });
      const content = 'scripts:\n  preinstall: test1\n  postinstall: test2';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Test with multiple nodes with children', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
          cwd: {
            type: 'string',
          },
          scripts: {
            type: 'object',
            properties: {
              preinstall: {
                type: 'string',
              },
              postinstall: {
                type: 'string',
              },
            },
          },
        },
      });
      const content = 'analytics: true\ncwd: this\nscripts:\n  preinstall: test1\n  postinstall: test2';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Type Object does not error on valid node', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          registry: {
            type: 'object',
            properties: {
              search: {
                type: 'string',
              },
            },
          },
        },
      });
      const content = 'registry:\n  search: file://test_url';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Error on incorrect value type (object)', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          scripts: {
            type: 'object',
            properties: {
              search: {
                type: 'string',
              },
            },
          },
        },
      });
      const content = 'scripts: test';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
          assert.deepEqual(
            result[0],
            createExpectedError(ObjectTypeError, 0, 9, 0, 13, DiagnosticSeverity.Error, `yaml-schema: file:///${SCHEMA_ID}`)
          );
        })
        .then(done, done);
    });
  });

  describe('Array tests', () => {
    it('Type Array does not error on valid node', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          resolvers: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      });
      const content = 'resolvers:\n  - test\n  - test\n  - test';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Error on incorrect value type (array)', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          resolvers: {
            type: 'array',
          },
        },
      });
      const content = 'resolvers: test';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
          assert.deepEqual(
            result[0],
            createExpectedError(ArrayTypeError, 0, 11, 0, 15, DiagnosticSeverity.Error, `yaml-schema: file:///${SCHEMA_ID}`)
          );
        })
        .then(done, done);
    });
  });

  describe('Anchor tests', () => {
    it('Anchor should not not error', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          default: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
              },
            },
          },
        },
      });
      const content = 'default: &DEFAULT\n  name: Anchor\nanchor_test:\n  <<: *DEFAULT';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Anchor with multiple references should not not error', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          default: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
              },
            },
          },
        },
      });
      const content = 'default: &DEFAULT\n  name: Anchor\nanchor_test:\n  <<: *DEFAULT\nanchor_test2:\n  <<: *DEFAULT';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Multiple Anchor in array of references should not not error', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          default: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
              },
            },
          },
        },
      });
      const content =
        'default: &DEFAULT\n  name: Anchor\ncustomname: &CUSTOMNAME\n  custom_name: Anchor\nanchor_test:\n  <<: [*DEFAULT, *CUSTOMNAME]';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Multiple Anchors being referenced in same level at same time', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          customize: {
            type: 'object',
            properties: {
              register: {
                type: 'string',
              },
            },
          },
        },
      });
      const content =
        'default: &DEFAULT\n  name: Anchor\ncustomname: &CUSTOMNAME\n  custom_name: Anchor\nanchor_test:\n  <<: *DEFAULT\n  <<: *CUSTOMNAME\n';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });
  });

  describe('Custom tag tests', () => {
    it('Custom Tags without type', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = 'analytics: !Test false';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Custom Tags with type', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          resolvers: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      });
      const content = 'resolvers: !Ref\n  - test';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Include with value should not error', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          customize: {
            type: 'string',
          },
        },
      });
      const content = 'customize: !include customize.yaml';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Include without value should error', (done) => {
      const content = 'customize: !include';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
          assert.deepEqual(result[0], createExpectedError(IncludeWithoutValueError, 0, 19, 0, 19));
        })
        .then(done, done);
    });
  });

  describe('Multiple type tests', function () {
    it('Do not error when there are multiple types in schema and theyre valid', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          license: {
            type: ['string', 'boolean'],
          },
        },
      });
      const content = 'license: MIT';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });
  });

  describe('Invalid YAML errors', function () {
    it('Error when theres a finished untyped item', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
          },
          analytics: {
            type: 'boolean',
          },
        },
      });
      const content = 'cwd: hello\nan';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 2);
          assert.deepEqual(result[0], createExpectedError(BlockMappingEntryError, 1, 2, 1, 2));
          assert.deepEqual(result[1], createExpectedError(ColonMissingError, 1, 2, 1, 2));
        })
        .then(done, done);
    });

    it('Error when theres no value for a node', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
          },
        },
      });
      const content = 'cwd:';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 1);
          assert.deepEqual(
            result[0],
            createExpectedError(StringTypeError, 0, 4, 0, 4, DiagnosticSeverity.Error, `yaml-schema: file:///${SCHEMA_ID}`)
          );
        })
        .then(done, done);
    });
  });

  describe('Test with no schemas', () => {
    it('Duplicate properties are reported', (done) => {
      const content = 'kind: a\ncwd: b\nkind: c';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 2);
          assert.deepEqual(result[0], createExpectedError(DuplicateKeyError, 2, 0, 2, 0));
          assert.deepEqual(result[1], createExpectedError(DuplicateKeyError, 0, 0, 0, 0));
        })
        .then(done, done);
    });
  });

  describe('Test anchors', function () {
    it('Test that anchors with a schema do not report Property << is not allowed', (done) => {
      const schema = {
        type: 'object',
        properties: {
          sample: {
            type: 'object',
            properties: {
              prop1: {
                type: 'string',
              },
              prop2: {
                type: 'string',
              },
            },
            additionalProperties: false,
          },
        },
        $schema: 'http://json-schema.org/draft-07/schema#',
      };
      languageService.addSchema(SCHEMA_ID, schema);
      const content = 'test: &test\n  prop1: hello\nsample:\n  <<: *test\n  prop2: another_test';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });
  });

  describe('Test with custom kubernetes schemas', function () {
    it('Test that properties that match multiple enums get validated properly', (done) => {
      languageService.configure(languageSettingsSetup.withKubernetes().languageSettings);
      yamlSettings.specificValidatorPaths = ['*.yml', '*.yaml'];

      const schema = {
        definitions: {
          ImageStreamImport: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['ImageStreamImport'],
              },
            },
          },
          ImageStreamLayers: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['ImageStreamLayers'],
              },
            },
          },
        },
        oneOf: [
          {
            $ref: '#/definitions/ImageStreamImport',
          },
          {
            $ref: '#/definitions/ImageStreamLayers',
          },
        ],
      };
      languageService.addSchema(SCHEMA_ID, schema);
      const content = 'kind: ';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 2);
          // eslint-disable-next-line
          assert.equal(result[1].message, `Value is not accepted. Valid values: "ImageStreamImport", "ImageStreamLayers".`);
        })
        .then(done, done);
    });
  });

  // https://github.com/redhat-developer/yaml-language-server/issues/118
  describe('Null literals', () => {
    ['NULL', 'Null', 'null', '~', ''].forEach((content) => {
      it(`Test type null is parsed from [${content}]`, (done) => {
        const schema = {
          type: 'object',
          properties: {
            nulltest: {
              type: 'null',
            },
          },
        };
        languageService.addSchema(SCHEMA_ID, schema);
        const validator = parseSetup('nulltest: ' + content);
        validator
          .then(function (result) {
            assert.equal(result.length, 0);
          })
          .then(done, done);
      });
    });

    it('Test type null is working correctly in array', (done) => {
      const schema = {
        properties: {
          values: {
            type: 'array',
            items: {
              type: 'null',
            },
          },
        },
        required: ['values'],
      };
      languageService.addSchema(SCHEMA_ID, schema);
      const content = 'values: [Null, NULL, null, ~,]';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });
  });

  describe('Multi Document schema validation tests', () => {
    it('Document does not error when --- is present with schema', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
          },
        },
      });
      const content = '---\n# this is a test\ncwd: this';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });

    it('Multi Document does not error when --- is present with schema', (done) => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
          },
        },
      });
      const content = '---\n# this is a test\ncwd: this...\n---\n# second comment\ncwd: hello\n...';
      const validator = parseSetup(content);
      validator
        .then(function (result) {
          assert.equal(result.length, 0);
        })
        .then(done, done);
    });
  });

  describe('Schema with title', () => {
    it('validator uses schema title instead of url', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        title: 'Schema Super title',
        properties: {
          analytics: {
            type: 'string',
          },
        },
      });
      const content = 'analytics: 1';
      const result = await parseSetup(content);
      expect(result[0]).deep.equal(
        createExpectedError(StringTypeError, 0, 11, 0, 12, DiagnosticSeverity.Error, 'yaml-schema: Schema Super title')
      );
    });
  });

  describe('Multiple schema for single file', () => {
    it('should add proper source to diagnostic', async () => {
      const content = `
      abandoned: v1
      archive:
        exclude:
          asd: asd`;
      languageService.configure(languageSettingsSetup.withKubernetes().languageSettings);
      yamlSettings.specificValidatorPaths = ['*.yml', '*.yaml'];
      const result = await parseSetup(content, 'file://~/Desktop/vscode-yaml/test.yml');
      expect(result[0]).deep.equal(
        createExpectedError(ArrayTypeError, 4, 10, 4, 18, DiagnosticSeverity.Error, 'yaml-schema: Package')
      );
    });

    it('should add proper source to diagnostic in case of drone', async () => {
      const content = `
      apiVersion: v1
      kind: Deployment
      `;

      const result = await parseSetup(content, 'file://~/Desktop/vscode-yaml/.drone.yml');
      expect(result[5]).deep.equal(
        createExpectedError(
          propertyIsNotAllowed('apiVersion'),
          1,
          6,
          1,
          16,
          DiagnosticSeverity.Error,
          'yaml-schema: Drone CI configuration file'
        )
      );
    });
  });

  describe('Conditional Schema', () => {
    it('validator use "then" block if "if" valid', async () => {
      languageService.addSchema(SCHEMA_ID, {
        type: 'object',
        default: [],
        properties: {
          name: {
            type: 'string',
          },
          var: {
            type: 'string',
          },
        },
        if: {
          properties: {
            var: {
              type: 'string',
            },
          },
        },
        then: {
          required: ['pineapple'],
        },
        else: {
          required: ['tomato'],
        },
        additionalProperties: true,
      });
      const content = `
      name: aName
      var: something
      inputs:`;
      const result = await parseSetup(content);
      expect(result[0].message).to.eq('Missing property "pineapple".');
    });
  });

  describe('Schema with uri-reference', () => {
    it('should validate multiple uri-references', async () => {
      const schemaWithURIReference = {
        type: 'object',
        properties: {
          one: {
            type: 'string',
            format: 'uri-reference',
          },
        },
      };
      languageService.addSchema(SCHEMA_ID, schemaWithURIReference);
      let content = `
      one: '//foo/bar'
      `;
      let result = await parseSetup(content);
      expect(result.length).to.eq(0);

      content = `
      one: '#/components/schemas/service'
      `;
      result = await parseSetup(content);
      expect(result.length).to.eq(0);

      content = `
      one: 'some/relative/path/foo.schema.yaml'
      `;
      result = await parseSetup(content);
      expect(result.length).to.eq(0);

      content = `
      one: 'http://foo/bar'
      `;
      result = await parseSetup(content);
      expect(result.length).to.eq(0);
    });

    it('should not validate empty uri-reference', async () => {
      const schemaWithURIReference = {
        type: 'object',
        properties: {
          one: {
            type: 'string',
            format: 'uri-reference',
          },
        },
      };
      languageService.addSchema(SCHEMA_ID, schemaWithURIReference);
      const content = `
      one: ''
      `;
      const result = await parseSetup(content);
      expect(result.length).to.eq(1);
      expect(result[0].message).to.eq('String is not a URI: URI expected.');
    });
  });
});
