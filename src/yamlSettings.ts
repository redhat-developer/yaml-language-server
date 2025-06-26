import { TextDocuments, Disposable, ClientCapabilities, WorkspaceFolder } from 'vscode-languageserver';
import { CustomFormatterOptions, SchemaConfiguration } from './languageservice/yamlLanguageService';
import { ISchemaAssociations } from './requestTypes';
import { URI } from 'vscode-uri';
import { JSONSchema } from './languageservice/jsonSchema';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { JSON_SCHEMASTORE_URL } from './languageservice/utils/schemaUrls';
import { YamlVersion } from './languageservice/parser/yamlParser07';

// Client settings interface to grab settings relevant for the language server
export interface Settings {
  yaml: {
    format: CustomFormatterOptions;
    schemas: JSONSchemaSettings[];
    validate: boolean;
    hover: boolean;
    completion: boolean;
    customTags: Array<string>;
    schemaStore: {
      url: string;
      enable: boolean;
    };
    disableDefaultProperties: boolean;
    disableAdditionalProperties: boolean;
    suggest: {
      parentSkeletonSelectedFirst: boolean;
    };
    style: {
      flowMapping: 'allow' | 'forbid';
      flowSequence: 'allow' | 'forbid';
    };
    keyOrdering: boolean;
    maxItemsComputed: number;
    yamlVersion: YamlVersion;
  };
  http: {
    proxy: string;
    proxyStrictSSL: boolean;
  };
  yamlEditor: {
    'editor.tabSize': number;
    'editor.insertSpaces': boolean;
    'editor.formatOnType': boolean;
  };
  vscodeEditor: {
    detectIndentation: boolean;
  };
  files: {
    associations: Map<string, string>;
  };
}

export interface JSONSchemaSettings {
  fileMatch?: string[];
  url?: string;
  schema?: JSONSchema;
}

// This class is responsible for handling all the settings
export class SettingsState {
  yamlConfigurationSettings: JSONSchemaSettings[] = undefined;
  schemaAssociations: ISchemaAssociations | SchemaConfiguration[] | undefined = undefined;
  formatterRegistration: PromiseLike<Disposable> = null;
  specificValidatorPaths = [];
  schemaConfigurationSettings = [];
  yamlShouldValidate = true;
  yamlFormatterSettings = {
    singleQuote: false,
    bracketSpacing: true,
    proseWrap: 'preserve',
    printWidth: 80,
    trailingComma: true,
    enable: true,
  } as CustomFormatterOptions;
  yamlShouldHover = true;
  yamlShouldCompletion = true;
  schemaStoreSettings = [];
  customTags = [];
  schemaStoreEnabled = true;
  schemaStoreUrl = JSON_SCHEMASTORE_URL;
  indentation: string | undefined = undefined;
  disableAdditionalProperties = false;
  disableDefaultProperties = false;
  suggest = {
    parentSkeletonSelectedFirst: false,
  };
  style: {
    flowMapping: 'allow' | 'forbid';
    flowSequence: 'allow' | 'forbid';
  };
  keyOrdering = false;
  maxItemsComputed = 5000;

  // File validation helpers
  pendingValidationRequests: { [uri: string]: NodeJS.Timeout } = {};
  validationDelayMs = 200;

  // Create a simple text document manager. The text document manager
  // supports full document sync only
  documents: TextDocuments<TextDocument> | TextDocumentTestManager = new TextDocuments(TextDocument);

  // Language client configuration
  capabilities: ClientCapabilities;
  workspaceRoot: URI = null;
  workspaceFolders: WorkspaceFolder[] = [];
  clientDynamicRegisterSupport = false;
  hierarchicalDocumentSymbolSupport = false;
  hasWorkspaceFolderCapability = false;
  hasConfigurationCapability = false;
  useVSCodeContentRequest = false;
  yamlVersion: YamlVersion = '1.2';
  useSchemaSelectionRequests = false;
  hasWsChangeWatchedFileDynamicRegistration = false;
  fileExtensions: string[] = ['.yml', '.yaml'];
}

export class TextDocumentTestManager extends TextDocuments<TextDocument> {
  testTextDocuments = new Map<string, TextDocument>();

  constructor() {
    super(TextDocument);
  }

  get(uri: string): TextDocument | undefined {
    return this.testTextDocuments.get(uri);
  }

  set(textDocument: TextDocument): void {
    this.testTextDocuments.set(textDocument.uri, textDocument);
  }
}
