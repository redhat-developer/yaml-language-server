/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  YAMLSchemaService,
  CustomSchemaProvider,
  SchemaAdditions,
  SchemaDeletions,
  SchemaDeletionsAll,
} from './services/yamlSchemaService';
import {
  Position,
  CompletionList,
  Diagnostic,
  Hover,
  SymbolInformation,
  DocumentSymbol,
  TextEdit,
  DocumentLink,
  CodeLens,
} from 'vscode-languageserver-types';
import { JSONSchema } from './jsonSchema';
import { YAMLDocumentSymbols } from './services/documentSymbols';
import { YAMLCompletion } from './services/yamlCompletion';
import { YAMLHover } from './services/yamlHover';
import { YAMLValidation } from './services/yamlValidation';
import { YAMLFormatter } from './services/yamlFormatter';
import { JSONDocument, DefinitionLink, TextDocument, DocumentSymbolsContext } from 'vscode-json-languageservice';
import { findLinks } from './services/yamlLinks';
import {
  FoldingRange,
  ClientCapabilities,
  CodeActionParams,
  CodeAction,
  Connection,
  DocumentOnTypeFormattingParams,
  CodeLensParams,
} from 'vscode-languageserver/node';
import { getFoldingRanges } from './services/yamlFolding';
import { FoldingRangesContext } from './yamlTypes';
import { YamlCodeActions } from './services/yamlCodeActions';
import { commandExecutor } from '../languageserver/commandExecutor';
import { doDocumentOnTypeFormatting } from './services/yamlOnTypeFormatting';
import { YamlCodeLens } from './services/yamlCodeLens';
import { registerCommands } from './services/yamlCommands';
import { Telemetry } from '../languageserver/telemetry';

export enum SchemaPriority {
  SchemaStore = 1,
  SchemaAssociation = 2,
  Settings = 3,
  Modeline = 4,
}

export interface SchemasSettings {
  priority?: SchemaPriority; // Priority represents the order in which schemas are selected. If multiple schemas match a yaml document then highest priority wins
  fileMatch: string[];
  schema?: unknown;
  uri: string;
}

export interface LanguageSettings {
  validate?: boolean; //Setting for whether we want to validate the schema
  hover?: boolean; //Setting for whether we want to have hover results
  completion?: boolean; //Setting for whether we want to have completion results
  format?: boolean; //Setting for whether we want to have the formatter or not
  isKubernetes?: boolean; //If true then its validating against kubernetes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemas?: SchemasSettings[]; //List of schemas,
  customTags?: Array<string>; //Array of Custom Tags
  /**
   * Default indentation size
   */
  indentation?: string;

  /**
   * Globally set additionalProperties to false if additionalProperties is not set and if schema.type is object.
   * So if its true, no extra properties are allowed inside yaml.
   */
  disableAdditionalProperties?: boolean;
}

export interface WorkspaceContextService {
  resolveRelativePath(relativePath: string, resource: string): string;
}
/**
 * The schema request service is used to fetch schemas. The result should the schema file comment, or,
 * in case of an error, a displayable error string
 */
export interface SchemaRequestService {
  (uri: string): Promise<string>;
}

export interface SchemaConfiguration {
  /**
   * The URI of the schema, which is also the identifier of the schema.
   */
  uri: string;
  /**
   * A list of file names that are associated to the schema. The '*' wildcard can be used. For example '*.schema.json', 'package.json'
   */
  fileMatch?: string[];
  /**
   * The schema for the given URI.
   * If no schema is provided, the schema will be fetched with the schema request service (if available).
   */
  schema?: JSONSchema;
}

export interface CustomFormatterOptions {
  singleQuote?: boolean;
  bracketSpacing?: boolean;
  proseWrap?: string;
  printWidth?: number;
  enable?: boolean;
}

export interface LanguageService {
  configure(settings: LanguageSettings): void;
  registerCustomSchemaProvider(schemaProvider: CustomSchemaProvider): void;
  doComplete(document: TextDocument, position: Position, isKubernetes: boolean): Promise<CompletionList>;
  doValidation(document: TextDocument, isKubernetes: boolean): Promise<Diagnostic[]>;
  doHover(document: TextDocument, position: Position): Promise<Hover | null>;
  findDocumentSymbols(document: TextDocument, context: DocumentSymbolsContext): SymbolInformation[];
  findDocumentSymbols2(document: TextDocument, context: DocumentSymbolsContext): DocumentSymbol[];
  findDefinition(document: TextDocument, position: Position, doc: JSONDocument): Promise<DefinitionLink[]>;
  findLinks(document: TextDocument): Promise<DocumentLink[]>;
  resetSchema(uri: string): boolean;
  doFormat(document: TextDocument, options: CustomFormatterOptions): TextEdit[];
  doDocumentOnTypeFormatting(document: TextDocument, params: DocumentOnTypeFormattingParams): TextEdit[] | undefined;
  addSchema(schemaID: string, schema: JSONSchema): void;
  deleteSchema(schemaID: string): void;
  modifySchemaContent(schemaAdditions: SchemaAdditions): void;
  deleteSchemaContent(schemaDeletions: SchemaDeletions): void;
  deleteSchemasWhole(schemaDeletions: SchemaDeletionsAll): void;
  getFoldingRanges(document: TextDocument, context: FoldingRangesContext): FoldingRange[] | null;
  getCodeAction(document: TextDocument, params: CodeActionParams): CodeAction[] | undefined;
  getCodeLens(document: TextDocument, params: CodeLensParams): Thenable<CodeLens[] | undefined> | CodeLens[] | undefined;
  resolveCodeLens(param: CodeLens): Thenable<CodeLens> | CodeLens;
}

export function getLanguageService(
  schemaRequestService: SchemaRequestService,
  workspaceContext: WorkspaceContextService,
  connection: Connection,
  telemetry: Telemetry,
  clientCapabilities?: ClientCapabilities
): LanguageService {
  const schemaService = new YAMLSchemaService(schemaRequestService, workspaceContext);
  const completer = new YAMLCompletion(schemaService, clientCapabilities, telemetry);
  const hover = new YAMLHover(schemaService);
  const yamlDocumentSymbols = new YAMLDocumentSymbols(schemaService, telemetry);
  const yamlValidation = new YAMLValidation(schemaService);
  const formatter = new YAMLFormatter();
  const yamlCodeActions = new YamlCodeActions(clientCapabilities);
  const yamlCodeLens = new YamlCodeLens(schemaService, telemetry);
  // register all commands
  registerCommands(commandExecutor, connection);
  return {
    configure: (settings) => {
      schemaService.clearExternalSchemas();
      if (settings.schemas) {
        schemaService.schemaPriorityMapping = new Map();
        settings.schemas.forEach((settings) => {
          const currPriority = settings.priority ? settings.priority : 0;
          schemaService.addSchemaPriority(settings.uri, currPriority);
          schemaService.registerExternalSchema(settings.uri, settings.fileMatch, settings.schema);
        });
      }
      yamlValidation.configure(settings);
      hover.configure(settings);
      const customTagsSetting = settings && settings['customTags'] ? settings['customTags'] : [];
      completer.configure(settings, customTagsSetting);
      formatter.configure(settings);
      yamlCodeActions.configure(settings);
    },
    registerCustomSchemaProvider: (schemaProvider: CustomSchemaProvider) => {
      schemaService.registerCustomSchemaProvider(schemaProvider);
    },
    findDefinition: () => Promise.resolve([]),
    findLinks,
    doComplete: completer.doComplete.bind(completer),
    doValidation: yamlValidation.doValidation.bind(yamlValidation),
    doHover: hover.doHover.bind(hover),
    findDocumentSymbols: yamlDocumentSymbols.findDocumentSymbols.bind(yamlDocumentSymbols),
    findDocumentSymbols2: yamlDocumentSymbols.findHierarchicalDocumentSymbols.bind(yamlDocumentSymbols),
    resetSchema: (uri: string) => {
      return schemaService.onResourceChange(uri);
    },
    doFormat: formatter.format.bind(formatter),
    doDocumentOnTypeFormatting,
    addSchema: (schemaID: string, schema: JSONSchema) => {
      return schemaService.saveSchema(schemaID, schema);
    },
    deleteSchema: (schemaID: string) => {
      return schemaService.deleteSchema(schemaID);
    },
    modifySchemaContent: (schemaAdditions: SchemaAdditions) => {
      return schemaService.addContent(schemaAdditions);
    },
    deleteSchemaContent: (schemaDeletions: SchemaDeletions) => {
      return schemaService.deleteContent(schemaDeletions);
    },
    deleteSchemasWhole: (schemaDeletions: SchemaDeletionsAll) => {
      return schemaService.deleteSchemas(schemaDeletions);
    },
    getFoldingRanges,
    getCodeAction: (document, params) => {
      return yamlCodeActions.getCodeAction(document, params);
    },
    getCodeLens: (document, params) => {
      return yamlCodeLens.getCodeLens(document, params);
    },
    resolveCodeLens: (param) => yamlCodeLens.resolveCodeLens(param),
  };
}
