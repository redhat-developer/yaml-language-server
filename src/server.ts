/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
    createConnection, IConnection, TextDocuments, TextDocument, InitializeParams, InitializeResult,
    Disposable, Position, ProposedFeatures, CompletionList, DocumentRangeFormattingRequest, ClientCapabilities, WorkspaceFolder
} from 'vscode-languageserver';

import { xhr, XHRResponse, configure as configureHttpRequests } from 'request-light';
import * as URL from 'url';
import { getLineOffsets, removeDuplicatesObj } from './languageservice/utils/arrUtils';
import { getLanguageService as getCustomLanguageService, LanguageSettings, CustomFormatterOptions, WorkspaceContextService } from './languageservice/yamlLanguageService';
import * as nls from 'vscode-nls';
import { CustomSchemaProvider, FilePatternAssociation } from './languageservice/services/jsonSchemaService';
import { parse as parseYAML } from './languageservice/parser/yamlParser04';
import { parse as parseYAML2 } from './languageservice/parser/yamlParser07';
import { JSONSchema } from './languageservice/jsonSchema04';
import { SchemaAssociationNotification, DynamicCustomSchemaRequestRegistration, CustomSchemaRequest } from './requestTypes';
import { schemaRequestHandler } from './languageservice/services/schemaRequestHandler';
import { isRelativePath, relativeToAbsolutePath } from './languageservice/utils/paths';
import { URI } from 'vscode-uri';
// tslint:disable-next-line: no-any
nls.config(process.env['VSCODE_NLS_CONFIG'] as any);

/****************
 * Constants
 ****************/
const KUBERNETES_SCHEMA_URL = 'https://raw.githubusercontent.com/garethr/kubernetes-json-schema/master/v1.14.0-standalone-strict/all.json';
const JSON_SCHEMASTORE_URL = 'http://schemastore.org/api/json/catalog.json';

/**************************
 * Generic helper functions
 **************************/
const workspaceContext: WorkspaceContextService = {
    resolveRelativePath: (relativePath: string, resource: string) =>
        URL.resolve(resource, relativePath)
};

function is_EOL(c: number) {
    return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
}

/********************
 * Helper interfaces
 ********************/
interface ISchemaAssociations {
    [pattern: string]: string[];
}

// Client settings interface to grab settings relevant for the language server
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

/****************
 * Variables
 ****************/

// Language server configuration
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

// File validation helpers
const pendingValidationRequests: { [uri: string]: NodeJS.Timer; } = { };
const validationDelayMs = 200;

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents: TextDocuments = new TextDocuments();

// Language client configuration
let capabilities: ClientCapabilities;
let workspaceRoot: URI = null;
let workspaceFolders: WorkspaceFolder[] = [];
let clientDynamicRegisterSupport = false;
let hierarchicalDocumentSymbolSupport = false;

/****************************
 * Reusable helper functions
 ****************************/

const checkSchemaURI = (uri: string): string => {
    if (uri.trim().toLowerCase() === 'kubernetes') {
        return KUBERNETES_SCHEMA_URL;
    } else if (isRelativePath(uri)) {
        return relativeToAbsolutePath(workspaceFolders, workspaceRoot, uri);
    } else {
        return uri;
    }
};

/**
 * This function helps set the schema store if it hasn't already been set
 * AND the schema store setting is enabled. If the schema store setting
 * is not enabled we need to clear the schemas.
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

/**
 * When the schema store is enabled, download and store YAML schema associations
 */
function getSchemaStoreMatchingSchemas() {
    return xhr({ url: JSON_SCHEMASTORE_URL }).then(response => {
        const languageSettings = {
            schemas: []
        };

        // Parse the schema store catalog as JSON
        const schemas = JSON.parse(response.responseText);

        for (const schemaIndex in schemas.schemas) {
            const schema = schemas.schemas[schemaIndex];

            if (schema && schema.fileMatch) {
                for (const fileMatch in schema.fileMatch) {
                    const currFileMatch = schema.fileMatch[fileMatch];
                    // If the schema is for files with a YAML extension, save the schema association
                    if (currFileMatch.indexOf('.yml') !== -1 || currFileMatch.indexOf('.yaml') !== -1) {
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

/**
 * Called when server settings or schema associations are changed
 * Re-creates schema associations and revalidates any open YAML files
 */
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
            let uri = schema.uri;
            if (!uri && schema.schema) {
                uri = schema.schema.id;
            }
            if (!uri && schema.fileMatch) {
                uri = 'vscode://schemas/custom/' + encodeURIComponent(schema.fileMatch.join('&'));
            }
            if (uri) {
                if (isRelativePath(uri)) {
                    uri = relativeToAbsolutePath(workspaceFolders, workspaceRoot, uri);
                }

                languageSettings = configureSchemas(uri, schema.fileMatch, schema.schema, languageSettings);
            }
        });
    }

    if (schemaStoreSettings) {
        languageSettings.schemas = languageSettings.schemas.concat(schemaStoreSettings);
    }

    customLanguageService.configure(languageSettings);

    // Revalidate any open text documents
    documents.all().forEach(triggerValidation);
}

/**
 * Stores schema associations in server settings, handling kubernetes
 * @param uri string path to schema (whether local or online)
 * @param fileMatch file pattern to apply the schema to
 * @param schema schema id
 * @param languageSettings current server settings
 */
function configureSchemas(uri: string, fileMatch: string[], schema: any, languageSettings: LanguageSettings) {
    uri = checkSchemaURI(uri);

    if (schema === null) {
        languageSettings.schemas.push({ uri, fileMatch: fileMatch });
    } else {
        languageSettings.schemas.push({ uri, fileMatch: fileMatch, schema: schema });
    }

    if (fileMatch.constructor === Array && uri === KUBERNETES_SCHEMA_URL) {
        fileMatch.forEach(url => {
            specificValidatorPaths.push(url);
        });
    } else if (uri === KUBERNETES_SCHEMA_URL) {
        specificValidatorPaths.push(fileMatch);
    }

    return languageSettings;
}

function isKubernetes(textDocument: TextDocument) {
    for (const path in specificValidatorPaths) {
        const globPath = specificValidatorPaths[path];
        const fpa = new FilePatternAssociation(globPath);

        if (fpa.matchesPattern(textDocument.uri)) {
            return true;
        }
    }
    return false;
}

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
    if (!textDocument) {
        return;
    }

    if (textDocument.getText().length === 0) {
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
        return;
    }

    const yamlDocument = parseYAML2(textDocument.getText(), customTags);
    customLanguageService.doValidation(textDocument, yamlDocument, isKubernetes(textDocument))
                         .then(function (diagnosticResults) {
        const diagnostics = [];
        for (const diagnosticItem in diagnosticResults) {
            diagnosticResults[diagnosticItem].severity = 1; //Convert all warnings to errors
            diagnostics.push(diagnosticResults[diagnosticItem]);
        }

        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: removeDuplicatesObj(diagnostics) });
    }, function (error) { });
}

/*************
 * Main setup
 *************/

// Create a connection for the server.
let connection: IConnection = null;

if (process.argv.indexOf('--stdio') === -1) {
    connection = createConnection(ProposedFeatures.all);
} else {
    connection = createConnection();
}

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

const schemaRequestService = schemaRequestHandler.bind(this, connection);

export const customLanguageService = getCustomLanguageService(schemaRequestService, workspaceContext, []);

/***********************
 * Connection listeners
 **********************/

/**
 * Run when the client connects to the server after it is activated.
 * The server receives the root path(s) of the workspace and the client capabilities.
 */
connection.onInitialize((params: InitializeParams): InitializeResult => {
    capabilities = params.capabilities;
    workspaceRoot = URI.parse(params.rootUri);
    workspaceFolders = params.workspaceFolders;
    hierarchicalDocumentSymbolSupport = !!capabilities.textDocument.documentSymbol.hierarchicalDocumentSymbolSupport;
    clientDynamicRegisterSupport = !!capabilities.workspace.symbol.dynamicRegistration;

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

/**
 * Received a notification from the client with schema associations from other extensions
 * Update the associations in the server
 */
connection.onNotification(SchemaAssociationNotification.type, associations => {
    schemaAssociations = associations;
    specificValidatorPaths = [];
    setSchemaStoreSettingsIfNotSet();
    updateConfiguration();
});

/**
 * Received a notification from the client that it can accept custom schema requests
 * Register the custom schema provider and use it for requests of unknown scheme
 */
connection.onNotification(DynamicCustomSchemaRequestRegistration.type, () => {
    const schemaProvider = (resource => connection.sendRequest(CustomSchemaRequest.type, resource)) as CustomSchemaProvider;
    customLanguageService.registerCustomSchemaProvider(schemaProvider);
});

/**
 * Run when the editor configuration is changed
 * The client syncs the 'yaml', 'http.proxy', 'http.proxyStrictSSL' settings sections
 * Update relevant settings with fallback to defaults if needed
 */
connection.onDidChangeConfiguration(change => {
    const settings = change.settings as Settings;
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

    for (const uri in yamlConfigurationSettings) {
        const globPattern = yamlConfigurationSettings[uri];

        const schemaObj = {
            'fileMatch': Array.isArray(globPattern) ? globPattern : [globPattern],
            'uri': checkSchemaURI(uri)
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
                formatterRegistration = connection.client.register(DocumentRangeFormattingRequest.type, { documentSelector: [{ language: 'yaml' }] });
            }
        } else if (formatterRegistration) {
            formatterRegistration.then(r => r.dispose());
            formatterRegistration = null;
        }
    }
});

documents.onDidChangeContent(change => {
    triggerValidation(change.document);
});

documents.onDidClose(event => {
    cleanPendingValidation(event.document);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

/**
 * Called when a monitored file is changed in an editor
 * Revalidates the entire document
 */
connection.onDidChangeWatchedFiles(change => {
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

/**
 * Called when auto-complete is triggered in an editor
 * Returns a list of valid completion items
 */
connection.onCompletion(textDocumentPosition => {
    const textDocument = documents.get(textDocumentPosition.textDocument.uri);

    const result: CompletionList = {
        items: [],
        isIncomplete: false
    };

    if (!textDocument) {
        return Promise.resolve(result);
    }

    const completionFix = completionHelper(textDocument, textDocumentPosition.position);
    const newText = completionFix.newText;
    const jsonDocument = parseYAML(newText);
    setKubernetesParserOption(jsonDocument.documents, isKubernetes(textDocument));
    return customLanguageService.doComplete(textDocument, textDocumentPosition.position, jsonDocument);
});

/**
 * Called by onCompletion
 * Corrects simple syntax mistakes to load possible nodes even if a semicolon is missing
 */
function completionHelper(document: TextDocument, textDocumentPosition: Position) {
    // Get the string we are looking at via a substring
    const linePos = textDocumentPosition.line;
    const position = textDocumentPosition;
    const lineOffset = getLineOffsets(document.getText());
    const start = lineOffset[linePos]; // Start of where the autocompletion is happening
    let end = 0; // End of where the autocompletion is happening

    if (lineOffset[linePos + 1]) {
        end = lineOffset[linePos + 1];
    } else {
        end = document.getText().length;
    }

    while (end - 1 >= 0 && is_EOL(document.getText().charCodeAt(end - 1))) {
        end--;
    }

    const textLine = document.getText().substring(start, end);

    // Check if the string we are looking at is a node
    if (textLine.indexOf(':') === -1) {
        // We need to add the ":" to load the nodes
        let newText = '';

        // This is for the empty line case
        const trimmedText = textLine.trim();
        if (trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === '-')) {
            // Add a temp node that is in the document but we don't use at all.
            newText = document.getText().substring(0, start + textLine.length) +
                (trimmedText[0] === '-' && !textLine.endsWith(' ') ? ' ' : '') + 'holder:\r\n' +
                document.getText().substr(lineOffset[linePos + 1] || document.getText().length);

        // For when missing semi colon case
        } else {
            // Add a semicolon to the end of the current line so we can validate the node
            newText = document.getText().substring(0, start + textLine.length) + ':\r\n' + document.getText().substr(lineOffset[linePos + 1] || document.getText().length);
        }

        return {
            'newText': newText,
            'newPosition': textDocumentPosition
        };
    } else {
        // All the nodes are loaded
        position.character = position.character - 1;

        return {
            'newText': document.getText(),
            'newPosition': position
        };
    }
}

// Called by onCompletion
function setKubernetesParserOption(jsonDocuments: any, option: boolean) {
    for (const jsonDoc in jsonDocuments) {
        jsonDocuments[jsonDoc].configureSettings({
            isKubernetes: option
        });
    }
}

/**
 * Like onCompletion, but called only for currently selected completion item
 * Provides additional information about the item, not just the keyword
 */
connection.onCompletionResolve(completionItem => customLanguageService.doResolve(completionItem));

/**
 * Called when the user hovers with their mouse over a keyword
 * Returns an informational tooltip
 */
connection.onHover(textDocumentPositionParams => {
    const document = documents.get(textDocumentPositionParams.textDocument.uri);

    if (!document) {
        return Promise.resolve(void 0);
    }

    const jsonDocument = parseYAML2(document.getText());
    return customLanguageService.doHover(document, textDocumentPositionParams.position, jsonDocument);
});

/**
 * Called when the code outline in an editor needs to be populated
 * Returns a list of symbols that is then shown in the code outline
 */
connection.onDocumentSymbol(documentSymbolParams => {
    const document = documents.get(documentSymbolParams.textDocument.uri);

    if (!document) {
        return;
    }

    const jsonDocument = parseYAML2(document.getText());
    if (hierarchicalDocumentSymbolSupport) {
        return customLanguageService.findDocumentSymbols2(document, jsonDocument);
    } else {
        return customLanguageService.findDocumentSymbols(document, jsonDocument);
    }

});

/**
 * Called when the formatter is invoked
 * Returns the formatted document content using prettier
 */
connection.onDocumentFormatting(formatParams => {
    const document = documents.get(formatParams.textDocument.uri);

    if (!document) {
        return;
    }

    const customFormatterSettings = {
        tabWidth: formatParams.options.tabSize,
        ...yamlFormatterSettings
    };

    return customLanguageService.doFormat(document, customFormatterSettings);
});

// Start listening for any messages from the client
connection.listen();
