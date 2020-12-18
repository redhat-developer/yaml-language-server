import { TextDocuments, Disposable, ClientCapabilities, WorkspaceFolder } from 'vscode-languageserver';
import { CustomFormatterOptions, SchemaConfiguration } from './languageservice/yamlLanguageService';
import { ISchemaAssociations } from './requestTypes';
import { URI } from 'vscode-uri';
import { JSONSchema } from './languageservice/jsonSchema';
import { TextDocument } from 'vscode-languageserver-textdocument';

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

export interface JSONSchemaSettings {
  fileMatch?: string[];
  url?: string;
  schema?: JSONSchema;
}

// This class is responsible for handling all the settings
export class SettingsState {
  public yamlConfigurationSettings: JSONSchemaSettings[] = undefined;
  public schemaAssociations: ISchemaAssociations | SchemaConfiguration[] | undefined = undefined;
  public formatterRegistration: Thenable<Disposable> = null;
  public specificValidatorPaths = [];
  public schemaConfigurationSettings = [];
  public yamlShouldValidate = true;
  public yamlFormatterSettings = {
    singleQuote: false,
    bracketSpacing: true,
    proseWrap: 'preserve',
    printWidth: 80,
    enable: true,
  } as CustomFormatterOptions;
  public yamlShouldHover = true;
  public yamlShouldCompletion = true;
  public schemaStoreSettings = [];
  public customTags = [];
  public schemaStoreEnabled = true;
  public indentation: string | undefined = undefined;

  // File validation helpers
  public pendingValidationRequests: { [uri: string]: NodeJS.Timer } = {};
  public validationDelayMs = 200;

  // Create a simple text document manager. The text document manager
  // supports full document sync only
  public documents: TextDocuments | TextDocumentTestManager = new TextDocuments();

  // Language client configuration
  public capabilities: ClientCapabilities;
  public workspaceRoot: URI = null;
  public workspaceFolders: WorkspaceFolder[] = [];
  public clientDynamicRegisterSupport = false;
  public hierarchicalDocumentSymbolSupport = false;
  public hasWorkspaceFolderCapability = false;
  public useVSCodeContentRequest = false;
}

export class TextDocumentTestManager extends TextDocuments {
  testTextDocuments = new Map<string, TextDocument>();

  get(uri: string): TextDocument | undefined {
    return this.testTextDocuments.get(uri);
  }

  set(textDocument: TextDocument): void {
    this.testTextDocuments.set(textDocument.uri, textDocument);
  }
}
