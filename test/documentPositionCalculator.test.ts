/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { binarySearch, getLineStartPositions, getPosition } from '../src/languageservice/utils/documentPositionCalculator';
import * as assert from 'assert';

describe('DocumentPositionCalculator Tests', () => {
  describe('binarySearch', function () {
    it('Binary Search where we are looking for element to the left of center', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const find = 2;

      const result = binarySearch(arr, find);
      assert.equal(result, 1);
    });

    it('Binary Search where we are looking for element to the right of center', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const find = 8;

      const result = binarySearch(arr, find);
      assert.equal(result, 7);
    });

    it('Binary Search found at first check', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const find = 5;

      const result = binarySearch(arr, find);
      assert.equal(result, 4);
    });

    it('Binary Search item not found', () => {
      const arr = [1];
      const find = 5;

      const result = binarySearch(arr, find);
      assert.equal(result, -2);
    });
  });

  describe('getLineStartPositions', function () {
    it('getLineStartPositions with windows newline', () => {
      const test_str = 'test: test\r\ntest: test';

      const result = getLineStartPositions(test_str);
      assert.equal(result[0], 0);
      assert.equal(result[1], 12);
    });

    it('getLineStartPositions with normal newline', () => {
      const test_str = 'test: test\ntest: test';

      const result = getLineStartPositions(test_str);
      assert.equal(result[0], 0);
      assert.equal(result[1], 11);
    });
  });

  describe('getPosition', function () {
    it('getPosition', () => {
      const test_str = 'test: test\r\ntest: test';

      const startPositions = getLineStartPositions(test_str);
      const result = getPosition(0, startPositions);
      assert.notEqual(result, undefined);
      assert.equal(result.line, 0);
      assert.equal(result.character, 0);
    });

    it('getPosition when not found', () => {
      const test_str = 'test: test\ntest: test';

      const startPositions = getLineStartPositions(test_str);
      const result = getPosition(5, startPositions);
      assert.notEqual(result, undefined);
      assert.equal(result.line, 0);
      assert.equal(result.character, 5);
    });
  });
});
