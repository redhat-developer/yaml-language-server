'use strict';

import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, RequestType, Location, Range, Position, Hover,
	HoverRequest
} from 'vscode-languageserver';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {load as yamlLoader, YAMLDocument, YAMLException, YAMLNode, Kind} from 'yaml-ast-parser-beta';
import {getLanguageService} from './languageService/yamlLanguageService'
import Strings = require( './languageService/utils/strings');
import URI from './languageService/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import { getLanguageModelCache } from './languageModelCache';
import {snippetAutocompletor} from './SnippetSupport/snippet';
import {parse as parseYaml} from './languageService/parser/yamlParser';
import {JSONDocument, getLanguageService as getJsonLanguageService } from 'vscode-json-languageservice';
import { getLineOffsets } from "./languageService/utils/arrUtils";
import {JSONSchemaService} from './languageService/services/jsonSchemaService'
var glob = require('glob');

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}

const validationDelayMs = 200;
let pendingValidationRequests: { [uri: string]: NodeJS.Timer; } = {};


// Create a connection for the server.
let connection: IConnection = null;
if (process.argv.indexOf('--stdio') == -1) {
	connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
} else {
	connection = createConnection();
}

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
	workspaceRoot = params.rootPath;
	return {
		capabilities: {
			hoverProvider: true,
			documentSymbolProvider: true,
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: TextDocumentSyncKind.Full,
			// Tell the client that the server support code complete
			completionProvider: {
				resolveProvider: true
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

// The settings interface describe the server relevant settings part
interface Settings {
	k8s: schemaSettings;
}

interface schemaSettings {
	filesNotValidating: Array<string>;
	k8sSchemaOn: boolean;
	kedgeSchemaOn: boolean;
}

let filesToIgnore: Array<string> = [];
let k8sSchemaOn = true;
let kedgeSchemaOn = false;

let languageService = getLanguageService(schemaRequestService, workspaceContext, true, false);
let jsonLanguageService = getJsonLanguageService(schemaRequestService);

connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	filesToIgnore = settings.k8s.filesNotValidating || [];
	k8sSchemaOn = settings.k8s.k8sSchemaOn;
	kedgeSchemaOn = settings.k8s.kedgeSchemaOn;
	languageService = getLanguageService(schemaRequestService, workspaceContext, k8sSchemaOn, kedgeSchemaOn);
	validateFilesNotInSetting();
});

function clearDiagnostics(){
	documents.all().forEach(doc => {
		connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] });
	});
}

function validateFilesNotInSetting(){
	clearDiagnostics();

	documents.all().forEach(doc => {
		triggerValidation(doc);
	});
	
}

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	if(change.document.getText().length === 0) connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });

	triggerValidation(change.document);
	
});

documents.onDidClose((event=>{
	cleanPendingValidation(event.document);
	connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
}));

function docIsValid(doc){
	let docUriFileTypeRemoved = doc.uri.split("//").pop();
	return filesToIgnore.indexOf(docUriFileTypeRemoved) === -1;
}

function triggerValidation(textDocument: TextDocument): void {
	cleanPendingValidation(textDocument);
	pendingValidationRequests[textDocument.uri] = setTimeout(() => {
		delete pendingValidationRequests[textDocument.uri];
		validateTextDocument(textDocument);
	}, validationDelayMs);
}

function cleanPendingValidation(textDocument: TextDocument): void {
	let request = pendingValidationRequests[textDocument.uri];
	if (request) {
		clearTimeout(request);
		delete pendingValidationRequests[textDocument.uri];
	}
}

function validateTextDocument(textDocument: TextDocument): void {
	let yDoc= yamlLoader(textDocument.getText(),{});
	if(yDoc !== undefined){ 
		let diagnostics  = [];
		if(yDoc.errors.length != 0){
			diagnostics = yDoc.errors.map(error =>{
				let mark = error.mark;
				return {
				severity: DiagnosticSeverity.Error,
				range: {
							start: textDocument.positionAt(mark.position),
							end: { line: error.mark.line, character: error.mark.column }
						},
				message: error.reason,
				source: "k8s"
				}
			});
		}

		if(docIsValid(textDocument)){
			let yamlDoc:YAMLDocument = <YAMLDocument> yamlLoader(textDocument.getText(),{});
			languageService.doValidation(textDocument, yamlDoc).then(function(result){		
				for(let x = 0; x < result.items.length; x++){
					diagnostics.push(result.items[x]);
				}
				
				// Send the computed diagnostics to VSCode.
				connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
			});
		}else{
			connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
		}
	}
}

// This handler provides the initial list of the completion items.
connection.onCompletion(textDocumentPosition =>  {
	let document = documents.get(textDocumentPosition.textDocument.uri);
	
	if(docIsValid(document)){
		return completionHelper(document, textDocumentPosition);
	}
	
	return [];
});

function completionHelper(document: TextDocument, textDocumentPosition){
		
		/*
		* THIS IS A HACKY VERSION. 
		* Needed to get the parent node from the current node to support live autocompletion
		*/

		//Get the string we are looking at via a substring
		let linePos = textDocumentPosition.position.line;
		let position = textDocumentPosition.position;
		let lineOffset = getLineOffsets(document.getText()); 
		let start = lineOffset[linePos]; //Start of where the autocompletion is happening
		let end = 0; //End of where the autocompletion is happening
		if(lineOffset[linePos+1]){
			end = lineOffset[linePos+1];
		}else{
			end = document.getText().length;
		}
		let textLine = document.getText().substring(start, end);
		
		//Check if the string we are looking at is a node
		if(textLine.indexOf(":") === -1){
			//We need to add the ":" to load the nodes
					
			let newText = "";

			//This is for the empty line case
			if(textLine.trim().length === 0){
				//Add a temp node that is in the document but we don't use at all.
				if(lineOffset[linePos+1]){
					newText = document.getText().substring(0, start+(textLine.length-1)) + "holder:\r\n" + document.getText().substr(end+2); 
				}else{
					newText = document.getText().substring(0, start+(textLine.length)) + "holder:\r\n" + document.getText().substr(end+2); 
				}
				
			//For when missing semi colon case
			}else{
				//Add a semicolon to the end of the current line so we can validate the node
				if(lineOffset[linePos+1]){
					newText = document.getText().substring(0, start+(textLine.length-1)) + ":\r\n" + document.getText().substr(end+2);
				}else{
					newText = document.getText().substring(0, start+(textLine.length)) + ":\r\n" + document.getText().substr(end+2);
				}
			}

			let yamlDoc:YAMLDocument = <YAMLDocument> yamlLoader(newText,{});
			return languageService.doComplete(document, position, yamlDoc);
		}else{

			//All the nodes are loaded
			let yamlDoc:YAMLDocument = <YAMLDocument> yamlLoader(document.getText(),{});
			position.character = position.character - 1;
			return languageService.doComplete(document, position, yamlDoc);
		}

}

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

let yamlDocuments = getLanguageModelCache<JSONDocument>(10, 60, document => parseYaml(document.getText()));

documents.onDidClose(e => {
	yamlDocuments.onDocumentRemoved(e.document);
});

connection.onShutdown(() => {
	yamlDocuments.dispose();
});

function getJSONDocument(document: TextDocument): JSONDocument {
	return yamlDocuments.get(document);
}

connection.onHover(params => {
	let document = documents.get(params.textDocument.uri);
	let yamlDoc:YAMLDocument = <YAMLDocument> yamlLoader(document.getText(),{});

	return languageService.doHover(document, params.position, yamlDoc).then((hoverItem): Hover => {
		return hoverItem;
	});
});

connection.onDocumentSymbol(params => {
	let document = documents.get(params.textDocument.uri);
	let jsonDocument = getJSONDocument(document);
	return jsonLanguageService.findDocumentSymbols(document, jsonDocument);
});

// Listen on the connection
connection.listen();
