/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, RequestType
} from 'vscode-languageserver';
import {load as yamlLoader, YAMLDocument, YAMLException, YAMLNode} from 'yaml-ast-parser';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import {getLanguageService} from '../src/languageservice/yamlLanguageService'
import Strings = require( '../src/languageservice/utils/strings');
import URI from '../src/languageservice/utils/uri';
import * as URL from 'url';
import fs = require('fs');
import {JSONSchemaService} from '../src/languageservice/services/jsonSchemaService'
var assert = require('assert');

namespace VSCodeContentRequest {
	export const type: RequestType<{}, {}, {}, {}> = new RequestType('vscode/content');
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

export let workspaceContext = {
	resolveRelativePath: (relativePath: string, resource: string) => {
		return URL.resolve(resource, relativePath);
	}
};

export let schemaRequestService = (uri: string): Thenable<string> => {
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