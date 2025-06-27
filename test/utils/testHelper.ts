/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createConnection, Connection, ClientCapabilities as LSPClientCapabilities } from 'vscode-languageserver/node';
import path = require('path');
import { promises as fs } from 'fs';
import { SettingsState } from '../../src/yamlSettings';
import { FileSystem, schemaRequestHandler, workspaceContext } from '../../src/languageservice/services/schemaRequestHandler';
import { YAMLServerInit } from '../../src/yamlServerInit';
import { LanguageService, LanguageSettings } from '../../src';
import { ValidationHandler } from '../../src/languageserver/handlers/validationHandlers';
import { LanguageHandlers } from '../../src/languageserver/handlers/languageHandlers';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClientCapabilities } from 'vscode-json-languageservice';
import { yamlDocumentsCache } from '../../src/languageservice/parser/yaml-documents';
import { TestTelemetry } from './testsTypes';
import { JSONSchema } from '../../src/languageservice/jsonSchema';

export function toFsPath(str: unknown): string {
  if (typeof str !== 'string') {
    throw new TypeError(`Expected a string, got ${typeof str}`);
  }

  let pathName;
  pathName = path.resolve(str);
  pathName = pathName.replace(/\\/g, '/');
  // Windows drive letter must be prefixed with a slash
  if (pathName[0] !== '/') {
    pathName = `/${pathName}`;
  }
  return encodeURI(`file://${pathName}`).replace(/[?#]/g, encodeURIComponent);
}

export const TEST_URI = 'file://~/Desktop/vscode-k8s/test.yaml';
export const SCHEMA_ID = 'default_schema_id.yaml';

export function setupTextDocument(content: string): TextDocument {
  yamlDocumentsCache.clear(); // clear cache
  return TextDocument.create(TEST_URI, 'yaml', 0, content);
}

export function setupSchemaIDTextDocument(content: string, customSchemaID?: string): TextDocument {
  yamlDocumentsCache.clear(); // clear cache
  if (customSchemaID) {
    return TextDocument.create(customSchemaID, 'yaml', 0, content);
  } else {
    return TextDocument.create(SCHEMA_ID, 'yaml', 0, content);
  }
}

export const testFileSystem: FileSystem = { readFile: (fsPath: string) => fs.readFile(fsPath).then((c) => c.toString()) };

export interface TestLanguageServerSetup {
  languageService: LanguageService;
  validationHandler: ValidationHandler;
  languageHandler: LanguageHandlers;
  yamlSettings: SettingsState;
  telemetry: TestTelemetry;
  schemaProvider: TestCustomSchemaProvider;
}

export function setupLanguageService(languageSettings: LanguageSettings): TestLanguageServerSetup {
  const yamlSettings = new SettingsState();
  process.argv.push('--node-ipc');
  const connection = createConnection();
  const schemaRequestHandlerWrapper = (connection: Connection, uri: string): Promise<string> => {
    const testSchemaProvider = TestCustomSchemaProvider.instance();
    const testSchema = testSchemaProvider.getContentForSchema(uri);
    if (testSchema) {
      return Promise.resolve(testSchema);
    }
    return schemaRequestHandler(
      connection,
      uri,
      yamlSettings.workspaceFolders,
      yamlSettings.workspaceRoot,
      yamlSettings.useVSCodeContentRequest,
      testFileSystem
    );
  };
  const schemaRequestService = schemaRequestHandlerWrapper.bind(this, connection);
  const telemetry = new TestTelemetry(connection);
  const serverInit = new YAMLServerInit(connection, yamlSettings, workspaceContext, schemaRequestService, telemetry);
  const __dirname = path.resolve(path.dirname(__filename), '..');
  serverInit.connectionInitialized({
    processId: null,
    capabilities: ClientCapabilities.LATEST as LSPClientCapabilities,
    rootUri: null,
    workspaceFolders: null,
    initializationOptions: {
      l10nPath: path.join(__dirname, '../l10n'),
    },
    locale: 'en',
  });
  const languageService = serverInit.languageService;
  const validationHandler = serverInit.validationHandler;
  const languageHandler = serverInit.languageHandler;
  languageService.configure(languageSettings);
  const schemaProvider = TestCustomSchemaProvider.instance();
  languageService.registerCustomSchemaProvider(schemaItSelfCustomSchemaProvider);
  return {
    languageService,
    validationHandler,
    languageHandler,
    yamlSettings,
    telemetry,
    schemaProvider,
  };
}

/**
 * Derives the absolute `position` of the caret given `content` containing a virtual caret.
 * @param content The content of the document.
 * The caret is located in the content using `|` bookends.
 * For example, `content = 'ab|c|d'` places the caret over the `'c'`, at `position = 2`
 * @returns The absolute position of the caret.
 */
export function caretPosition(content: string): { position: number; content: string } {
  // console.log(`was: len: ${content.length}, content: "${content}", str: "${content.substring(position)}"`);

  // Find bookends `|.|` in content
  const position = content.search(/\|[^]\|/); // | -> any char including newline -> |
  if (position === -1) throw new Error('Error in test case: no caret found in content');

  // Elide bookends from content
  content = content.substring(0, position) + content.substring(position + 1, position + 2) + content.substring(position + 3);

  // console.log(`now: len: ${content.length}, content: "${content}", pos: ${position}, str: "${content.substring(position)}"`);
  return { position, content };
}

/*
 * A class that provides custom schemas for testing purposes.
 */
export class TestCustomSchemaProvider {
  private schemas: Array<[string, string, JSONSchema]> = new Array(0);
  private static self: TestCustomSchemaProvider;

  private constructor() {
    // use instance only
  }

  public static instance(): TestCustomSchemaProvider {
    if (!TestCustomSchemaProvider.self) {
      TestCustomSchemaProvider.self = new TestCustomSchemaProvider();
    }
    return TestCustomSchemaProvider.self;
  }

  /**
   * Adds a schema to the list of custom schemas.
   * @param doc The uri of the document
   * @param schema The JSON schema object.
   */
  public addSchema(doc: string, schema: JSONSchema): void {
    this.addSchemaWithUri(doc, `file:///${doc}`, schema);
  }

  /**
   * Adds a schema to the list of custom schemas.
   * @param doc The uri of the document
   * @param uri The uri of the schema
   * @param schema The JSON schema object.
   */
  public addSchemaWithUri(doc: string, uri: string, schema: JSONSchema): void {
    const item: [string, string, JSONSchema] = [doc, uri, schema];
    this.schemas.push(item);
  }

  /**
   * Deletes a schema from the list of custom schemas.
   * @param doc The uri of the document
   */
  public deleteSchema(doc: string): void {
    const items = this.schemas.filter((item) => item[0] === doc);
    if (items.length > 0) {
      this.schemas = this.schemas.filter((item) => item[0] !== doc);
    }
  }

  /**
   * Checks if a schema exists for a given document.
   * @param doc The uri of the document
   * @returns True if a schema exists for the document, false otherwise.
   */
  public has(doc: string): boolean {
    const item = this.schemas.findIndex((item) => item[0] === doc);
    return item > -1;
  }

  /**
   * Returns the schemas for a given document
   * @param doc The uri of the document.
   * @returns The uris of the schemas
   * @throws Error if no schema found
   */
  public getSchemas(doc: string): string | string[] {
    if (this.has(doc)) {
      const items = this.schemas.filter((item) => item[0] === doc);
      if (items.length === 1) {
        return items[0][1];
      }
      return items.map((item) => {
        return item[1];
      });
    }
    throw new Error(`Test schema not found for ${doc}`);
  }

  /**
   * Returns the content of a schema for a given uri.
   * @param uri The uri of the schema.
   * @returns The content of the schema as a string, or null if the schema is not found.
   */
  public getContentForSchema(uri: string): string | null {
    const item = this.schemas.findIndex((item) => item[1] === uri);
    if (item < 0) {
      return null;
    }
    return JSON.stringify(this.schemas[item][2]);
  }
}

export async function schemaItSelfCustomSchemaProvider(uri: string): Promise<string | string[]> {
  const schemaProvider = TestCustomSchemaProvider.instance();
  if (schemaProvider.has(uri)) {
    return schemaProvider.getSchemas(uri);
  }
  return undefined;
}
