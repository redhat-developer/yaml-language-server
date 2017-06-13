'use strict';

import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, RequestType
} from 'vscode-languageserver';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {load as yamlLoader, YAMLDocument, YAMLException} from 'yaml-ast-parser-beta';
import {getLanguageService} from './languageService/yamlLanguageService'
import Strings = require( './languageService/utils/strings');
import URI from './languageService/utils/uri';
import * as URL from 'url';
import fs = require('fs');
var glob = require('glob');

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}

let pendingValidationRequests: { [uri: string]: NodeJS.Timer; } = {};
const validationDelayMs = 250;


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

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	if(validDocuments.indexOf(change.document.uri) !== -1){
		triggerValidation(change.document);
	}
});

documents.onDidClose((event=>{
	cleanPendingValidation(event.document);
	connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
}));

// The settings interface describe the server relevant settings part
interface Settings {
	k8s: globSetting;
}

interface globSetting {
	glob: string;
}

let globSetting: string;
connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	globSetting = settings.k8s.glob || "";
	validateValidFiles();
});

let validDocuments: Array<String>;
function validateValidFiles(){
	//Clear all the previous diagnostics 
	documents.all().forEach(doc => {
		connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] });
	});
	
	validDocuments = [];
	glob(globSetting, function (er, files) {
		if(er){
			throw er;
		}

		files.forEach(file => {
			documents.all().forEach(doc => {
				let splitDocumentUri = doc.uri.split("/");
				let strippedDocumentUri = splitDocumentUri[splitDocumentUri.length - 1];
				if(strippedDocumentUri.indexOf(file) !== -1){
					validDocuments.push(doc.uri);
					triggerValidation(doc);
				}
			}
		)});

	})
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

		let yamlDoc:YAMLDocument = <YAMLDocument> yamlLoader(textDocument.getText(),{});
		languageService.doValidation(textDocument, yamlDoc).then(function(result){		
			for(let x = 0; x < result.items.length; x++){
				diagnostics.push(result.items[x]);
			}
			
			// Send the computed diagnostics to VSCode.
			connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
		});
	}
	
	
}


function getLineOffsets(textDocString: String): number[] {
		
		let lineOffsets: number[] = [];
		let text = textDocString;
		let isLineStart = true;
		for (let i = 0; i < text.length; i++) {
			if (isLineStart) {
				lineOffsets.push(i);
				isLineStart = false;
			}
			let ch = text.charAt(i);
			isLineStart = (ch === '\r' || ch === '\n');
			if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
				i++;
			}
		}
		if (isLineStart && text.length > 0) {
			lineOffsets.push(text.length);
		}
		
		return lineOffsets;
}

// This handler provides the initial list of the completion items.
connection.onCompletion(textDocumentPosition =>  {
	let document = documents.get(textDocumentPosition.textDocument.uri);
	if(validDocuments.indexOf(document.uri) !== -1){
		
		/*
		* THIS IS A HACKY VERSION. 
		* Needed to get the parent node from the current node to support autocompletion.
		*/

		//Get the string we are looking at via a substring
		let start = getLineOffsets(document.getText())[textDocumentPosition.position.line];
		let end = document.offsetAt(textDocumentPosition.position);
		let textLine = document.getText().substring(start, end);
		
		//Check if the string we are looking at is a node
		if(textLine.indexOf(":")){
			//We need to add the ":" to load the nodes
					
			let newText = "";

			//This is for the empty line case
			if(textLine.trim().length === 0){
				//Add a temp node that is in the document but we don't use at all.
				newText = document.getText().substring(0, end) + "holder:\r\n" + document.getText().substr(end+2) 
			//For when missing semi colon case
			}else{
				//Add a semicolon to the end of the current line so we can validate the node
				newText = document.getText().substring(0, end) + ":\r\n" + document.getText().substr(end+2)
			}

			let yamlDoc:YAMLDocument = <YAMLDocument> yamlLoader(newText,{});
			return languageService.doComplete(document, textDocumentPosition.position, yamlDoc);
		}else{

			//All the nodes are loaded
			let yamlDoc:YAMLDocument = <YAMLDocument> yamlLoader(document.getText(),{});
			return languageService.doComplete(document, textDocumentPosition.position, yamlDoc);
		}
	}
  
});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

let t: Thenable<string>;

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.textDocument.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.textDocument.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.textDocument.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});

connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.textDocument.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Listen on the connection
connection.listen();
