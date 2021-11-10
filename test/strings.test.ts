/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { startsWith, endsWith, convertSimple2RegExp, safeCreateUnicodeRegExp } from '../src/languageservice/utils/strings';
import * as assert from 'assert';
import { expect } from 'chai';

describe('String Tests', () => {
  describe('startsWith', function () {
    it('String with different lengths', () => {
      const one = 'hello';
      const other = 'goodbye';

      const result = startsWith(one, other);
      assert.equal(result, false);
    });

    it('String with same length different first letter', () => {
      const one = 'hello';
      const other = 'jello';

      const result = startsWith(one, other);
      assert.equal(result, false);
    });

    it('Same string', () => {
      const one = 'hello';
      const other = 'hello';

      const result = startsWith(one, other);
      assert.equal(result, true);
    });
  });

  describe('endsWith', function () {
    it('String with different lengths', () => {
      const one = 'hello';
      const other = 'goodbye';

      const result = endsWith(one, other);
      assert.equal(result, false);
    });

    it('Strings that are the same', () => {
      const one = 'hello';
      const other = 'hello';

      const result = endsWith(one, other);
      assert.equal(result, true);
    });

    it('Other is smaller then one', () => {
      const one = 'hello';
      const other = 'hi';

      const result = endsWith(one, other);
      assert.equal(result, false);
    });
  });

  describe('convertSimple2RegExp', function () {
    it('Test of convertRegexString2RegExp', () => {
      const result = convertSimple2RegExp('/toc\\.yml/i').test('TOC.yml');
      assert.equal(result, true);
    });

    it('Test of convertGlobalPattern2RegExp', () => {
      let result = convertSimple2RegExp('toc.yml').test('toc.yml');
      assert.equal(result, true);

      result = convertSimple2RegExp('toc.yml').test('TOC.yml');
      assert.equal(result, false);
    });
  });

  describe('safeCreateUnicodeRegExp', () => {
    it('should create unicode RegExp for non unicode patterns', () => {
      const result = safeCreateUnicodeRegExp(
        // eslint-disable-next-line prettier/prettier
        '^([2-9])\\.([0-9]+)\\.([0-9]+)(\\-[0-9a-z-]+(\\.[0-9a-z-]+)*)?(\\+[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?$'
      );
      expect(result).is.not.undefined;
    });

    it('should create unicode RegExp for non unicode patterns2', () => {
      // eslint-disable-next-line prettier/prettier
      const result = safeCreateUnicodeRegExp('^[^\\/~\\^\\: \\[\\]\\\\]+(\\/[^\\/~\\^\\: \\[\\]\\\\]+)*$');
      expect(result).is.not.undefined;
    });

    it('should create unicode RegExp for non unicode patterns3', () => {
      // eslint-disable-next-line prettier/prettier
      const result = safeCreateUnicodeRegExp('^(\\s?)+=[^\\=](.+)');
      expect(result).is.not.undefined;
    });

    it('should create unicode RegExp for non unicode patterns4', () => {
      // eslint-disable-next-line prettier/prettier
      const result = safeCreateUnicodeRegExp('^x-[\\w\\d\\.\\-\\_]+$');
      expect(result).is.not.undefined;
    });

    it('should create unicode RegExp for non unicode patterns5', () => {
      // eslint-disable-next-line prettier/prettier
      const result = safeCreateUnicodeRegExp('^[\\w\\-_]+$');
      expect(result).is.not.undefined;
    });
  });
});
