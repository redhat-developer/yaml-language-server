/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { FormattingOptions, TextEdit } from 'vscode-languageserver-types';
import { CustomFormatterOptions } from '../src';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { setupLanguageService, setupTextDocument } from './utils/testHelper';

type LanguageHandlerWithConnection = {
  connection: {
    workspace: {
      getConfiguration: (item?: { section?: string }) => Promise<unknown>;
    };
  };
};

describe('Formatter Tests', () => {
  const sandbox = sinon.createSandbox();
  let languageHandler: LanguageHandlers;
  let yamlSettings: SettingsState;

  afterEach(() => {
    sandbox.restore();
  });

  before(() => {
    const languageSettingsSetup = new ServiceSetup().withFormat();
    const { languageHandler: langHandler, yamlSettings: settings } = setupLanguageService(languageSettingsSetup.languageSettings);
    languageHandler = langHandler;
    yamlSettings = settings;
  });

  // Tests for formatter
  describe('Formatter', function () {
    describe('Test that formatter works with custom tags', function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function parseSetup(
        content: string,
        options: Partial<FormattingOptions | CustomFormatterOptions> = {}
      ): Promise<TextEdit[]> {
        const testTextDocument = setupTextDocument(content);
        yamlSettings.documents = new TextDocumentTestManager();
        (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
        yamlSettings.yamlFormatterSettings = options as CustomFormatterOptions;
        return languageHandler.formatterHandler({
          options: options as FormattingOptions,
          textDocument: testTextDocument,
        });
      }

      it('Formatting works without custom tags', async () => {
        const content = 'cwd: test';
        const edits = await parseSetup(content);
        console.dir({ edits });
        assert.notEqual(edits.length, 0);
        assert.equal(edits[0].newText, 'cwd: test\n');
      });

      it('Formatting can be disabled via language-overridable yaml.format.enable setting', async () => {
        const content = 'cwd: test\n    test: 2';
        const testTextDocument = setupTextDocument(content);
        yamlSettings.documents = new TextDocumentTestManager();
        (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
        const connection = (languageHandler as unknown as LanguageHandlerWithConnection).connection;
        sandbox.stub(connection.workspace, 'getConfiguration').resolves({ 'yaml.format.enable': false });
        yamlSettings.hasConfigurationCapability = true;
        const edits = await languageHandler.formatterHandler({
          options: { tabSize: 2, insertSpaces: true },
          textDocument: testTextDocument,
        });
        assert.equal(edits.length, 0);
      });

      it('Formatting works with custom tags', async () => {
        const content = 'cwd:       !Test test';
        const edits = await parseSetup(content);
        assert.notEqual(edits.length, 0);
        assert.equal(edits[0].newText, 'cwd: !Test test\n');
      });

      it('Formatting wraps text', async () => {
        const content = `comments: >
                test test test test test test test test test test test test`;
        const edits = await parseSetup(content, {
          printWidth: 20,
          proseWrap: 'always',
        });
        assert.equal(edits[0].newText, 'comments: >\n  test test test\n  test test test\n  test test test\n  test test test\n');
      });

      it('Formatting handles trailing commas (enabled)', async () => {
        const content = `{
  key: 'value',
  food: 'raisins',
  airport: 'YYZ',
  lightened_bulb: 'illuminating',
}
`;
        const edits = await parseSetup(content, { singleQuote: true });
        assert.equal(edits.length, 0);
      });

      it('Formatting handles trailing commas (disabled)', async () => {
        const content = `{
  key: 'value',
  food: 'raisins',
  airport: 'YYZ',
  lightened_bulb: 'illuminating',
}
`;
        const edits = await parseSetup(content, {
          singleQuote: true,
          trailingComma: false,
        });
        assert.equal(
          edits[0].newText,
          `{
  key: 'value',
  food: 'raisins',
  airport: 'YYZ',
  lightened_bulb: 'illuminating'
}
`
        );
      });

      it('Formatting uses tabSize', async () => {
        const content = `map:
  k1: v1
  k2: v2
list:
  - item1
  - item2
`;

        const edits = await parseSetup(content, {
          tabSize: 5,
        });

        const expected = `map:
     k1: v1
     k2: v2
list:
     - item1
     - item2
`;
        assert.equal(edits[0].newText, expected);
      });

      it('Formatting uses tabWidth', async () => {
        const content = `map:
  k1: v1
  k2: v2
list:
  - item1
  - item2
`;

        const edits = await parseSetup(content, {
          tabWidth: 5,
        });

        const expected = `map:
     k1: v1
     k2: v2
list:
     - item1
     - item2
`;
        assert.equal(edits[0].newText, expected);
      });

      it('Formatting uses tabWidth over tabSize', async () => {
        const content = `map:
  k1: v1
  k2: v2
list:
  - item1
  - item2
`;

        const edits = await parseSetup(content, {
          tabSize: 3,
          tabWidth: 5,
        });

        const expected = `map:
     k1: v1
     k2: v2
list:
     - item1
     - item2
`;
        assert.equal(edits[0].newText, expected);
      });

      it("Formatting doesn't replace escaped newlines with real ones", async () => {
        const content = `- name: Example task
  set_fact:
    my_var: "{{ content | regex_replace('\\\\\\\\n', '\\n') }}"
`;

        const edits = await parseSetup(content, {
          tabSize: 1,
          tabWidth: 2,
        });

        assert.equal(edits.length, 0, `Edits: ${JSON.stringify(edits)}`);
      });
      it("Formatting doesn't strip trailing zeros of floats", async () => {
        const content = `value: 1.0e+4
`;

        const edits = await parseSetup(content, {
          tabSize: 1,
          tabWidth: 2,
        });

        assert.equal(edits.length, 0, `Edits: ${JSON.stringify(edits)}`);
      });
      it("Formatting doesn't convert long integers to floats", async () => {
        const content = `value: 12345678901234567890
`;

        const edits = await parseSetup(content, {
          tabSize: 1,
          tabWidth: 2,
        });

        assert.equal(edits.length, 0, `Edits: ${JSON.stringify(edits)}`);
      });
      it("Formatting respects 'no prose wrap' setting", async () => {
        const content = `value: aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa aaaa
`;

        const edits = await parseSetup(content, {
          tabSize: 1,
          tabWidth: 2,
          proseWrap: 'never',
        });

        assert.equal(edits.length, 0, `Edits: ${JSON.stringify(edits)}`);

        const edits2 = await parseSetup(content, {
          tabSize: 1,
          tabWidth: 2,
          proseWrap: 'preserve',
        });

        assert.equal(edits2.length, 0, `Edits: ${JSON.stringify(edits)}`);
      });
      it('Formatting keeps comments on the same line', async () => {
        const content = `0002-https-from-avdpool-to-server: # Allow HTTPS access from AVD Pool 2 to Qlik server
  name: 0002-https-from-avdpool-to-server
  source_addresses:
    - 1.2.3.4/32
  protocols:
    - TCP
  destination_ports:
    - "443"
  destination_addresses:
    - 4.5.6.7/32
`;

        const edits = await parseSetup(content, {
          tabSize: 1,
          tabWidth: 2,
        });

        assert.equal(edits.length, 0, `Edits: ${JSON.stringify(edits)}`);
      });
      it('Formatting converts quotations', async () => {
        const content = `root:
  - it: "should include default selector"
`;
        const expected = `root:
  - it: 'should include default selector'
`;

        const edits = await parseSetup(content, {
          tabSize: 1,
          tabWidth: 2,
          singleQuote: true,
        });

        assert.equal(edits[0].newText, expected);
      });
      it("Formatting empty doc doesn't do anything", async () => {
        const content = `
`;
        const expected = ``;

        const edits = await parseSetup(content, {
          tabSize: 1,
          tabWidth: 2,
          singleQuote: true,
        });

        assert.equal(edits[0].newText, expected);
      });

      it('Comments separated by blank lines do not inherit indentation of previous lines', async () => {
        const content = `# Section 1

variables:
  - "C"
  - 1
  - false
  # four: true

# Section 2

more_variables:
  - "A"
  - 2
`;

        const edits = await parseSetup(content, {
          tabSize: 1,
          tabWidth: 2,
        });

        assert.equal(edits.length, 0, `Edits: ${JSON.stringify(edits)}`);
      });
    });
  });
});
