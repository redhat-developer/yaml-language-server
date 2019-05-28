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
    Disposable, Position, ProposedFeatures, CompletionList, DocumentRangeFormattingRequest
} from 'vscode-languageserver';

import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import path = require('path');
import fs = require('fs');
import URI from './languageservice/utils/uri';
import * as URL from 'url';
import Strings = require('./languageservice/utils/strings');
import { getLineOffsets, removeDuplicatesObj } from './languageservice/utils/arrUtils';
import { getLanguageService as getCustomLanguageService, LanguageSettings, CustomFormatterOptions } from './languageservice/yamlLanguageService';
import * as nls from 'vscode-nls';
import { CustomSchemaProvider, FilePatternAssociation } from './languageservice/services/jsonSchemaService';
import { parse as parseYAML } from './languageservice/parser/yamlParser04';
import { parse as parseYAML2 } from './languageservice/parser/yamlParser07';
import { JSONSchema } from './languageservice/jsonSchema04';
import { getLanguageService as getJSONLanguageService } from 'vscode-json-languageservice';
// tslint:disable-next-line: no-any
nls.config(<any>process.env['VSCODE_NLS_CONFIG']);

interface ISchemaAssociations {
    [pattern: string]: string[];
}

namespace SchemaAssociationNotification {
    export const type: NotificationType<{}, {}> = new NotificationType('json/schemaAssociations');
}

namespace DynamicCustomSchemaRequestRegistration {
    export const type: NotificationType<{}, {}> = new NotificationType('yaml/registerCustomSchemaRequest');
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
if (process.argv.indexOf('--stdio') === -1) {
    connection = createConnection(ProposedFeatures.all);
} else {
    connection = createConnection();
}

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let clientDynamicRegisterSupport = false;
let hasWorkspaceFolderCapability = false;
let hierarchicalDocumentSymbolSupport = false;

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
let capabilities;
let workspaceFolders = [];
let workspaceRoot: URI;
connection.onInitialize((params: InitializeParams): InitializeResult => {
    capabilities = params.capabilities;
    workspaceFolders = params['workspaceFolders'];
    workspaceRoot = URI.parse(params.rootPath);

    function getClientCapability<T>(name: string, def: T) {
        const keys = name.split('.');
        // tslint:disable-next-line: no-any
        let c: any = params.capabilities;
        for (let i = 0; c && i < keys.length; i++) {
            if (!c.hasOwnProperty(keys[i])) {
                return def;
            }
            c = c[keys[i]];
        }
        return c;
    }

    hierarchicalDocumentSymbolSupport = getClientCapability('textDocument.documentSymbol.hierarchicalDocumentSymbolSupport', false);
    hasWorkspaceFolderCapability = capabilities.workspace && !!capabilities.workspace.workspaceFolders;
    clientDynamicRegisterSupport = getClientCapability('workspace.symbol.dynamicRegistration', false);
    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            completionProvider: { resolveProvider: true },
            hoverProvider: true,
            documentSymbolProvider: true,
            documentFormattingProvider: true
        }
    };
});

const workspaceContext = {
    resolveRelativePath: (relativePath: string, resource: string) =>
        URL.resolve(resource, relativePath)
};

const schemaRequestService = (uri: string): Thenable<string> => {
    //For the case when we are multi root and specify a workspace location
    if (hasWorkspaceFolderCapability){
        for (const folder in workspaceFolders){
            const currFolder = workspaceFolders[folder];
            const currFolderUri = currFolder['uri'];
            const currFolderName = currFolder['name'];

            const isUriRegex = new RegExp('^(?:[a-z]+:)?//', 'i');
            if (uri.indexOf(currFolderName) !== -1 && !uri.match(isUriRegex)){
                const beforeFolderName = currFolderUri.split(currFolderName)[0];
                const uriSplit = uri.split(currFolderName);
                uriSplit.shift();
                const afterFolderName = uriSplit.join(currFolderName);
                uri = beforeFolderName + currFolderName + afterFolderName;
            }

        }
    }
    if (Strings.startsWith(uri, 'file://')) {
        const fsPath = URI.parse(uri).fsPath;
        return new Promise<string>((c, e) => {
            fs.readFile(fsPath, 'UTF-8', (err, result) => {
                err ? e('') : c(result.toString());
            });
        });
    } else if (Strings.startsWith(uri, 'vscode://')) {
        return connection.sendRequest(VSCodeContentRequest.type, uri).then(responseText =>
            responseText, error =>
            error.message);
    } else {
        const scheme = URI.parse(uri).scheme.toLowerCase();
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
    const headers = { 'Accept-Encoding': 'gzip, deflate' };
    return xhr({ url: uri, followRedirects: 5, headers }).then(response =>
        response.responseText, (error: XHRResponse) =>
        Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString()));
};

export let KUBERNETES_SCHEMA_URL = 'https://raw.githubusercontent.com/garethr/kubernetes-json-schema/master/v1.14.0-standalone-strict/all.json';
export let KEDGE_SCHEMA_URL = 'https://raw.githubusercontent.com/kedgeproject/json-schema/master/master/kedge-json-schema.json';
export let customLanguageService = getCustomLanguageService(schemaRequestService, workspaceContext, []);
export let jsonLanguageService = getJSONLanguageService({
    schemaRequestService,
    workspaceContext
});

// The settings interface describes the server relevant settings part
interface Settings {
    yaml: {
        format: CustomFormatterOptions;
        schemas: JSONSchemaSettings[];
        validate: boolean;
        hover: boolean;
        completion: boolean;
        customTags: Array<String>;
        schemaStore: {
            enable: boolean
        }
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
let yamlFormatterSettings = {
    singleQuote: false,
    bracketSpacing: true,
    proseWrap: 'preserve',
    printWidth: 80,
    enable: true
} as CustomFormatterOptions;
let yamlShouldHover = true;
let yamlShouldCompletion = true;
let schemaStoreSettings = [];
let customTags = [];
let schemaStoreEnabled = true;

connection.onDidChangeConfiguration(change => {
    const settings = <Settings>change.settings;
    configureHttpRequests(settings.http && settings.http.proxy, settings.http && settings.http.proxyStrictSSL);

    specificValidatorPaths = [];
    if (settings.yaml) {
        yamlConfigurationSettings = settings.yaml.schemas;
        yamlShouldValidate = settings.yaml.validate;
        yamlShouldHover = settings.yaml.hover;
        yamlShouldCompletion = settings.yaml.completion;
        customTags = settings.yaml.customTags ? settings.yaml.customTags : [];
        if (settings.yaml.schemaStore) {
            schemaStoreEnabled = settings.yaml.schemaStore.enable;
        }
        if (settings.yaml.format) {
            yamlFormatterSettings = {
                proseWrap: settings.yaml.format.proseWrap || 'preserve',
                printWidth: settings.yaml.format.printWidth || 80
            };
            if (settings.yaml.format.singleQuote !== undefined) {
                yamlFormatterSettings.singleQuote = settings.yaml.format.singleQuote;
            }
            if (settings.yaml.format.bracketSpacing !== undefined) {
                yamlFormatterSettings.bracketSpacing = settings.yaml.format.bracketSpacing;
            }
            if (settings.yaml.format.enable !== undefined) {
                yamlFormatterSettings.enable = settings.yaml.format.enable;
            }
        }
    }
    schemaConfigurationSettings = [];

    for (const url in yamlConfigurationSettings){
        const globPattern = yamlConfigurationSettings[url];
        const schemaObj = {
            'fileMatch': Array.isArray(globPattern) ? globPattern : [globPattern],
            'url': url
        };
        schemaConfigurationSettings.push(schemaObj);
    }

    setSchemaStoreSettingsIfNotSet();

    updateConfiguration();

    // dynamically enable & disable the formatter
    if (clientDynamicRegisterSupport) {
        const enableFormatter = settings && settings.yaml && settings.yaml.format && settings.yaml.format.enable;
        if (enableFormatter) {
            if (!formatterRegistration) {
                formatterRegistration = connection.client.register(DocumentRangeFormattingRequest.type, { documentSelector: [{ language: 'json' }, { language: 'jsonc' }] });
            }
        } else if (formatterRegistration) {
            formatterRegistration.then(r => r.dispose());
            formatterRegistration = null;
        }
    }
});

/**
 * This function helps set the schema store if it hasn't already been set
 * 	AND the schema store setting is enabled. If the schema store setting
 * 	is not enabled we need to clear the schemas.
 */
function setSchemaStoreSettingsIfNotSet() {
    const schemaStoreIsSet = (schemaStoreSettings.length !== 0);
    if (schemaStoreEnabled && !schemaStoreIsSet) {
        getSchemaStoreMatchingSchemas().then(schemaStore => {
            schemaStoreSettings = schemaStore.schemas;
            updateConfiguration();
        });
    } else if (!schemaStoreEnabled) {
        schemaStoreSettings = [];
        updateConfiguration();
    }
}

function getSchemaStoreMatchingSchemas(){

    return xhr({ url: 'http://schemastore.org/api/json/catalog.json' }).then(response => {

        const languageSettings = {
            schemas: []
        };

        const schemas = JSON.parse(response.responseText);
        for (const schemaIndex in schemas.schemas){

            const schema = schemas.schemas[schemaIndex];
            if (schema && schema.fileMatch){

                for (const fileMatch in schema.fileMatch){
                    const currFileMatch = schema.fileMatch[fileMatch];

                    if (currFileMatch.indexOf('.yml') !== -1 || currFileMatch.indexOf('.yaml') !== -1){
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

connection.onNotification(DynamicCustomSchemaRequestRegistration.type, () => {
    const schemaProvider = (resource => connection.sendRequest(CustomSchemaRequest.type, resource)) as CustomSchemaProvider;
    customLanguageService.registerCustomSchemaProvider(schemaProvider);
});

function updateConfiguration() {
    let languageSettings: LanguageSettings = {
        validate: yamlShouldValidate,
        hover: yamlShouldHover,
        completion: yamlShouldCompletion,
        schemas: [],
        customTags: customTags,
        format: yamlFormatterSettings.enable
    };

    if (schemaAssociations) {
        for (const pattern in schemaAssociations) {
            const association = schemaAssociations[pattern];
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
            jsonLanguageService.configure({
                schemas: [{
                    fileMatch: ['*.yaml', '*.yml'],
                    uri: 'https://raw.githubusercontent.com/garethr/kubernetes-json-schema/master/v1.14.0-standalone-strict/all.json'
                }],
                validate: true
            });
        });
    }
    if (schemaStoreSettings){
        languageSettings.schemas = languageSettings.schemas.concat(schemaStoreSettings);
    }
    customLanguageService.configure(languageSettings);

    // Revalidate any open text documents
    documents.all().forEach(triggerValidation);
}

function configureSchemas(uri, fileMatch, schema, languageSettings){

    if (uri.toLowerCase().trim() === 'kubernetes'){
        uri = KUBERNETES_SCHEMA_URL;
    }
    if (uri.toLowerCase().trim() === 'kedge'){
        uri = KEDGE_SCHEMA_URL;
    }

    if (schema === null){
        languageSettings.schemas.push({ uri, fileMatch: fileMatch });
    }else{
        languageSettings.schemas.push({ uri, fileMatch: fileMatch, schema: schema });
    }

    if (fileMatch.constructor === Array && uri === KUBERNETES_SCHEMA_URL){
        fileMatch.forEach(url => {
            specificValidatorPaths.push(url);
        });
    }else if (uri === KUBERNETES_SCHEMA_URL){
        specificValidatorPaths.push(fileMatch);
    }

    return languageSettings;
}

function setKubernetesParserOption(jsonDocuments, option: boolean){
    for (const jsonDoc in jsonDocuments){
        jsonDocuments[jsonDoc].configureSettings({
            isKubernetes: option
        });
    }
}

function isKubernetes(textDocument){
    for (const path in specificValidatorPaths){
        const globPath = specificValidatorPaths[path];
        const fpa = new FilePatternAssociation(globPath);
        if (fpa.matchesPattern(textDocument.uri)){
            return true;
        }
    }
    return false;
}

documents.onDidChangeContent(change => {
    triggerValidation(change.document);
});

documents.onDidClose(event => {
    cleanPendingValidation(event.document);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

const pendingValidationRequests: { [uri: string]: NodeJS.Timer; } = {};
const validationDelayMs = 200;

function cleanPendingValidation(textDocument: TextDocument): void {
    const request = pendingValidationRequests[textDocument.uri];
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

    if (!textDocument){
        return;
    }

    if (textDocument.getText().length === 0) {
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
        return;
    }

    const yamlDocument = parseYAML2(textDocument.getText(), customTags);
    customLanguageService.doValidation(jsonLanguageService, textDocument, yamlDocument, isKubernetes(textDocument)).then(function (diagnosticResults){

        const diagnostics = [];
        for (const diagnosticItem in diagnosticResults){
            diagnosticResults[diagnosticItem].severity = 1; //Convert all warnings to errors
            diagnostics.push(diagnosticResults[diagnosticItem]);
        }

        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: removeDuplicatesObj(diagnostics) });
    }, function (error){});
}

connection.onDidChangeWatchedFiles(change => {
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
    const textDocument = documents.get(textDocumentPosition.textDocument.uri);

    const result: CompletionList = {
        items: [],
        isIncomplete: false
    };

    if (!textDocument){
        return Promise.resolve(result);
    }

    const completionFix = completionHelper(textDocument, textDocumentPosition.position);
    const newText = completionFix.newText;
    const jsonDocument = parseYAML(newText);
    isKubernetes(textDocument) ? setKubernetesParserOption(jsonDocument.documents, true) : setKubernetesParserOption(jsonDocument.documents, false);
    return customLanguageService.doComplete(textDocument, textDocumentPosition.position, jsonDocument);
});

function is_EOL(c) {
    return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
}

function completionHelper(document: TextDocument, textDocumentPosition: Position){

    //Get the string we are looking at via a substring
    const linePos = textDocumentPosition.line;
    const position = textDocumentPosition;
    const lineOffset = getLineOffsets(document.getText());
    const start = lineOffset[linePos]; //Start of where the autocompletion is happening
    let end = 0; //End of where the autocompletion is happening
    if (lineOffset[linePos + 1]){
        end = lineOffset[linePos + 1];
    }else{
        end = document.getText().length;
    }

    while (end - 1 >= 0 && is_EOL(document.getText().charCodeAt(end - 1))) {
        end--;
    }

    const textLine = document.getText().substring(start, end);

    //Check if the string we are looking at is a node
    if (textLine.indexOf(':') === -1){
        //We need to add the ":" to load the nodes

        let newText = '';

        //This is for the empty line case
        const trimmedText = textLine.trim();
        if (trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === '-')){
            //Add a temp node that is in the document but we don't use at all.
            newText = document.getText().substring(0, start + textLine.length) +
                (trimmedText[0] === '-' && !textLine.endsWith(' ') ? ' ' : '') + 'holder:\r\n' +
                document.getText().substr(lineOffset[linePos + 1] || document.getText().length);

        //For when missing semi colon case
        }else{
            //Add a semicolon to the end of the current line so we can validate the node
            newText = document.getText().substring(0, start + textLine.length) + ':\r\n' + document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
        }

        return {
            'newText': newText,
            'newPosition': textDocumentPosition
        };

    }else{

        //All the nodes are loaded
        position.character = position.character - 1;
        return {
            'newText': document.getText(),
            'newPosition': position
        };
    }

}

connection.onCompletionResolve(completionItem => customLanguageService.doResolve(completionItem));

connection.onHover(textDocumentPositionParams => {
    const document = documents.get(textDocumentPositionParams.textDocument.uri);

    if (!document){
        return Promise.resolve(void 0);
    }

    const jsonDocument = parseYAML2(document.getText());
    return customLanguageService.doHover(jsonLanguageService, document, textDocumentPositionParams.position, jsonDocument);
});

connection.onDocumentSymbol(documentSymbolParams => {
    const document = documents.get(documentSymbolParams.textDocument.uri);

    if (!document){
        return;
    }

    const jsonDocument = parseYAML2(document.getText());
    if (hierarchicalDocumentSymbolSupport) {
        return customLanguageService.findDocumentSymbols2(jsonLanguageService, document, jsonDocument);
    } else {
        return customLanguageService.findDocumentSymbols(jsonLanguageService, document, jsonDocument);
    }

});

connection.onDocumentFormatting(formatParams => {
    const document = documents.get(formatParams.textDocument.uri);

    if (!document){
        return;
    }

    const customFormatterSettings = {
        tabWidth: formatParams.options.tabSize,
        ...yamlFormatterSettings
    };

    return customLanguageService.doFormat(document, customFormatterSettings);
});

connection.listen();
