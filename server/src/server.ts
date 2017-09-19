/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Joshua Pinkney. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	createConnection, IConnection,
	TextDocuments, TextDocument, InitializeParams, InitializeResult, NotificationType, RequestType,
	DocumentFormattingRequest, Disposable, Range, IPCMessageReader, IPCMessageWriter, DiagnosticSeverity
} from 'vscode-languageserver';

import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import path = require('path');
import fs = require('fs');
import URI from './languageService/utils/uri';
import * as URL from 'url';
import Strings = require('./languageService/utils/strings');
import { YAMLDocument, JSONSchema, LanguageSettings, getLanguageService } from 'vscode-yaml-languageservice';
import { getLanguageModelCache } from './languageModelCache';
import { getLineOffsets } from './languageService/utils/arrUtils';
import { load as yamlLoader, YAMLDocument as YAMLDoc } from 'yaml-ast-parser';
import { getLanguageService as getCustomLanguageService } from './languageService/yamlLanguageService';
var minimatch = require("minimatch")

import * as nls from 'vscode-nls';
import { FilePatternAssociation } from './languageService/services/jsonSchemaService';
nls.config(process.env['VSCODE_NLS_CONFIG']);

interface ISchemaAssociations {
	[pattern: string]: string[];
}

namespace SchemaAssociationNotification {
	export const type: NotificationType<ISchemaAssociations, any> = new NotificationType('json/schemaAssociations');
}

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}

namespace ColorSymbolRequest {
	export const type: RequestType<string, Range[], any, any> = new RequestType('json/colorSymbols');
}

// Create a connection for the server.
let connection: IConnection = null;
if (process.argv.indexOf('--stdio') == -1) {
	connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
} else {
	connection = createConnection();
}

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let clientSnippetSupport = false;
let clientDynamicRegisterSupport = false;

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
let workspaceRoot: URI;
connection.onInitialize((params: InitializeParams): InitializeResult => {
	workspaceRoot = URI.parse(params.rootPath);

	function hasClientCapability(...keys: string[]) {
		let c = params.capabilities;
		for (let i = 0; c && i < keys.length; i++) {
			c = c[keys[i]];
		}
		return !!c;
	}

	//clientSnippetSupport = hasClientCapability('textDocument', 'completion', 'completionItem', 'snippetSupport');
	//clientDynamicRegisterSupport = hasClientCapability('workspace', 'symbol', 'dynamicRegistration');
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			// Disabled because too JSON centric
			completionProvider: { resolveProvider: true },
			hoverProvider: true,
			documentSymbolProvider: false,
			documentFormattingProvider: false
		}
	};
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
	if (uri.indexOf('//schema.management.azure.com/') !== -1) {
		connection.telemetry.logEvent({
			key: 'json.schema',
			value: {
				schemaURL: uri
			}
		});
	}
	let headers = { 'Accept-Encoding': 'gzip, deflate' };
	return xhr({ url: uri, followRedirects: 5, headers }).then(response => {
		return response.responseText;
	}, (error: XHRResponse) => {
		return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
	});
};

// create the YAML language service
let languageService = getLanguageService({
	schemaRequestService,
	workspaceContext,
	contributions: []
});

let KUBERNETES_SCHEMA_URL = "http://central.maven.org/maven2/io/fabric8/kubernetes-model/1.1.4/kubernetes-model-1.1.4-schema.json";
let customLanguageService = getCustomLanguageService(schemaRequestService, workspaceContext);

// The settings interface describes the server relevant settings part
interface Settings {
	yaml: {
		format: { enable: boolean; };
		schemas: JSONSchemaSettings[];
	};
	http: {
		proxy: string;
		proxyStrictSSL: boolean;
	};
}

interface JSONSchemaSettings {
	fileMatch?: string[];
	url?: string;
	schema?: JSONSchema;
}

let yamlConfigurationSettings: JSONSchemaSettings[] = void 0;
let schemaAssociations: ISchemaAssociations = void 0;
let formatterRegistration: Thenable<Disposable> = null;
let specificValidatorPaths = [];
let schemaConfigurationSettings = [];

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
	var settings = <Settings>change.settings;
	configureHttpRequests(settings.http && settings.http.proxy, settings.http && settings.http.proxyStrictSSL);

	specificValidatorPaths = [];
	yamlConfigurationSettings = settings.yaml && settings.yaml.schemas;
	schemaConfigurationSettings = [];

	for(let url in yamlConfigurationSettings){
		let globPattern = yamlConfigurationSettings[url];
		let schemaObj = {
			"fileMatch": Array.isArray(globPattern) ? globPattern : [globPattern],
			"url": url
		}
		schemaConfigurationSettings.push(schemaObj);
	}

	updateConfiguration();

	// dynamically enable & disable the formatter
	if (clientDynamicRegisterSupport) {
		let enableFormatter = settings && settings.yaml && settings.yaml.format && settings.yaml.format.enable;
		if (enableFormatter) {
			if (!formatterRegistration) {
				formatterRegistration = connection.client.register(DocumentFormattingRequest.type, { documentSelector: [{ language: 'yaml' }] });
			}
		} else if (formatterRegistration) {
			formatterRegistration.then(r => r.dispose());
			formatterRegistration = null;
		}
	}
});

// The jsonValidation extension configuration has changed
connection.onNotification(SchemaAssociationNotification.type, associations => {
	schemaAssociations = associations;
	specificValidatorPaths = [];
	updateConfiguration();
});

function updateConfiguration() {
	let languageSettings: LanguageSettings = {
		validate: true,
		schemas: []
	};
	if (schemaAssociations) {
		for (var pattern in schemaAssociations) {
			let association = schemaAssociations[pattern];
			if (Array.isArray(association)) {
				association.forEach(uri => {
					languageSettings = configureSchemas(uri, [pattern], null);
				});
			}
		}
	}
	if (schemaConfigurationSettings) {
		schemaConfigurationSettings.forEach(schema => {
			let uri = schema.url;
			if (!uri && schema.schema) {
				uri = schema.schema.id;
			}
			if (!uri && schema.fileMatch) {
				uri = 'vscode://schemas/custom/' + encodeURIComponent(schema.fileMatch.join('&'));
			}
			if (uri) {
				if (uri[0] === '.' && workspaceRoot) {
					// workspace relative path
					uri = URI.file(path.normalize(path.join(workspaceRoot.fsPath, uri))).toString();
				}
				languageSettings = configureSchemas(uri, schema.fileMatch, schema.schema);
			}
		});
	}
	languageService.configure(languageSettings);
	customLanguageService.configure(languageSettings);

	// Revalidate any open text documents
	documents.all().forEach(triggerValidation);
}

function configureSchemas(uri, fileMatch, schema){
	
	let languageSettings: LanguageSettings = {
		validate: true,
		schemas: []
	};
	
	if(uri.toLowerCase().trim() === "kedge"){
		/*
		 * Kedge schema is currently not working
		 */

		//uri = 'https://raw.githubusercontent.com/surajssd/kedgeSchema/master/configs/appspec.json';
	}else if(uri.toLowerCase().trim() === "kubernetes"){
		uri = KUBERNETES_SCHEMA_URL;	
	}

	if(schema === null){
		languageSettings.schemas.push({ uri, fileMatch: fileMatch });
	}else{
		languageSettings.schemas.push({ uri, fileMatch: fileMatch, schema: schema });
	}

	if(fileMatch.constructor === Array && uri === KUBERNETES_SCHEMA_URL){
		fileMatch.forEach((url) => {
			specificValidatorPaths.push(url);
		});
	}else if(uri === KUBERNETES_SCHEMA_URL){
		specificValidatorPaths.push(fileMatch);
	}
	

	return languageSettings;

}

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	triggerValidation(change.document);
});

// a document has closed: clear all diagnostics
documents.onDidClose(event => {
	cleanPendingValidation(event.document);
	connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

let pendingValidationRequests: { [uri: string]: NodeJS.Timer; } = {};
const validationDelayMs = 200;

function cleanPendingValidation(textDocument: TextDocument): void {
	let request = pendingValidationRequests[textDocument.uri];
	if (request) {
		clearTimeout(request);
		delete pendingValidationRequests[textDocument.uri];
	}
}

function triggerValidation(textDocument: TextDocument): void {
	cleanPendingValidation(textDocument);
	pendingValidationRequests[textDocument.uri] = setTimeout(() => {
		delete pendingValidationRequests[textDocument.uri];
		validateTextDocument(textDocument);
	}, validationDelayMs);
}

function validateTextDocument(textDocument: TextDocument): void {
	
	if (textDocument.getText().length === 0) {
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });		
		return;
	}

	if(isKubernetes(textDocument)){
		generalYamlValidator(textDocument).then(function(generalResults){
			specificYamlValidator(textDocument).then(function(specificResults){
				let generalDiagnostics = generalResults == null ? [] : generalResults;
				let diagnostics = generalDiagnostics.concat(specificResults.items);
				connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: removeDuplicates(diagnostics) });
			});
		});
	}else{
		generalYamlValidator(textDocument).then(function(generalResults){
			connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: removeDuplicates(generalResults) });
		});
	}
}

function isKubernetes(textDocument){
	for(let path in specificValidatorPaths){
		let globPath = specificValidatorPaths[path];
		let fpa = new FilePatternAssociation(globPath);
		if(fpa.matchesPattern(textDocument.uri)){
			return true;
		}
	}
	return false;
}

function generalYamlValidator(textDocument: TextDocument) {
	//Validator for regular yaml files

	let jsonDocument = getJSONDocument(textDocument);
	let diagnostics = [];
	return languageService.doValidation(textDocument, jsonDocument).then(function(results) {
		
		for(let diagnosticItem in results){
			results[diagnosticItem].severity = 1; //Convert all warnings to errors
			diagnostics.push(results[diagnosticItem]);
		}

		return diagnostics;
		// Send the computed diagnostics to VSCode.
		//connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: removeDuplicates(diagnostics) });
	}, function(error){});
}

function removeDuplicates(objArray){
	
	let nonDuplicateSet = new Set();
	let nonDuplicateArr = [];
	for(let obj in objArray){

		let currObj = objArray[obj];
		let stringifiedObj = JSON.stringify(currObj);
		if(!nonDuplicateSet.has(stringifiedObj)){
			nonDuplicateArr.push(currObj);
			nonDuplicateSet.add(stringifiedObj);
		}

	}

	return nonDuplicateArr;

}

function specificYamlValidator(textDocument: TextDocument){
	//Validator for kubernetes/kedge files
	let diagnostics = [];
	let yamlDoc:YAMLDoc = <YAMLDoc> yamlLoader(textDocument.getText(),{});
	return customLanguageService.doValidation(textDocument, yamlDoc).then(function(result){
		// for(let x = 0; x < result.items.length; x++){
		// 	diagnostics.push(result.items[x]);
		// }
		// Send the computed diagnostics to VSCode.
		return result;
		//connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: removeDuplicates(diagnostics) });
	}, function(error){});
	
}

connection.onDidChangeWatchedFiles((change) => {
	// Monitored files have changed in VSCode
	let hasChanges = false;
	change.changes.forEach(c => {
		if (languageService.resetSchema(c.uri)) {
			hasChanges = true;
		}
	});
	if (hasChanges) {
		documents.all().forEach(validateTextDocument);
	}
});

let yamlDocuments = getLanguageModelCache<YAMLDocument>(10, 60, document => languageService.parseYAMLDocument(document));

documents.onDidClose(e => {
	yamlDocuments.onDocumentRemoved(e.document);
});

connection.onShutdown(() => {
	yamlDocuments.dispose();
});

function getJSONDocument(document: TextDocument): YAMLDocument {
	return yamlDocuments.get(document);
}

// This handler provides the initial list of the completion items.
connection.onCompletion(textDocumentPosition =>  {
	let document = documents.get(textDocumentPosition.textDocument.uri);
	return completionHelper(document, textDocumentPosition);
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
			let yamlDoc:YAMLDoc = <YAMLDoc> yamlLoader(newText,{});
			return customLanguageService.doComplete(document, position, yamlDoc);
		}else{

			//All the nodes are loaded
			let yamlDoc:YAMLDoc = <YAMLDoc> yamlLoader(document.getText(),{});
			position.character = position.character - 1;
			return customLanguageService.doComplete(document, position, yamlDoc);
		}

}

connection.onCompletionResolve(completionItem => {
	return languageService.doResolve(completionItem);
});

connection.onHover(textDocumentPositionParams => {
	let document = documents.get(textDocumentPositionParams.textDocument.uri);
	let yamlDoc:YAMLDoc = <YAMLDoc> yamlLoader(document.getText(),{});
	let jsonDocument = getJSONDocument(document);

	if(isKubernetes(textDocumentPositionParams.textDocument)){
		return customLanguageService.doHover(document, textDocumentPositionParams.position, yamlDoc);
	}

	let hoverItem = languageService.doHover(document, textDocumentPositionParams.position, jsonDocument);
	return hoverItem.then(function(result){
		return result;
	}, function(error){});
});

connection.onDocumentSymbol(documentSymbolParams => {
	let document = documents.get(documentSymbolParams.textDocument.uri);
	let jsonDocument = getJSONDocument(document);
	return languageService.findDocumentSymbols(document, jsonDocument);
});

connection.onDocumentFormatting(formatParams => {
	let document = documents.get(formatParams.textDocument.uri);
	return languageService.format(document, formatParams.options);
});

// Listen on the connection
connection.listen();