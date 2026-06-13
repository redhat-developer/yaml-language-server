/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { setupLanguageService, setupTextDocument } from './utils/testHelper';
import assert from 'assert';
import type { Diagnostic, CompletionList, Hover } from 'vscode-languageserver-types';
import { MarkupContent } from 'vscode-languageserver-types';
import { ServiceSetup } from './utils/serviceSetup';
import type { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import type { SettingsState } from '../src/yamlSettings';
import { TextDocumentTestManager } from '../src/yamlSettings';
import type { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';

// Defines a Mocha test describe to group tests of similar kind together
describe('Kubernetes Integration Tests', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageHandler: LanguageHandlers;
  let validationHandler: ValidationHandler;
  let yamlSettings: SettingsState;

  before(() => {
    const uri = 'https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/v1.32.1-standalone-strict/all.json';
    const fileMatch = ['*.yml', '*.yaml'];
    languageSettingsSetup = new ServiceSetup()
      .withHover()
      .withValidate()
      .withCompletion()
      .withSchemaFileMatch({
        fileMatch,
        uri,
      })
      .withKubernetes();
    const {
      validationHandler: valHandler,
      languageHandler: langHandler,
      yamlSettings: settings,
    } = setupLanguageService(languageSettingsSetup.languageSettings);
    validationHandler = valHandler;
    languageHandler = langHandler;
    yamlSettings = settings;
  });

  // Tests for validator
  describe('Yaml Validation with kubernetes', function () {
    function parseSetup(content: string): Promise<Diagnostic[]> {
      const testTextDocument = setupTextDocument(content);
      yamlSettings.documents = new TextDocumentTestManager();
      (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
      yamlSettings.specificValidatorPaths = ['*.yml', '*.yaml'];
      return validationHandler.validateTextDocument(testTextDocument);
    }

    //Validating basic nodes
    describe('Test that validation does not throw errors', function () {
      it('Basic test', async () => {
        const content = 'apiVersion: v1';
        const result = await parseSetup(content);
        assert.equal(result.length, 0);
      });

      it('Basic test on nodes with children', async () => {
        const content = 'metadata:\n  name: hello';
        const result = await parseSetup(content);
        assert.equal(result.length, 0);
      });

      it('Advanced test on nodes with children', async () => {
        const content = 'apiVersion: v1\nmetadata:\n  name: test1';
        const result = await parseSetup(content);
        assert.equal(result.length, 0);
      });

      it('Type string validates under children', async () => {
        const content = 'apiVersion: v1\nkind: Pod\nmetadata:\n  resourceVersion: test';
        const result = await parseSetup(content);
        assert.equal(result.length, 0);
      });

      describe('Type tests', function () {
        it('Type String does not error on valid node', async () => {
          const content = 'apiVersion: v1';
          const result = await parseSetup(content);
          assert.equal(result.length, 0);
        });

        it('Type Boolean does not error on valid node', async () => {
          const content = 'readOnlyRootFilesystem: false';
          const result = await parseSetup(content);
          assert.equal(result.length, 0);
        });

        it('Type Number does not error on valid node', async () => {
          const content = 'generation: 5';
          const result = await parseSetup(content);
          assert.equal(result.length, 0);
        });

        it('Type Object does not error on valid node', async () => {
          const content = 'metadata:\n  name: tes';
          const result = await parseSetup(content);
          assert.equal(result.length, 0);
        });

        it('Type Array does not error on valid node', async () => {
          const content = 'items:\n  - apiVersion: v1';
          const result = await parseSetup(content);
          assert.equal(result.length, 0);
        });
      });
    });

    /**
     * Removed these tests because the schema pulled in from
     * https://github.com/redhat-developer/yaml-language-server/pull/108
     * No longer has those types of validation
     */
    // describe('Test that validation DOES throw errors', function () {
    //     it('Error when theres no value for a node', async () => {
    //         const content = 'apiVersion:';
    //         const result = await parseSetup(content);
    //         assert.notEqual(result.length, 0);
    //     });

    //     it('Error on incorrect value type (number)', async () => {
    //         const content = 'apiVersion: 1000';
    //         const result = await parseSetup(content);
    //         assert.notEqual(result.length, 0);
    //     });

    //     it('Error on incorrect value type (boolean)', async () => {
    //         const content = 'apiVersion: False';
    //         const result = await parseSetup(content);
    //         assert.notEqual(result.length, 0);
    //     });

    //     it('Error on incorrect value type (string)', async () => {
    //         const content = 'isNonResourceURL: hello_world';
    //         const result = await parseSetup(content);
    //         assert.notEqual(result.length, 0);
    //     });

    //     it('Error on incorrect value type (object)', async () => {
    //         const content = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: False';
    //         const result = await parseSetup(content);
    //         assert.notEqual(result.length, 0);
    //     });

    //     it('Error on incorrect value type in multiple yaml documents', async () => {
    //         const content = '---\napiVersion: v1\n...\n---\napiVersion: False\n...';
    //         const result = await parseSetup(content);
    //         assert.notEqual(result.length, 0);
    //     });

    //     it('Property error message should be \"Property unknown_node is not allowed.\" when property is not allowed ', async () => {
    //         const content = 'unknown_node: test';
    //         const result = await parseSetup(content);
    //         assert.equal(result.length, 1);
    //         assert.equal(result[0].message, 'Property unknown_node is not allowed.');
    //     });

    // });
  });

  describe('yamlCompletion with kubernetes', function () {
    describe('doComplete', function () {
      function parseSetup(content: string, position: number): Promise<CompletionList> {
        const testTextDocument = setupTextDocument(content);
        yamlSettings.documents = new TextDocumentTestManager();
        (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
        return languageHandler.completionHandler({
          position: testTextDocument.positionAt(position),
          textDocument: testTextDocument,
        });
      }

      /**
       * Known issue: https://github.com/redhat-developer/yaml-language-server/issues/51
       */
      // it('Autocomplete on root node without word', async () => {
      //     const content = '';
      //     const result = await parseSetup(content, 0);
      //     assert.notEqual(result.items.length, 0);
      // });

      // it('Autocomplete on root node with word', async () => {
      //     const content = 'api';
      //     const result = await parseSetup(content, 6);
      //     assert.notEqual(result.items.length, 0);
      // });

      /**
       * Removed these tests because the schema pulled in from
       * https://github.com/redhat-developer/yaml-language-server/pull/108
       * No longer has those types of completion
       */
      // it('Autocomplete on default value (without value content)', async () => {
      //     const content = 'apiVersion: ';
      //     const result = await parseSetup(content, 10);
      //     assert.notEqual(result.items.length, 0);
      // });

      it('Autocomplete on default value (with value content)', async () => {
        const content = 'apiVersion: v1\nkind: Depl';
        const result = await parseSetup(content, 19);
        assert.notEqual(result.items.length, 0);
      });

      it('Autocomplete on boolean value (without value content)', async () => {
        const content = 'apiVersion: apps/v1\nkind: Deployment\nspec:\n  paused: ';
        const result = await parseSetup(content, content.length);
        assert.equal(result.items.length, 2);
      });

      it('Autocomplete on boolean value (with value content)', async () => {
        const content = 'apiVersion: apps/v1\nkind: Deployment\nspec:\n  paused: fal';
        const result = await parseSetup(content, content.length);
        assert.equal(result.items.length, 2);
      });

      it('Autocomplete key in middle of file', async () => {
        const content = 'metadata:\n  nam';
        const result = await parseSetup(content, 14);
        assert.notEqual(result.items.length, 0);
      });

      it('Autocomplete key in middle of file 2', async () => {
        const content = 'metadata:\n  name: test\n  cluster';
        const result = await parseSetup(content, 31);
        assert.notEqual(result.items.length, 0);
      });
    });
  });

  describe('yamlHover with kubernetes', function () {
    function parseSetup(content: string, offset: number): Promise<Hover> {
      const testTextDocument = setupTextDocument(content);
      yamlSettings.documents = new TextDocumentTestManager();
      (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
      return languageHandler.hoverHandler({
        position: testTextDocument.positionAt(offset),
        textDocument: testTextDocument,
      });
    }

    it('Hover on incomplete kubernetes document', async () => {
      const content = 'apiVersion: v1\nmetadata:\n  name: test\nkind: Deployment\nspec:\n   ';
      const hover = await parseSetup(content, 58);
      assert.strictEqual(MarkupContent.is(hover?.contents), true);
      assert.strictEqual((hover?.contents as MarkupContent).value, '');
    });
  });
});
