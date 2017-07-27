# vscode-json-languageservice
JSON language service extracted from VSCode to be reused, e.g in the Monaco editor.

[![npm Package](https://img.shields.io/npm/v/vscode-json-languageservice.svg?style=flat-square)](https://www.npmjs.org/package/vscode-json-languageservice)
[![NPM Downloads](https://img.shields.io/npm/dm/vscode-json-languageservice.svg)](https://npmjs.org/package/vscode-json-languageservice)
[![Build Status](https://travis-ci.org/Microsoft/vscode-json-languageservice.svg?branch=master)](https://travis-ci.org/Microsoft/vscode-json-languageservice)

Why?
----
The _vscode-json-languageservice_ contains the language smarts behind the JSON editing experience of Visual Studio Code
and the Monaco editor.
 - *doValidation* analyses an input string and returns syntax and lint errros.
 - *doComplete* provides completion proposals for a given location.
 - *doResolve* resolves a completion proposals.
 - *doHover* provides a hover text for a given location.
 - *findDocumentSymbols* provides all symbols in the given document
 - *format* formats the code at the given range.

Installation
------------

    npm install --save vscode-json-languageservice
