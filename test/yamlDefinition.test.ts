/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { setupTextDocument, TEST_URI } from './utils/testHelper';
import { expect } from 'chai';
import { YamlDefinition } from '../src/languageservice/services/yamlDefinition';
import { LocationLink, Position, Range } from 'vscode-languageserver-types';
import { Telemetry } from '../src/languageservice/telemetry';

describe('YAML Definition', () => {
  it('should not provide definition for non anchor node', () => {
    const doc = setupTextDocument('foo: &bar some\naaa: *bar');
    const result = new YamlDefinition({} as Telemetry).getDefinition(doc, {
      position: Position.create(1, 2),
      textDocument: { uri: TEST_URI },
    });
    expect(result).is.undefined;
  });

  it('should provide definition for anchor', () => {
    const doc = setupTextDocument('foo: &bar some\naaa: *bar');
    const result = new YamlDefinition({} as Telemetry).getDefinition(doc, {
      position: Position.create(1, 7),
      textDocument: { uri: TEST_URI },
    });
    expect(result).is.not.undefined;
    expect(result[0]).is.eqls(LocationLink.create(TEST_URI, Range.create(0, 10, 1, 0), Range.create(0, 10, 0, 14)));
  });
});
