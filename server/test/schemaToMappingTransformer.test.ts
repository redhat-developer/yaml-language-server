// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node


import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, RequestType
} from 'vscode-languageserver';
import {load as yamlLoader, YAMLDocument, YAMLException, YAMLNode} from 'yaml-ast-parser-beta';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {getLanguageService} from '../src/languageService/yamlLanguageService'
import Strings = require( '../src/languageService/utils/strings');
import URI from '../src/languageService/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageService/services/jsonSchemaService';
import {schemaService, languageService}  from './testHelper';
var glob = require('glob');
var assert = require('assert');

// schemaService.getResolvedSchema(schemaService.getRegisteredSchemaIds()[0]).then(schema =>{
// 	suite("Schema Transformation Tests", () => {

// 		describe('Server - Schema Tranformation - schemaToMappingTransformer', function(){
			
// 			let schemaTransformer = new SchemaToMappingTransformer(schema.schema);

// 			describe('getSchema', function(){
// 				it("Schema is not empty", function(){
// 					assert.notEqual(Object.keys(schemaTransformer.getSchema()).length, 0);
// 				});
// 			});

// 			describe('getKuberSchema', function(){
// 				it("Schema is not empty", function(){
// 					assert.notEqual(Object.keys(schemaTransformer.getKuberSchema()).length, 0);
// 				});
// 			});

// 		});

// 	});
// });