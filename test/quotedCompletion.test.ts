/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getLanguageService } from '../src/languageservice/yamlLanguageService.js';
import { yamlDocumentsCache } from '../src/languageservice/parser/yaml-documents.js';

describe('Quoted scalar completion', () => {
  for (const quote of ['"', "'"]) {
    for (const prefix of ['', 's']) {
      it(`completes a ${quote}-quoted key with prefix '${prefix}' inside its quotes`, async () => {
        await assertCompletion(
          `settings:\n  ${quote}${prefix}|${quote}: on # keep\n`,
          'security',
          `settings:\n  ${quote}security${quote}: on # keep\n`
        );
      });
    }

    for (const prefix of ['', 'o']) {
      it(`completes a ${quote}-quoted value with prefix '${prefix}' inside its quotes`, async () => {
        await assertCompletion(
          `settings:\n  security: ${quote}${prefix}|${quote} # keep\n`,
          'on',
          `settings:\n  security: ${quote}on${quote} # keep\n`
        );
      });
    }

    it(`closes an unterminated ${quote}-quoted value`, async () => {
      await assertCompletion(`settings:\n  security: ${quote}o|\n`, 'on', `settings:\n  security: ${quote}on${quote}\n`);
    });

    it(`completes an empty ${quote}-quoted flow mapping key`, async () => {
      await assertCompletion(`settings: {${quote}|${quote}: on}\n`, 'security', `settings: {${quote}security${quote}: on}\n`);
    });

    it(`completes an empty ${quote}-quoted flow mapping value`, async () => {
      await assertCompletion(`settings: {security: ${quote}|${quote}}\n`, 'on', `settings: {security: ${quote}on${quote}}\n`);
    });

    it(`keeps ${quote} quotes around a completed key containing a mapping indicator`, async () => {
      await assertCompletion(
        `settings:\n  ${quote}|${quote}: on\n`,
        'security: level',
        `settings:\n  ${quote}security: level${quote}: on\n`,
        'security: level'
      );
    });

    it(`keeps ${quote} quotes around a completed value that looks like null`, async () => {
      await assertCompletion(
        `settings:\n  security: ${quote}null|${quote}\n`,
        'null',
        `settings:\n  security: ${quote}null${quote}\n`,
        'security',
        'null'
      );
    });
  }

  it('doubles apostrophes in a single-quoted value', async () => {
    await assertCompletion(
      "settings:\n  security: 'don''|'\n",
      "don''t",
      "settings:\n  security: 'don''t'\n",
      'security',
      "don't"
    );
  });

  it('doubles a leading apostrophe in a single-quoted key', async () => {
    await assertCompletion("settings:\n  '''s|': on\n", "'security", "settings:\n  '''security': on\n", "'security");
  });

  it('escapes double quotes in a double-quoted key', async () => {
    await assertCompletion('settings:\n  "|": on\n', 'say "hi"', 'settings:\n  "say \\"hi\\"": on\n', 'say "hi"');
  });

  it('escapes double quotes in a double-quoted value', async () => {
    await assertCompletion(
      'settings:\n  security: "|"\n',
      'say \\"hi\\"',
      'settings:\n  security: "say \\"hi\\""\n',
      'security',
      'say "hi"'
    );
  });

  it('keeps unquoted key completion working', async () => {
    await assertCompletion('settings:\n  s|: on\n', 'security', 'settings:\n  security: on\n');
  });

  it('keeps unquoted value completion working', async () => {
    await assertCompletion('settings:\n  security: o|\n', '"on"', 'settings:\n  security: "on"\n');
  });
});

async function assertCompletion(
  fixture: string,
  label: string,
  expected: string,
  property = 'security',
  value = 'on'
): Promise<void> {
  const schema = {
    type: 'object',
    properties: {
      settings: {
        title: 'Settings',
        type: 'object',
        required: [property],
        additionalProperties: false,
        properties: { [property]: { type: 'string', enum: [value, 'off'] } },
      },
    },
  };
  const service = getLanguageService({
    schemaRequestService: async () => JSON.stringify(schema),
    workspaceContext: { resolveRelativePath: (path) => path },
  });
  service.configure({
    completion: true,
    validate: true,
    customTags: [],
    yamlVersion: '1.2',
    schemas: [{ uri: 'https://example.org/quoted-completion.json', fileMatch: ['*'], schema }],
  });
  yamlDocumentsCache.clear();
  const document = TextDocument.create('file:///quoted-completion.yaml', 'yaml', 1, fixture.replace('|', ''));
  const cursor = document.positionAt(fixture.indexOf('|'));
  const completions = await service.doComplete(document, cursor, false);
  const completion = completions.items.find((item) => item.label === label);
  assert.ok(completion, `Missing ${label} completion for ${fixture}`);
  assert.ok(completion.textEdit && 'range' in completion.textEdit, 'Expected a replacement edit');
  const editStart = document.offsetAt(completion.textEdit.range.start);
  if (/["']/.test(document.getText().charAt(editStart - 1))) {
    const typed = document.getText().slice(editStart, document.offsetAt(cursor));
    assert.ok(
      (completion.filterText ?? completion.label).startsWith(typed),
      `Completion ${label} does not match typed prefix ${JSON.stringify(typed)} in ${fixture}`
    );
  }
  const actual = TextDocument.applyEdits(document, [completion.textEdit]);
  assert.equal(actual, expected);
  if (/["']/.test(document.getText().charAt(editStart - 1))) {
    const cursorAfterEdit = editStart + completion.textEdit.newText.length;
    assert.ok(
      /["']/.test(actual.charAt(cursorAfterEdit - 1)),
      `Cursor should land after the closing quote: ${actual.slice(0, cursorAfterEdit)}|`
    );
  }
  const updated = TextDocument.create(document.uri, document.languageId, 2, actual);
  assert.deepEqual(await service.doValidation(updated, false), []);
  for (const item of completions.items) {
    assert.ok(item.textEdit && 'range' in item.textEdit, 'Expected a replacement edit');
    const edited = TextDocument.applyEdits(document, [item.textEdit]);
    yamlDocumentsCache.clear();
    const completed = TextDocument.create(document.uri, document.languageId, 2, edited);
    assert.deepEqual(await service.doValidation(completed, false), [], `Invalid ${item.label} completion: ${edited}`);
  }
}
