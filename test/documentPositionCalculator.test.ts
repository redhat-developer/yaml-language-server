/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {binarySearch, getLineStartPositions, getPosition, insertionPointReturnValue} from '../src/languageservice/utils/documentPositionCalculator';
var assert = require('assert');

suite("DocumentPositionCalculator Tests", () => {

		describe('binarySearch', function(){

			it('Binary Search where we are looking for element to the left of center', () => {

                let arr = [1,2,3,4,5,6,7,8,9,10];
                let find = 2;

                var result = binarySearch(arr, find);
                assert.equal(result, 1);

            });

            it('Binary Search where we are looking for element to the right of center', () => {

                let arr = [1,2,3,4,5,6,7,8,9,10];
                let find = 8;

                var result = binarySearch(arr, find);
                assert.equal(result, 7);

            });

            it('Binary Search found at first check', () => {

                let arr = [1,2,3,4,5,6,7,8,9,10];
                let find = 5;

                var result = binarySearch(arr, find);
                assert.equal(result, 4);

            });

            it('Binary Search item not found', () => {

                let arr = [1];
                let find = 5;

                var result = binarySearch(arr, find);
                assert.equal(result, -2);

            });

        });

        describe('getLineStartPositions', function(){

			it('getLineStartPositions with windows newline', () => {

                let test_str = "test: test\r\ntest: test";

                var result = getLineStartPositions(test_str);
                assert.equal(result[0], 0);
                assert.equal(result[1], 12);

            });

            it('getLineStartPositions with normal newline', () => {

                let test_str = "test: test\ntest: test";

                var result = getLineStartPositions(test_str);
                assert.equal(result[0], 0);
                assert.equal(result[1], 11);

            });

        });

        describe('getPosition', function(){

			it('getPosition', () => {

                let test_str = "test: test\r\ntest: test";

                var startPositions = getLineStartPositions(test_str);
                var result = getPosition(0, startPositions);
                assert.notEqual(result, undefined);
                assert.equal(result.line, 0);
                assert.equal(result.column, 0);

            });

            it('getPosition when not found', () => {

                let test_str = "test: test\ntest: test";

                var startPositions = getLineStartPositions(test_str);
                var result = getPosition(5, startPositions);
                assert.notEqual(result, undefined);
                assert.equal(result.line, 0);
                assert.equal(result.column, 5);

            });

        });


});