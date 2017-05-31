'use strict';

import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, RequestType
} from 'vscode-languageserver';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {load as yamlLoader, YAMLDocument, YAMLException} from 'yaml-ast-parser';
import {getLanguageService} from './languageService/yamlLanguageService'
import Strings = require( './languageService/utils/strings');
import URI from './languageService/utils/uri';
import * as URL from 'url';
import fs = require('fs');

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}

let pendingValidationRequests: { [uri: string]: NodeJS.Timer; } = {};
let pendingSchemaValidationRequests: { [uri: string]: NodeJS.Timer; } = {};
const validationDelayMs = 200;
const validationSchemaDelayMs = 350;

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

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
	triggerValidation(change.document);
});

documents.onDidClose((event=>{
	cleanPendingValidation(event.document);
	connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
}));

// The settings interface describe the server relevant settings part
interface Settings {
}

// hold the maxNumberOfProblems setting
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	// Revalidate any open text documents
	documents.all().forEach(validateTextDocument);
});

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
	let diagnostics  = [];
	if(yDoc.errors){
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
	languageService.doComplete(textDocument,null,yamlDoc).then(function(result){		
		for(let x = 0; x < result.items.length; x++){
			diagnostics.push(result.items[x]);
		}
		
		// Send the computed diagnostics to VSCode.
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	});
	
}

connection.onDidChangeWatchedFiles((change) => {
});


// This handler provides the initial list of the completion items.
//connection.onCompletion(textDocumentPosition =>  {
  //let document = documents.get(textDocumentPosition.textDocument.uri);
  //let yamlDoc:YAMLDocument = <YAMLDocument> yamlLoader(document.getText(),{});
  //return languageService.doComplete(document,textDocumentPosition.position,yamlDoc);
//});

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
