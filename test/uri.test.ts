/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import URI from '../src/languageservice/utils/uri';
var path = require('path');
var assert = require('assert');

suite("URI Tests", () => {

	describe('URI Parse', function(){
        it('Basic', () => {
            var result = URI.parse("http://www.foo.com/bar.html?name=hello#123");
            assert.equal(result.authority, "www.foo.com");
            assert.equal(result.fragment, "123");
            assert.equal(result.fsPath, path.sep + "bar.html");
            assert.equal(result.path, "/bar.html");
            assert.equal(result.query, "name=hello");
            assert.equal(result.scheme, "http");
        });
    });

    describe('URI Create', function(){
        it('Basic', () => {
            var result = URI.create("http", "www.foo.com", "/bar.html", "name=hello", "123");
            assert.equal(result.authority, "www.foo.com");
            assert.equal(result.fragment, "123");
            assert.equal(result.fsPath, path.sep + "bar.html");
            assert.equal(result.path, "/bar.html");
            assert.equal(result.query, "name=hello");
            assert.equal(result.scheme, "http");
        });
    });

    describe('URI File', function(){
        it('Basic', () => {
            var result = URI.file("../uri.test.ts");
            assert.equal(result.fragment, "");
            assert.equal(result.fsPath, path.sep + ".." + path.sep + "uri.test.ts");
            assert.equal(result.path, "/../uri.test.ts");
            assert.equal(result.query, "");
            assert.equal(result.scheme, "file");
        });

        it('File with UNC share', () => {
            var result = URI.file("//server/share");
            assert.equal(result.fragment, "");
            assert.equal(result.path, "/share");
            assert.equal(result.query, "");
            assert.equal(result.scheme, "file");
            assert.equal(result.authority, "server");
        });

        it('File with location', () => {
            var result = URI.file("//server");
            assert.equal(result.fragment, "");
            assert.equal(result.path, "/");
            assert.equal(result.query, "");
            assert.equal(result.scheme, "file");
            assert.equal(result.authority, "server");
        });
    });

    describe('URI toString', function(){
        it('toString with encoding', () => {
            var result = URI.parse("http://www.foo.com:8080/bar.html?name=hello#123").toString();
            assert.equal("http://www.foo.com:8080/bar.html?name%3Dhello#123", result);
        });

        it('toString without encoding', () => {
            var result = URI.parse("http://www.foo.com/bar.html?name=hello#123").toString(true);
            assert.equal("http://www.foo.com/bar.html?name=hello#123", result);
        });

        it('toString with system file', () => {
            var result = URI.parse("file:///C:/test.txt").toString(true);
            assert.equal("file:///c:/test.txt", result);
        });
    });

    describe('URI toJson', function(){
        it('toJson with system file', () => {
            var result = URI.parse("file:///C:/test.txt").toJSON();
            assert.equal(result["authority"], "");
            assert.equal(result["external"], "file:///c%3A/test.txt");
            assert.equal(result["fragment"], "");
            assert.equal(result["fsPath"], "c:" + path.sep + "test.txt");
            assert.equal(result["path"], "/C:/test.txt");
            assert.equal(result["query"], "");
            assert.equal(result["scheme"], "file");
        });
    });
        
});