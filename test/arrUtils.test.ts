/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getLineOffsets, removeDuplicatesObj } from '../src/languageservice/utils/arrUtils';
import * as assert from 'assert';

describe('Array Utils Tests', () => {
  describe('Server - Array Utils', function () {
    describe('getLineOffsets', function () {
      it('No offset', () => {
        const offsets = getLineOffsets('');
        assert.equal(offsets.length, 0);
      });

      it('One offset', () => {
        const offsets = getLineOffsets('test_offset');
        assert.equal(offsets.length, 1);
        assert.equal(offsets[0], 0);
      });

      it('One offset with \\r\\n', () => {
        const offsets = getLineOffsets('first_offset\r\n');
        assert.equal(offsets.length, 2);
        assert.equal(offsets[0], 0);
      });

      it('Multiple offsets', () => {
        const offsets = getLineOffsets('first_offset\n  second_offset\n    third_offset');
        assert.equal(offsets.length, 3);
        assert.equal(offsets[0], 0);
        assert.equal(offsets[1], 13);
        assert.equal(offsets[2], 29);
      });
    });

    describe('removeDuplicatesObj', function () {
      it('Remove one duplicate with property', () => {
        const obj1 = {
          test_key: 'test_value',
        };

        const obj2 = {
          test_key: 'test_value',
        };

        const arr = [obj1, obj2];
        const result = removeDuplicatesObj(arr);
        assert.equal(result.length, 1);
      });

      it('Does not remove anything unneccessary', () => {
        const obj1 = {
          test_key: 'test_value',
        };

        const obj2 = {
          other_key: 'test_value',
        };

        const arr = [obj1, obj2];

        const result = removeDuplicatesObj(arr);
        assert.equal(result.length, 2);
      });
    });
  });
});
