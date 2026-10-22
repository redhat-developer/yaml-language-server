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
      it(`replaces a ${quote}-quoted key with prefix '${prefix}' without duplicating its value`, async () => {
        await assertCompletion(
          `settings:\n  ${quote}${prefix}|${quote}: on # keep\n`,
          'security',
          'settings:\n  security: on # keep\n'
        );
      });
    }

    for (const prefix of ['', 'o']) {
      it(`replaces a ${quote}-quoted value with prefix '${prefix}' including both quotes`, async () => {
        await assertCompletion(
          `settings:\n  security: ${quote}${prefix}|${quote} # keep\n`,
          '"on"',
          'settings:\n  security: "on" # keep\n'
        );
      });
    }

    it(`replaces an empty ${quote}-quoted flow mapping key`, async () => {
      await assertCompletion(`settings: {${quote}|${quote}: on}\n`, 'security', 'settings: {security: on}\n');
    });

    it(`replaces an empty ${quote}-quoted flow mapping value`, async () => {
      await assertCompletion(`settings: {security: ${quote}|${quote}}\n`, '"on"', 'settings: {security: "on"}\n');
    });

    it(`quotes a completed key containing a mapping indicator`, async () => {
      await assertCompletion(
        `settings:\n  ${quote}|${quote}: on\n`,
        'security: level',
        'settings:\n  "security: level": on\n',
        'security: level'
      );
    });
  }

  it('matches doubled apostrophes in a single-quoted value', async () => {
    await assertCompletion("settings:\n  security: 'don''t|'\n", "don't", "settings:\n  security: don't\n", 'security', "don't");
  });

  it('preserves a literal leading quote in a property name', async () => {
    await assertCompletion("settings:\n  '''s|': on\n", "'security", `settings:\n  "'security": on\n`, "'security");
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
  const completions = await service.doComplete(document, document.positionAt(fixture.indexOf('|')), false);
  const completion = completions.items.find((item) => item.label === label);
  assert.ok(completion, `Missing ${label} completion for ${fixture}`);
  assert.ok(completion.textEdit && 'range' in completion.textEdit, 'Expected a replacement edit');
  // Editors filter against the text from the replacement start to the cursor.
  // Applying an edit directly does not check whether the suggestion is visible.
  const prefix = document.getText({
    start: completion.textEdit.range.start,
    end: document.positionAt(fixture.indexOf('|')),
  });
  if (prefix.startsWith('"') || prefix.startsWith("'")) {
    assert.ok(
      (completion.filterText ?? completion.label).startsWith(prefix),
      `Completion ${label} does not match typed prefix ${JSON.stringify(prefix)} in ${fixture}`
    );
  } else {
    assert.equal(completion.filterText, undefined, 'Unquoted completion should keep its original filtering');
  }
  const actual = TextDocument.applyEdits(document, [completion.textEdit]);
  assert.equal(actual, expected);
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
