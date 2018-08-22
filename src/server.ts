/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	createConnection, IConnection,
	TextDocuments, TextDocument, InitializeParams, InitializeResult, NotificationType, RequestType,
	DocumentFormattingRequest, Disposable, Range, IPCMessageReader, IPCMessageWriter, DiagnosticSeverity, Position,
	Proposed, ProposedFeatures, CompletionList
} from 'vscode-languageserver';

import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import path = require('path');
import fs = require('fs');
import URI from './languageservice/utils/uri';
import * as URL from 'url';
import Strings = require('./languageservice/utils/strings');
import { getLineOffsets, removeDuplicatesObj } from './languageservice/utils/arrUtils';
import { getLanguageService as getCustomLanguageService, LanguageSettings } from './languageservice/yamlLanguageService';
import * as nls from 'vscode-nls';
import { FilePatternAssociation } from './languageservice/services/jsonSchemaService';
import { parse as parseYAML } from './languageservice/parser/yamlParser';
import { JSONDocument } from './languageservice/parser/jsonParser';
import { JSONSchema } from './languageservice/jsonSchema';
nls.config(<any>process.env['VSCODE_NLS_CONFIG']);

interface ISchemaAssociations {
	[pattern: string]: string[];
}

namespace SchemaAssociationNotification {
	export const type: NotificationType<{}, {}> = new NotificationType('json/schemaAssociations');
}

namespace VSCodeContentRequest {
	export const type: RequestType<{}, {}, {}, {}> = new RequestType('vscode/content');
}

namespace CustomSchemaContentRequest {
	export const type: RequestType<{}, {}, {}, {}> = new RequestType('custom/schema/content');
}

namespace CustomSchemaRequest {
	export const type: RequestType<{}, {}, {}, {}> = new RequestType('custom/schema/request');
}

namespace ColorSymbolRequest {
	export const type: RequestType<{}, {}, {}, {}> = new RequestType('json/colorSymbols');
}

// Create a connection for the server.
let connection: IConnection = null;
if (process.argv.indexOf('--stdio') == -1) {
	connection = createConnection(ProposedFeatures.all);
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

let clientDynamicRegisterSupport = false;
let hasWorkspaceFolderCapability = false;

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
let capabilities;
let workspaceFolders = [];
let workspaceRoot: URI;
connection.onInitialize((params: InitializeParams): InitializeResult => {
	capabilities = params.capabilities;
	workspaceFolders = params["workspaceFolders"];
	workspaceRoot = URI.parse(params.rootPath);

	function hasClientCapability(...keys: string[]) {
		let c = params.capabilities;
		for (let i = 0; c && i < keys.length; i++) {
			c = c[keys[i]];
		}
		return !!c;
	}

	hasWorkspaceFolderCapability = capabilities.workspace && !!capabilities.workspace.workspaceFolders;
	clientDynamicRegisterSupport = hasClientCapability('textDocument', 'formatting', 'dynamicRegistration');
	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			completionProvider: { resolveProvider: true },
			hoverProvider: true,
			documentSymbolProvider: true,
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
	//For the case when we are multi root and specify a workspace location
	if(hasWorkspaceFolderCapability){
		for(let folder in workspaceFolders){
			let currFolder = workspaceFolders[folder];
			let currFolderUri = currFolder["uri"];
			let currFolderName = currFolder["name"];

			let isUriRegex = new RegExp('^(?:[a-z]+:)?//', 'i');
			if(uri.indexOf(currFolderName) !== -1 && !uri.match(isUriRegex)){
				let beforeFolderName = currFolderUri.split(currFolderName)[0];
				let uriSplit = uri.split(currFolderName);
				uriSplit.shift()
				let afterFolderName = uriSplit.join(currFolderName);
				uri = beforeFolderName + currFolderName + afterFolderName;
			}

		}
	}
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
	} else {
		let scheme = URI.parse(uri).scheme.toLowerCase();
		if (scheme !== 'http' && scheme !== 'https') {
			// custom scheme
			return <Thenable<string>>connection.sendRequest(CustomSchemaContentRequest.type, uri);
		}
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

export let KUBERNETES_SCHEMA_URL = "https://gist.githubusercontent.com/JPinkney/ccaf3909ef811e5657ca2e2e1fa05d76/raw/f85e51bfb67fdb99ab7653c2953b60087cc871ea/openshift_schema_all.json";
export let KEDGE_SCHEMA_URL = "https://raw.githubusercontent.com/kedgeproject/json-schema/master/master/kedge-json-schema.json";
export let customLanguageService = getCustomLanguageService(schemaRequestService, workspaceContext, [],
	(resource) => connection.sendRequest(CustomSchemaRequest.type, resource));

// The settings interface describes the server relevant settings part
interface Settings {
	yaml: {
		format: { enable: boolean; };
		schemas: JSONSchemaSettings[];
		validate: boolean;
		customTags: Array<String>;
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
let yamlShouldValidate = true;
let schemaStoreSettings = [];
let customTags = [];

connection.onDidChangeConfiguration((change) => {
	var settings = <Settings>change.settings;
	configureHttpRequests(settings.http && settings.http.proxy, settings.http && settings.http.proxyStrictSSL);

	specificValidatorPaths = [];
	yamlConfigurationSettings = settings.yaml && settings.yaml.schemas;
	yamlShouldValidate = settings.yaml && settings.yaml.validate;
	schemaConfigurationSettings = [];
	customTags = settings.yaml && settings.yaml.customTags ? settings.yaml.customTags : [];

	for(let url in yamlConfigurationSettings){
		let globPattern = yamlConfigurationSettings[url];
		let schemaObj = {
			"fileMatch": Array.isArray(globPattern) ? globPattern : [globPattern],
			"url": url
		}
		schemaConfigurationSettings.push(schemaObj);
	}

	setSchemaStoreSettingsIfNotSet();

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

function setSchemaStoreSettingsIfNotSet(){
	if(schemaStoreSettings.length === 0){
		getSchemaStoreMatchingSchemas().then(schemaStore => {
			schemaStoreSettings = schemaStore.schemas;
			updateConfiguration();
		});
	}
}

function getSchemaStoreMatchingSchemas(){

	return xhr({ url: "http://schemastore.org/api/json/catalog.json" }).then(response => {

		let languageSettings= {
			schemas: []
		};

		let schemas = JSON.parse(response.responseText);
		for(let schemaIndex in schemas.schemas){

			let schema = schemas.schemas[schemaIndex];
			if(schema && schema.fileMatch){

				for(let fileMatch in schema.fileMatch){
					let currFileMatch = schema.fileMatch[fileMatch];

					if(currFileMatch.indexOf('.yml') !== -1 || currFileMatch.indexOf('.yaml') !== -1){
						languageSettings.schemas.push({ uri: schema.url, fileMatch: [currFileMatch] });
					}

				}

			}

		}

		return languageSettings;

	}, (error: XHRResponse) => {
		throw error;
	});

}

connection.onNotification(SchemaAssociationNotification.type, associations => {
	schemaAssociations = associations;
	specificValidatorPaths = [];
	setSchemaStoreSettingsIfNotSet();
	updateConfiguration();
});

function updateConfiguration() {
	let languageSettings: LanguageSettings = {
		validate: yamlShouldValidate,
		schemas: [],
		customTags: customTags
	};
	if (schemaAssociations) {
		for (var pattern in schemaAssociations) {
			let association = schemaAssociations[pattern];
			if (Array.isArray(association)) {
				association.forEach(uri => {
					languageSettings = configureSchemas(uri, [pattern], null, languageSettings);
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
				if (uri[0] === '.' && workspaceRoot && !hasWorkspaceFolderCapability) {
					// workspace relative path
					uri = URI.file(path.normalize(path.join(workspaceRoot.fsPath, uri))).toString();
				}
				languageSettings = configureSchemas(uri, schema.fileMatch, schema.schema, languageSettings);
			}
		});
	}
	if(schemaStoreSettings){
		languageSettings.schemas = languageSettings.schemas.concat(schemaStoreSettings);
	}
	customLanguageService.configure(languageSettings);

	// Revalidate any open text documents
	documents.all().forEach(triggerValidation);
}

function configureSchemas(uri, fileMatch, schema, languageSettings){

	if(uri.toLowerCase().trim() === "kubernetes"){
		uri = KUBERNETES_SCHEMA_URL;
	}
	if(uri.toLowerCase().trim() === "kedge"){
		uri = KEDGE_SCHEMA_URL;
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

function setKubernetesParserOption(jsonDocuments: JSONDocument[], option: boolean){
	for(let jsonDoc in jsonDocuments){
		jsonDocuments[jsonDoc].configureSettings({
			isKubernetes: option
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

documents.onDidChangeContent((change) => {
	triggerValidation(change.document);
});

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

	if(!textDocument){
		return;
	}

	if (textDocument.getText().length === 0) {
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
		return;
	}

	let yamlDocument = parseYAML(textDocument.getText(), customTags);
	isKubernetes(textDocument) ? setKubernetesParserOption(yamlDocument.documents, true) : setKubernetesParserOption(yamlDocument.documents, false);
	customLanguageService.doValidation(textDocument, yamlDocument).then(function(diagnosticResults){

		let diagnostics = [];
		for(let diagnosticItem in diagnosticResults){
			diagnosticResults[diagnosticItem].severity = 1; //Convert all warnings to errors
			diagnostics.push(diagnosticResults[diagnosticItem]);
		}

		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: removeDuplicatesObj(diagnostics) });
	}, function(error){});
}

connection.onDidChangeWatchedFiles((change) => {
	// Monitored files have changed in VSCode
	let hasChanges = false;
	change.changes.forEach(c => {
		if (customLanguageService.resetSchema(c.uri)) {
			hasChanges = true;
		}
	});
	if (hasChanges) {
		documents.all().forEach(validateTextDocument);
	}
});

connection.onCompletion(textDocumentPosition =>  {
	let textDocument = documents.get(textDocumentPosition.textDocument.uri);
	
	let result: CompletionList = {
		items: [],
		isIncomplete: false
	};

	if(!textDocument){
		return Promise.resolve(result);
	}
	
	let completionFix = completionHelper(textDocument, textDocumentPosition.position);
	let newText = completionFix.newText;
	let jsonDocument = parseYAML(newText);
	isKubernetes(textDocument) ? setKubernetesParserOption(jsonDocument.documents, true) : setKubernetesParserOption(jsonDocument.documents, false);
	return customLanguageService.doComplete(textDocument, textDocumentPosition.position, jsonDocument);
});

function is_EOL(c) {
	return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
}

function completionHelper(document: TextDocument, textDocumentPosition: Position){

	//Get the string we are looking at via a substring
	let linePos = textDocumentPosition.line;
	let position = textDocumentPosition;
	let lineOffset = getLineOffsets(document.getText());
	let start = lineOffset[linePos]; //Start of where the autocompletion is happening
	let end = 0; //End of where the autocompletion is happening
	if(lineOffset[linePos+1]){
		end = lineOffset[linePos+1];
	}else{
		end = document.getText().length;
	}

	while (end - 1 >= 0 && is_EOL(document.getText().charCodeAt(end - 1))) {
		end--;
	}

	let textLine = document.getText().substring(start, end);

	//Check if the string we are looking at is a node
	if(textLine.indexOf(":") === -1){
		//We need to add the ":" to load the nodes

		let newText = "";

		//This is for the empty line case
		let trimmedText = textLine.trim();
		if(trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === '-')){
			//Add a temp node that is in the document but we don't use at all.
			newText = document.getText().substring(0, start+textLine.length) + "holder:\r\n" + document.getText().substr(lineOffset[linePos+1] || document.getText().length);

		//For when missing semi colon case
		}else{
			//Add a semicolon to the end of the current line so we can validate the node
			newText = document.getText().substring(0, start+textLine.length) + ":\r\n" + document.getText().substr(lineOffset[linePos+1] || document.getText().length);
		}

		return {
			"newText": newText,
			"newPosition": textDocumentPosition
		}

	}else{

		//All the nodes are loaded
		position.character = position.character - 1;
		return {
			"newText": document.getText(),
			"newPosition": position
		}
	}

}

connection.onCompletionResolve(completionItem => {
	return customLanguageService.doResolve(completionItem);
});

connection.onHover(textDocumentPositionParams => {
	let document = documents.get(textDocumentPositionParams.textDocument.uri);
	
	if(!document){
		return Promise.resolve(void 0);
	}

	let jsonDocument = parseYAML(document.getText());
	isKubernetes(document) ? setKubernetesParserOption(jsonDocument.documents, true) : setKubernetesParserOption(jsonDocument.documents, false);
	return customLanguageService.doHover(document, textDocumentPositionParams.position, jsonDocument);
});

connection.onDocumentSymbol(documentSymbolParams => {
	let document = documents.get(documentSymbolParams.textDocument.uri);

	if(!document){
		return;
	}

	let jsonDocument = parseYAML(document.getText());
	return customLanguageService.findDocumentSymbols(document, jsonDocument);
});

connection.onDocumentFormatting(formatParams => {
	let document = documents.get(formatParams.textDocument.uri);

	if(!document){
		return;
	}

	return customLanguageService.doFormat(document, formatParams.options, customTags);
});

connection.listen();