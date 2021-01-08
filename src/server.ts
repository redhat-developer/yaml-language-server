/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
  createConnection,
  IConnection,
  TextDocuments,
  TextDocument,
  InitializeParams,
  InitializeResult,
  Disposable,
  ProposedFeatures,
  CompletionList,
  ClientCapabilities,
  WorkspaceFolder,
  DocumentFormattingRequest,
} from 'vscode-languageserver';

import { xhr, configure as configureHttpRequests } from 'request-light';
import * as URL from 'url';
import { removeDuplicatesObj } from './languageservice/utils/arrUtils';
import {
  getLanguageService as getCustomLanguageService,
  LanguageSettings,
  CustomFormatterOptions,
  WorkspaceContextService,
  SchemaConfiguration,
  SchemaPriority,
  LanguageService,
} from './languageservice/yamlLanguageService';
import * as nls from 'vscode-nls';
import {
  CustomSchemaProvider,
  FilePatternAssociation,
  SchemaDeletions,
  SchemaAdditions,
  MODIFICATION_ACTIONS,
} from './languageservice/services/yamlSchemaService';
import { JSONSchema } from './languageservice/jsonSchema';
import {
  SchemaAssociationNotification,
  DynamicCustomSchemaRequestRegistration,
  CustomSchemaRequest,
  SchemaModificationNotification,
  ISchemaAssociations,
  VSCodeContentRequestRegistration,
} from './requestTypes';
import { isRelativePath, relativeToAbsolutePath, workspaceFoldersChanged } from './languageservice/utils/paths';
import { URI } from 'vscode-uri';
import { KUBERNETES_SCHEMA_URL, JSON_SCHEMASTORE_URL } from './languageservice/utils/schemaUrls';
import { schemaRequestHandler } from './languageservice/services/schemaRequestHandler';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
nls.config(process.env['VSCODE_NLS_CONFIG'] as any);

/* eslint-disable @typescript-eslint/no-use-before-define */

/**************************
 * Generic helper functions
 **************************/
const workspaceContext: WorkspaceContextService = {
  resolveRelativePath: (relativePath: string, resource: string) => {
    return URL.resolve(resource, relativePath);
  },
};

/********************
 * Helper interfaces
 ********************/
// Client settings interface to grab settings relevant for the language server
interface Settings {
  yaml: {
    format: CustomFormatterOptions;
    schemas: JSONSchemaSettings[];
    validate: boolean;
    hover: boolean;
    completion: boolean;
    customTags: Array<string>;
    schemaStore: {
      enable: boolean;
    };
  };
  http: {
    proxy: string;
    proxyStrictSSL: boolean;
  };
  editor: {
    tabSize: number;
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
let yamlConfigurationSettings: JSONSchemaSettings[] = undefined;
let schemaAssociations: ISchemaAssociations | SchemaConfiguration[] | undefined = undefined;
let formatterRegistration: Thenable<Disposable> = null;
let specificValidatorPaths = [];
let schemaConfigurationSettings = [];
let yamlShouldValidate = true;
let yamlFormatterSettings = {
  singleQuote: false,
  bracketSpacing: true,
  proseWrap: 'preserve',
  printWidth: 80,
  enable: true,
} as CustomFormatterOptions;
let yamlShouldHover = true;
let yamlShouldCompletion = true;
let schemaStoreSettings = [];
let customTags = [];
let schemaStoreEnabled = true;
let indentation: string | undefined = undefined;

// File validation helpers
const pendingValidationRequests: { [uri: string]: NodeJS.Timer } = {};
const validationDelayMs = 200;

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents: TextDocuments = new TextDocuments();

// Language client configuration
let capabilities: ClientCapabilities;
let workspaceRoot: URI = null;
let workspaceFolders: WorkspaceFolder[] = [];
let clientFormatterDynamicRegisterSupport = false;
let hierarchicalDocumentSymbolSupport = false;
let hasWorkspaceFolderCapability = false;
let useVSCodeContentRequest = false;

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
function setSchemaStoreSettingsIfNotSet(): void {
  const schemaStoreIsSet = schemaStoreSettings.length !== 0;

  if (schemaStoreEnabled && !schemaStoreIsSet) {
    getSchemaStoreMatchingSchemas()
      .then((schemaStore) => {
        schemaStoreSettings = schemaStore.schemas;
        updateConfiguration();
      })
      .catch(() => {
        // ignore
      });
  } else if (!schemaStoreEnabled) {
    schemaStoreSettings = [];
    updateConfiguration();
  }
}

/**
 * When the schema store is enabled, download and store YAML schema associations
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSchemaStoreMatchingSchemas(): Promise<{ schemas: any[] }> {
  return xhr({ url: JSON_SCHEMASTORE_URL }).then((response) => {
    const languageSettings = {
      schemas: [],
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
            languageSettings.schemas.push({
              uri: schema.url,
              fileMatch: [currFileMatch],
              priority: SchemaPriority.SchemaStore,
            });
          }
        }
      }
    }

    return languageSettings;
  });
}

/**
 * Called when server settings or schema associations are changed
 * Re-creates schema associations and re-validates any open YAML files
 */
function updateConfiguration(): void {
  let languageSettings: LanguageSettings = {
    validate: yamlShouldValidate,
    hover: yamlShouldHover,
    completion: yamlShouldCompletion,
    schemas: [],
    customTags: customTags,
    format: yamlFormatterSettings.enable,
    indentation: indentation,
  };

  if (schemaAssociations) {
    if (Array.isArray(schemaAssociations)) {
      Array.prototype.push.apply(languageSettings.schemas, schemaAssociations);
    } else {
      for (const pattern in schemaAssociations) {
        const association = schemaAssociations[pattern];
        if (Array.isArray(association)) {
          association.forEach((uri) => {
            languageSettings = configureSchemas(uri, [pattern], null, languageSettings, SchemaPriority.SchemaAssociation);
          });
        }
      }
    }
  }

  if (schemaConfigurationSettings) {
    schemaConfigurationSettings.forEach((schema) => {
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

        languageSettings = configureSchemas(uri, schema.fileMatch, schema.schema, languageSettings, SchemaPriority.Settings);
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function configureSchemas(
  uri: string,
  fileMatch: string[],
  schema: unknown,
  languageSettings: LanguageSettings,
  priorityLevel: number
): LanguageSettings {
  uri = checkSchemaURI(uri);

  if (schema === null) {
    languageSettings.schemas.push({ uri, fileMatch: fileMatch, priority: priorityLevel });
  } else {
    languageSettings.schemas.push({ uri, fileMatch: fileMatch, schema: schema, priority: priorityLevel });
  }

  if (fileMatch.constructor === Array && uri === KUBERNETES_SCHEMA_URL) {
    fileMatch.forEach((url) => {
      specificValidatorPaths.push(url);
    });
  } else if (uri === KUBERNETES_SCHEMA_URL) {
    specificValidatorPaths.push(fileMatch);
  }

  return languageSettings;
}

function isKubernetes(textDocument: TextDocument): boolean {
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

  customLanguageService.doValidation(textDocument, isKubernetes(textDocument)).then(
    function (diagnosticResults) {
      const diagnostics = [];
      for (const diagnosticItem in diagnosticResults) {
        diagnosticResults[diagnosticItem].severity = 1; //Convert all warnings to errors
        diagnostics.push(diagnosticResults[diagnosticItem]);
      }

      connection.sendDiagnostics({
        uri: textDocument.uri,
        diagnostics: removeDuplicatesObj(diagnostics),
      });
    },
    function () {
      // ignore
    }
  );
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

/**
 * Handles schema content requests given the schema URI
 * @param uri can be a local file, vscode request, http(s) request or a custom request
 */
const schemaRequestHandlerWrapper = (connection: IConnection, uri: string): Promise<string> => {
  return schemaRequestHandler(connection, uri, workspaceFolders, workspaceRoot, useVSCodeContentRequest);
};

const schemaRequestService = schemaRequestHandlerWrapper.bind(this, connection);

let customLanguageService = getCustomLanguageService(schemaRequestService, workspaceContext, ClientCapabilities.LATEST);

/***********************
 * Connection listeners
 **********************/

/**
 * Run when the client connects to the server after it is activated.
 * The server receives the root path(s) of the workspace and the client capabilities.
 */
connection.onInitialize(
  (params: InitializeParams): InitializeResult => {
    capabilities = params.capabilities;

    customLanguageService = getCustomLanguageService(schemaRequestService, workspaceContext, capabilities);

    // Only try to parse the workspace root if its not null. Otherwise initialize will fail
    if (params.rootUri) {
      workspaceRoot = URI.parse(params.rootUri);
    }
    workspaceFolders = params.workspaceFolders || [];

    hierarchicalDocumentSymbolSupport = !!(
      capabilities.textDocument &&
      capabilities.textDocument.documentSymbol &&
      capabilities.textDocument.documentSymbol.hierarchicalDocumentSymbolSupport
    );
    clientFormatterDynamicRegisterSupport = !!(
      capabilities.textDocument &&
      capabilities.textDocument.rangeFormatting &&
      capabilities.textDocument.rangeFormatting.dynamicRegistration
    );
    hasWorkspaceFolderCapability = capabilities.workspace && !!capabilities.workspace.workspaceFolders;
    return {
      capabilities: {
        textDocumentSync: documents.syncKind,
        completionProvider: { resolveProvider: false },
        hoverProvider: true,
        documentSymbolProvider: true,
        documentFormattingProvider: false,
        documentRangeFormattingProvider: false,
        documentLinkProvider: {},
        foldingRangeProvider: true,
        workspace: {
          workspaceFolders: {
            changeNotifications: true,
            supported: true,
          },
        },
      },
    };
  }
);

connection.onInitialized(() => {
  if (hasWorkspaceFolderCapability && clientFormatterDynamicRegisterSupport) {
    connection.workspace.onDidChangeWorkspaceFolders((changedFolders) => {
      workspaceFolders = workspaceFoldersChanged(workspaceFolders, changedFolders);
    });
  }
});

/**
 * Received a notification from the client with schema associations from other extensions
 * Update the associations in the server
 */
connection.onNotification(SchemaAssociationNotification.type, (associations) => {
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
  const schemaProvider = ((resource) => {
    return connection.sendRequest(CustomSchemaRequest.type, resource);
  }) as CustomSchemaProvider;
  customLanguageService.registerCustomSchemaProvider(schemaProvider);
});

/**
 * Received a notification from the client that it can accept content requests
 * This means that the server sends schemas back to the client side to get resolved rather
 * than resolving them on the extension side
 */
connection.onNotification(VSCodeContentRequestRegistration.type, () => {
  useVSCodeContentRequest = true;
});

/**
 * Run when the editor configuration is changed
 * The client syncs the 'yaml', 'http.proxy', 'http.proxyStrictSSL' settings sections
 * Update relevant settings with fallback to defaults if needed
 */
connection.onDidChangeConfiguration((change) => {
  const settings = change.settings as Settings;
  configureHttpRequests(settings.http && settings.http.proxy, settings.http && settings.http.proxyStrictSSL);

  specificValidatorPaths = [];
  if (settings.yaml) {
    if (Object.prototype.hasOwnProperty.call(settings.yaml, 'schemas')) {
      yamlConfigurationSettings = settings.yaml.schemas;
    }
    if (Object.prototype.hasOwnProperty.call(settings.yaml, 'validate')) {
      yamlShouldValidate = settings.yaml.validate;
    }
    if (Object.prototype.hasOwnProperty.call(settings.yaml, 'hover')) {
      yamlShouldHover = settings.yaml.hover;
    }
    if (Object.prototype.hasOwnProperty.call(settings.yaml, 'completion')) {
      yamlShouldCompletion = settings.yaml.completion;
    }
    customTags = settings.yaml.customTags ? settings.yaml.customTags : [];

    if (settings.yaml.schemaStore) {
      schemaStoreEnabled = settings.yaml.schemaStore.enable;
    }

    if (settings.yaml.format) {
      yamlFormatterSettings = {
        proseWrap: settings.yaml.format.proseWrap || 'preserve',
        printWidth: settings.yaml.format.printWidth || 80,
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

  if (settings['[yaml]'] && settings['[yaml]']['editor.tabSize']) {
    indentation = ' '.repeat(settings['[yaml]']['editor.tabSize']);
  } else if (settings.editor?.tabSize) {
    indentation = ' '.repeat(settings.editor.tabSize);
  }

  for (const uri in yamlConfigurationSettings) {
    const globPattern = yamlConfigurationSettings[uri];

    const schemaObj = {
      fileMatch: Array.isArray(globPattern) ? globPattern : [globPattern],
      uri: checkSchemaURI(uri),
    };
    schemaConfigurationSettings.push(schemaObj);
  }

  setSchemaStoreSettingsIfNotSet();
  updateConfiguration();

  // dynamically enable & disable the formatter
  if (clientFormatterDynamicRegisterSupport) {
    const enableFormatter = settings && settings.yaml && settings.yaml.format && settings.yaml.format.enable;

    if (enableFormatter) {
      if (!formatterRegistration) {
        formatterRegistration = connection.client.register(DocumentFormattingRequest.type, {
          documentSelector: [{ language: 'yaml' }],
        });
      }
    } else if (formatterRegistration) {
      formatterRegistration.then((r) => {
        return r.dispose();
      });
      formatterRegistration = null;
    }
  }
});

documents.onDidChangeContent((change) => {
  triggerValidation(change.document);
});

documents.onDidClose((event) => {
  cleanPendingValidation(event.document);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

/**
 * Called when a monitored file is changed in an editor
 * Re-validates the entire document
 */
connection.onDidChangeWatchedFiles((change) => {
  let hasChanges = false;

  change.changes.forEach((c) => {
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
connection.onCompletion((textDocumentPosition) => {
  const textDocument = documents.get(textDocumentPosition.textDocument.uri);

  const result: CompletionList = {
    items: [],
    isIncomplete: false,
  };

  if (!textDocument) {
    return Promise.resolve(result);
  }
  return customLanguageService.doComplete(textDocument, textDocumentPosition.position, isKubernetes(textDocument));
});

/**
 * Called when the user hovers with their mouse over a keyword
 * Returns an informational tooltip
 */
connection.onHover((textDocumentPositionParams) => {
  const document = documents.get(textDocumentPositionParams.textDocument.uri);

  if (!document) {
    return Promise.resolve(undefined);
  }

  return customLanguageService.doHover(document, textDocumentPositionParams.position);
});

/**
 * Called when the code outline in an editor needs to be populated
 * Returns a list of symbols that is then shown in the code outline
 */
connection.onDocumentSymbol((documentSymbolParams) => {
  const document = documents.get(documentSymbolParams.textDocument.uri);

  if (!document) {
    return;
  }

  if (hierarchicalDocumentSymbolSupport) {
    return customLanguageService.findDocumentSymbols2(document);
  } else {
    return customLanguageService.findDocumentSymbols(document);
  }
});

/**
 * Called when the formatter is invoked
 * Returns the formatted document content using prettier
 */
connection.onDocumentFormatting((formatParams) => {
  const document = documents.get(formatParams.textDocument.uri);

  if (!document) {
    return;
  }

  const customFormatterSettings = {
    tabWidth: formatParams.options.tabSize,
    ...yamlFormatterSettings,
  };

  return customLanguageService.doFormat(document, customFormatterSettings);
});

connection.onDocumentLinks((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return Promise.resolve([]);
  }

  return customLanguageService.findLinks(document);
});

connection.onRequest(SchemaModificationNotification.type, (modifications: SchemaAdditions | SchemaDeletions) => {
  if (modifications.action === MODIFICATION_ACTIONS.add) {
    customLanguageService.modifySchemaContent(modifications);
  } else if (modifications.action === MODIFICATION_ACTIONS.delete) {
    customLanguageService.deleteSchemaContent(modifications);
  }
  return Promise.resolve();
});

connection.onFoldingRanges((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return Promise.resolve(undefined);
  }
  return customLanguageService.getFoldingRanges(document, capabilities.textDocument?.foldingRange);
});

// Start listening for any messages from the client
connection.listen();
