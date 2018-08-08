/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {startsWith, endsWith, convertSimple2RegExp} from '../src/languageservice/utils/strings';
var assert = require('assert');

suite("String Tests", () => {

		describe('startsWith', function(){

			it('String with different lengths', () => {

                let one = "hello";
                let other = "goodbye";

                var result = startsWith(one, other);
                assert.equal(result, false);

            });

            it('String with same length different first letter', () => {

                let one = "hello";
                let other = "jello";

                var result = startsWith(one, other);
                assert.equal(result, false);

            });

            it('Same string', () => {

                let one = "hello";
                let other = "hello";

                var result = startsWith(one, other);
                assert.equal(result, true);

            });

        });
        
        describe('endsWith', function(){

			it('String with different lengths', () => {

                let one = "hello";
                let other = "goodbye";

                var result = endsWith(one, other);
                assert.equal(result, false);

            });

            it('Strings that are the same', () => {

                let one = "hello";
                let other = "hello";

                var result = endsWith(one, other);
                assert.equal(result, true);

            });

            it('Other is smaller then one', () => {

                let one = "hello";
                let other = "hi";

                var result = endsWith(one, other);
                assert.equal(result, false);

            });

        });
        
        describe('convertSimple2RegExp', function(){

			it('Test of convertRegexString2RegExp', () => {

                var result = convertSimple2RegExp("/toc\\.yml/i").test("TOC.yml");
                assert.equal(result, true);

            });

            it('Test of convertGlobalPattern2RegExp', () => {

                var result = convertSimple2RegExp("toc.yml").test("toc.yml");
                assert.equal(result, true);

                result = convertSimple2RegExp("toc.yml").test("TOC.yml");
                assert.equal(result, false);

            });

	    });

});