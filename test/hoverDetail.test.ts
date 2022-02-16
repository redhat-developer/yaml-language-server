/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as path from 'path';
import { Hover, MarkupContent } from 'vscode-languageserver';
import { LanguageService } from '../src';
import { LanguageHandlers } from '../src/languageserver/handlers/languageHandlers';
import { SettingsState, TextDocumentTestManager } from '../src/yamlSettings';
import { ServiceSetup } from './utils/serviceSetup';
import { SCHEMA_ID, setupLanguageService, setupSchemaIDTextDocument } from './utils/testHelper';

describe('Hover Tests Detail', () => {
  let languageSettingsSetup: ServiceSetup;
  let languageHandler: LanguageHandlers;
  let languageService: LanguageService;
  let yamlSettings: SettingsState;

  before(() => {
    languageSettingsSetup = new ServiceSetup().withHover().withSchemaFileMatch({
      uri: 'http://google.com',
      fileMatch: ['bad-schema.yaml'],
    });
    const { languageService: langService, languageHandler: langHandler, yamlSettings: settings } = setupLanguageService(
      languageSettingsSetup.languageSettings
    );
    languageService = langService;
    languageHandler = langHandler;
    yamlSettings = settings;
  });

  afterEach(() => {
    languageService.deleteSchema(SCHEMA_ID);
  });

  function parseSetup(content: string, position): Promise<Hover> {
    const testTextDocument = setupSchemaIDTextDocument(content);
    yamlSettings.documents = new TextDocumentTestManager();
    (yamlSettings.documents as TextDocumentTestManager).set(testTextDocument);
    return languageHandler.hoverHandler({
      position: testTextDocument.positionAt(position),
      textDocument: testTextDocument,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const inlineObjectSchema = require(path.join(__dirname, './fixtures/testInlineObject.json'));

  it('AnyOf complex', async () => {
    languageService.addSchema(SCHEMA_ID, inlineObjectSchema);
    const content = 'nested:\n  scripts:\n    sample:\n      test:';
    const hover = await parseSetup(content, content.length - 2);
    const content2 = 'nested:\n  scripts:\n    sample:\n      test: \n';
    const hover2 = await parseSetup(content2, content.length - 4);
    // console.log((hover.contents as MarkupContent).value);
    // console.log((hover.contents as MarkupContent).value.replace(/`/g, '\\`'));
    assert.strictEqual(MarkupContent.is(hover.contents), true);
    assert.strictEqual((hover.contents as MarkupContent).kind, 'markdown');
    assert.strictEqual(
      (hover.contents as MarkupContent).value,
      `description of test

----
##
\`\`\`
test: \`const1\` | object | Expression | string | obj1
\`\`\`
*description of test*

\`\`\`
test: object
\`\`\`
*description of object with prop list and parent*

>| Property | Type | Required | Description |
>| -------- | ---- | -------- | ----------- |
>| list | \`string\` |  |  |
>| parent | \`string\` |  |  |


\`\`\`
test: Expression
\`\`\`
*Expression abcd*

>| Property | Type | Required | Description |
>| -------- | ---- | -------- | ----------- |
>| =@ctx | \`\` |  |  |


\`\`\`
test: obj1
\`\`\`
*description of obj1*

>| Property | Type | Required | Description |
>| -------- | ---- | -------- | ----------- |
>| objA | \`Object A\` | ❕ | description of the parent prop |


>\`\`\`
>objA: Object A
>\`\`\`
>*description of the parent prop*

>>| Property | Type | Required | Description |
>>| -------- | ---- | -------- | ----------- |
>>| propI | \`string\` | ❕ |  |


----

Source: [default_schema_id.yaml](file:///default_schema_id.yaml)`
    );
    // related to test 'Hover on null property in nested object'
    assert.notStrictEqual((hover2.contents as MarkupContent).value, '', 'hover does not work with new line');
    assert.strictEqual((hover.contents as MarkupContent).value, (hover2.contents as MarkupContent).value);
  });
});
