import assert from 'assert';
import type { ClientCapabilities } from 'vscode-languageserver';
import type { CompletionList } from 'vscode-languageserver-types';
import { InsertTextFormat, Position } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getLanguageService } from '../src';
import type { JSONSchema } from '../src/languageservice/jsonSchema';
import { workspaceContext } from '../src/languageservice/services/schemaRequestHandler';

describe('Completion snippet capabilities', () => {
  async function complete(capabilities: ClientCapabilities, schema: JSONSchema): Promise<CompletionList> {
    const service = getLanguageService({
      schemaRequestService: async () => JSON.stringify(schema),
      workspaceContext,
      clientCapabilities: capabilities,
    });
    service.configure({ completion: true, schemas: [{ uri: 'file:///schema.json', fileMatch: ['*.yaml'] }] });
    const document = TextDocument.create('file:///completion.yaml', 'yaml', 1, '');
    return service.doComplete(document, Position.create(0, 0), false);
  }

  const schema: JSONSchema = { type: 'object', properties: { greeting: { type: 'string' } } };

  for (const [name, capabilities] of [
    ['omitted', undefined],
    ['empty', {}],
    ['false', { textDocument: { completion: { completionItem: { snippetSupport: false } } } }],
  ] as [string, ClientCapabilities][]) {
    it(`returns plain text when snippet support is ${name}`, async () => {
      const result = await complete(capabilities, schema);
      const item = result.items.find((item) => item.label === 'greeting');
      assert.ok(item);
      assert.equal(item.insertTextFormat, InsertTextFormat.PlainText);
      assert.equal(item.insertText, 'greeting: ');
      assert.equal(item.textEdit.newText, 'greeting: ');
    });
  }

  it('preserves snippets for clients that support them', async () => {
    const result = await complete({ textDocument: { completion: { completionItem: { snippetSupport: true } } } }, schema);
    const item = result.items.find((item) => item.label === 'greeting');
    assert.ok(item);
    assert.equal(item.insertTextFormat, InsertTextFormat.Snippet);
    assert.equal(item.insertText, 'greeting: ');
    assert.equal(item.textEdit.newText, 'greeting: ');
  });

  for (const bodyText of [
    'name: ${1:world}\nagain: $1\nend: $0',
    'name: ${1:hello ${2:world}}',
    'color: ${1|red,green|}',
    'price: \\$5\npath: C:\\\\tmp',
    'name: ${NAME:world}',
  ]) {
    it(`offers custom snippets only to snippet-capable clients: ${bodyText}`, async () => {
      const snippetSchema: JSONSchema = { type: 'object', defaultSnippets: [{ label: 'example', bodyText }] };
      const result = await complete({}, snippetSchema);
      const item = result.items.find((item) => item.label === 'example');
      assert.equal(item, undefined);

      const supported = await complete(
        { textDocument: { completion: { completionItem: { snippetSupport: true } } } },
        snippetSchema
      );
      const original = supported.items.find((item) => item.label === 'example');
      assert.equal(original.insertTextFormat, InsertTextFormat.Snippet);
      assert.equal(original.insertText, bodyText);
      assert.equal(original.textEdit.newText, bodyText);
    });
  }
  for (const [type, value, expected] of [
    ['string', 'cost $1', 'cost $1'],
    ['number', 42, '42'],
    ['boolean', false, 'false'],
    ['null', null, 'null'],
  ] as [string, string | number | boolean | null, string][]) {
    it(`keeps a ${type} default without adding tab stops`, async () => {
      const result = await complete({}, { type: 'object', properties: { value: { type, default: value } } });
      const item = result.items.find((item) => item.label === 'value');
      assert.ok(item);
      assert.equal(item.insertTextFormat, InsertTextFormat.PlainText);
      assert.equal(item.textEdit.newText, `value: ${expected}`);
    });
  }

  it('builds nested required properties without snippet syntax', async () => {
    const result = await complete(
      {},
      {
        type: 'object',
        properties: {
          settings: {
            type: 'object',
            required: ['enabled', 'count'],
            properties: {
              enabled: { type: 'boolean', default: false },
              count: { type: 'integer', default: 7 },
            },
          },
        },
      }
    );
    const item = result.items.find((item) => item.label === 'settings');
    assert.ok(item);
    assert.equal(item.insertTextFormat, InsertTextFormat.PlainText);
    assert.match(item.textEdit.newText, /enabled: false/);
    assert.match(item.textEdit.newText, /count: 7/);
    assert.ok(!item.textEdit.newText.includes('$'));
  });
});
