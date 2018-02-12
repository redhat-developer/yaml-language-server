/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {equals} from '../src/languageservice/utils/objects';
var assert = require('assert');

suite("Object Equals Tests", () => {

		describe('Equals', function(){

			it('Both are null', () => {

                let one = null;
                let other = null;

                var result = equals(one, other);
                assert.equal(result, true);

            });
           
            it('One is null the other is true', () => {

                let one = null;
                let other = true;

                var result = equals(one, other);
                assert.equal(result, false);

            });

            it('One is string the other is boolean', () => {
                
                let one = "test";
                let other = false;

                var result = equals(one, other);
                assert.equal(result, false);

            });

            it('One is not object', () => {
                
                let one = "test";
                let other = false;

                var result = equals(one, other);
                assert.equal(result, false);

            });

            it('One is array the other is not', () => {
                
                let one = new Proxy([], {});
                let other = Object.keys({
                    1: "2",
                    2: "3"
                });
                var result = equals(one, other);
                assert.equal(result, false);

            });

            it('Both are arrays of different length', () => {
                
                let one = [1,2,3];
                let other = [1,2,3,4];

                var result = equals(one, other);
                assert.equal(result, false);

            });

            it('Both are arrays of same elements but in different order', () => {
                
                let one = [1,2,3];
                let other = [3,2,1];

                var result = equals(one, other);
                assert.equal(result, false);

            });

            it('Arrays that are equal', () => {
                
                let one = [1,2,3];
                let other = [1,2,3];

                var result = equals(one, other);
                assert.equal(result, true);

            });

            it('Objects that are equal', () => {
                
                let one = {
                    "test": 1
                };
                let other = {
                    "test": 1
                };

                var result = equals(one, other);
                assert.equal(result, true);

            });

            it('Objects that have same keys but different values', () => {
                
                let one = {
                    "test": 1
                };
                let other = {
                    "test": 5
                };

                var result = equals(one, other);
                assert.equal(result, false);

            });

            it('Objects that have different keys', () => {
                
                let one = {
                    "test_one": 1
                };
                let other = {
                    "test_other": 1
                };

                var result = equals(one, other);
                assert.equal(result, false);

            });

	    });

});