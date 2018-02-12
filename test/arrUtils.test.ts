/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {removeDuplicates, getLineOffsets, removeDuplicatesObj} from '../src/languageservice/utils/arrUtils';
var assert = require('assert');

suite("Array Utils Tests", () => {

	describe('Server - Array Utils', function(){
		
		describe('removeDuplicates', function(){

			it('Remove one duplicate with property', () => {

                var obj1 = {
                    "test_key": "test_value"
                }

                var obj2 = {
                    "test_key": "test_value"
                }

                var arr = [obj1, obj2];
                var prop = "test_key";

                var result = removeDuplicates(arr, prop);
                assert.equal(result.length, 1);

			});

            it('Remove multiple duplicates with property', () => {
                var obj1 = {
                    "test_key": "test_value"
                }

                var obj2 = {
                    "test_key": "test_value"
                }
            
                var obj3 = {
                    "test_key": "test_value"
                }

                var obj4 = {
                    "another_key_too": "test_value"
                }

                var arr = [obj1, obj2, obj3, obj4];
                var prop = "test_key";

                var result = removeDuplicates(arr, prop);
                assert.equal(result.length, 2);
            });

            it('Do NOT remove items without duplication', () => {
                
                var obj1 = {
                    "first_key": "test_value"
                }

                var obj2 = {
                    "second_key": "test_value"
                }

                var arr = [obj1, obj2];
                var prop = "first_key";

                var result = removeDuplicates(arr, prop);
                assert.equal(result.length, 2);

            });           

		});

        describe('getLineOffsets', function(){

            it('No offset', () => {
                var offsets = getLineOffsets("");
                assert.equal(offsets.length, 0);
            });

            it('One offset', () => {
                var offsets = getLineOffsets("test_offset");
                assert.equal(offsets.length, 1);
                assert.equal(offsets[0], 0);
            });

            it('One offset with \\r\\n', () => {
                var offsets = getLineOffsets("first_offset\r\n");
                assert.equal(offsets.length, 2);
                assert.equal(offsets[0], 0);
            });

            it('Multiple offsets', () => {
                var offsets = getLineOffsets("first_offset\n  second_offset\n    third_offset"); 
                assert.equal(offsets.length, 3);
                assert.equal(offsets[0], 0);
                assert.equal(offsets[1], 13);
                assert.equal(offsets[2], 29);
            });

        });

        describe('removeDuplicatesObj', function(){
            
            it('Remove one duplicate with property', () => {

                var obj1 = {
                    "test_key": "test_value"
                }

                var obj2 = {
                    "test_key": "test_value"
                }

                var arr = [obj1, obj2];
                var result = removeDuplicatesObj(arr);
                assert.equal(result.length, 1);

            });

            it('Does not remove anything unneccessary', () => {
                var obj1 = {
                    "test_key": "test_value"
                }
                
                var obj2 = {
                    "other_key": "test_value"
                }

                var arr = [obj1, obj2];
                var prop = "test_key";

                var result = removeDuplicatesObj(arr);
                assert.equal(result.length, 2);
            });        

        });
            
	});

});