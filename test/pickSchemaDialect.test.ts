/*---------------------------------------------------------------------------------------------
 *  Test for pickSchemaDialect fix: `this.loadSchema` was called in a module-level
 *  function where `this` is undefined, causing a TypeError for custom meta-schemas.
 *
 *  The fix passes `loadSchema` as a callback parameter instead.
 *--------------------------------------------------------------------------------------------*/
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument, TestCustomSchemaProvider } from './utils/testHelper';
import * as assert from 'assert';
import { ServiceSetup } from './utils/serviceSetup';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { LanguageService } from '../src';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';

describe('pickSchemaDialect fix', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageService: LanguageService;
  let validationHandler: ValidationHandler;
  let yamlSettings: SettingsState;
  let schemaProvider: TestCustomSchemaProvider;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withValidate();
    const {
      languageService: langService,
      validationHandler: valHandler,
      yamlSettings: settings,
      schemaProvider: testSchemaProvider,
    } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageService = langService;
    validationHandler = valHandler;
    yamlSettings = settings;
    schemaProvider = testSchemaProvider;
  });

  afterEach(() => {
    schemaProvider.deleteSchema(SCHEMA_ID);
    languageService.configure(languageSettingsSetup.languageSettings);
  });

  function validate(content: string): Promise<import('vscode-languageserver-types').Diagnostic[]> {
    const testTextDocument = setupSchemaIDTextDocument(content);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return validationHandler.validateTextDocument(testTextDocument);
  }

  it('should not throw TypeError for custom $schema URI requiring meta-schema loading', async () => {
    // This schema uses a custom $schema URI that is NOT one of the well-known
    // draft URIs. Before the fix, pickSchemaDialect would crash with
    // "Cannot read properties of undefined (reading 'loadSchema')"
    // because `this` was undefined in the module-level function.
    const schemaWithCustomDialect = {
      $schema: 'https://example.com/my-custom-meta-schema/v1',
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'integer' },
      },
    };

    schemaProvider.addSchema(SCHEMA_ID, schemaWithCustomDialect);

    // This should NOT throw — before the fix it would crash during schema resolution
    let error: Error | undefined;
    try {
      await validate('name: test\ncount: 42');
    } catch (e) {
      error = e as Error;
    }

    assert.strictEqual(error, undefined, `Validation should not throw, but got: ${error?.message}`);
  });

  it('known draft URIs still work correctly', async () => {
    const draft07Schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        value: { type: 'integer' },
      },
    };

    schemaProvider.addSchema(SCHEMA_ID, draft07Schema);

    const diagnostics = await validate('value: "not-an-integer"');
    const typeErrors = diagnostics.filter((d) => d.message.includes('integer') || d.message.includes('type'));
    assert.ok(typeErrors.length > 0, `Expected type error for value, got: ${diagnostics.map((d) => d.message).join('; ')}`);
  });

  it('draft-2020-12 URI is recognized and validates correctly', async () => {
    const draft2020Schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
    };

    schemaProvider.addSchema(SCHEMA_ID, draft2020Schema);

    const diagnostics = await validate('count: 1');
    const requiredErrors = diagnostics.filter((d) => d.message.includes('name') || d.message.includes('required'));
    assert.ok(requiredErrors.length > 0, `Expected 'name required' error, got: ${diagnostics.map((d) => d.message).join('; ')}`);
  });

  it('schema with nested $schema on sub-definitions does not crash', async () => {
    // Simulates K8s schemas embedded as $defs with their own $schema
    const schemaWithNestedDialects = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        securityContext: {
          $ref: '#/$defs/podSecurityContext',
        },
      },
      $defs: {
        podSecurityContext: {
          // K8s uses the unversioned meta-schema URI
          $schema: 'http://json-schema.org/schema#',
          type: 'object',
          properties: {
            runAsUser: { type: 'integer' },
            runAsGroup: { type: 'integer' },
          },
        },
      },
    };

    schemaProvider.addSchema(SCHEMA_ID, schemaWithNestedDialects);

    // Should not throw
    const diagnostics = await validate('securityContext:\n  runAsUser: 1000');
    // No type errors expected — value is valid
    const typeErrors = diagnostics.filter((d) => d.message.includes('type'));
    assert.strictEqual(typeErrors.length, 0, `Unexpected type errors: ${typeErrors.map((d) => d.message).join('; ')}`);
  });
});
