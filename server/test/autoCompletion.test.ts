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
import { AutoCompleter } from '../src/languageService/services/autoCompleter'
import { YAMLSChemaValidator } from '../src/languageService/services/schemaValidator'
import {load as yamlLoader, YAMLDocument, YAMLException, YAMLNode} from 'yaml-ast-parser-beta';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {getLanguageService} from '../src/languageService/yamlLanguageService'
import Strings = require( '../src/languageService/utils/strings');
import URI from '../src/languageService/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageService/services/jsonSchemaService'
var glob = require('glob');
var assert = require('assert');

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}

const validationDelayMs = 250;
let pendingValidationRequests: { [uri: string]: NodeJS.Timer; } = {};
let validDocuments: Array<String>;


// Create a connection for the server.
let connection: IConnection = null;
if (process.argv.indexOf('--stdio') == -1) {
	connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
} else {
	connection = createConnection();
}

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
	workspaceRoot = params.rootPath;
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: TextDocumentSyncKind.Full,
			// Tell the client that the server support code complete
			completionProvider: {
				resolveProvider: false
			}
		}
	}
});

let workspaceContext = {
	resolveRelativePath: (relativePath: string, resource: string) => {
		return URL.resolve(resource, relativePath);
	}
};

let schemaRequestService = (uri: string): Thenable<string> => {
	if (Strings.startsWith(uri, 'file://')) {
		let fsPath = URI.parse(uri).fsPath;
		return new Promise<string>((c, e) => {
			fs.readFile(fsPath, 'UTF-8', (err, result) => {
				err ? e('') : c(result.toString());
			});
		});
	} else if (Strings.startsWith(uri, 'vscode://')) {
		return connection.sendRequest(VSCodeContentRequest.type, uri).then(responseText => {
			return responseText;
		}, error => {
			return error.message;
		});
	}
	return xhr({ url: uri, followRedirects: 5 }).then(response => {
		return response.responseText;
	}, (error: XHRResponse) => {
		return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
	});
};

let languageService = getLanguageService(schemaRequestService, workspaceContext);
let schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);
//TODO: maps schemas from settings.
schemaService.registerExternalSchema('http://central.maven.org/maven2/io/fabric8/kubernetes-model/1.0.65/kubernetes-model-1.0.65-schema.json',
['*.yml', '*.yaml']);
schemaService.getResolvedSchema(schemaService.getRegisteredSchemaIds()[0]).then(schema =>{

    suite("Auto Completion Tests", () => {

        describe('Auto Completion - astServices', function(){
            
            describe('findNode', function(){

                //Tests for findNode

            });

        });

        describe('Auto Completion - yamlCompletion', function(){
            
            describe('doComplete', function(){

            });

        });

        describe('Auto Completion autoCompleter', function() {
            let auto = new AutoCompleter(schema.schema); 

            describe('searchAll', function() {
                it('Checking general search functionality', () => {
                    let searchResults = auto.searchAll();
                    assert.equal(searchResults.length, 523);
                });
            });

            // IDK HOW TO TEST THIS
            // describe('generateRegularAutocompletion', function() {
            // 	it('Checking general search for regular nodes', () => {
            //         let searchResults = auto.generateRegularAutocompletion("kin"); //This takes a node
            //         assert.equal(searchResults.length, 2); //This will need to be changed
            //     });
            // });

            describe('generateScalarAutocompletion', function() {
                it('Checking general search for scalar nodes', () => {
                    let searchResults = auto.generateScalarAutocompletion("kind"); //This requires the root node as this
                    assert.equal(searchResults.length, 109); 
                });
            });

        });

    });

});