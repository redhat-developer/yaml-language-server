/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONSchemaService, CustomSchemaProvider } from './services/jsonSchemaService';
import { TextDocument, Position, CompletionList, Diagnostic } from 'vscode-languageserver-types';
import { JSONSchema } from './jsonSchema04';
import { YAMLDocumentSymbols } from './services/documentSymbols';
import { YAMLCompletion } from './services/yamlCompletion';
import { YAMLHover } from './services/yamlHover';
import { YAMLValidation } from './services/yamlValidation';
import { YAMLFormatter } from './services/yamlFormatter';
import { LanguageService as JSONLanguageService } from 'vscode-json-languageservice';

export interface LanguageSettings {
  validate?: boolean; //Setting for whether we want to validate the schema
  hover?: boolean; //Setting for whether we want to have hover results
  completion?: boolean; //Setting for whether we want to have completion results
  format?: boolean; //Setting for whether we want to have the formatter or not
  isKubernetes?: boolean; //If true then its validating against kubernetes
  // tslint:disable-next-line: no-any
  schemas?: any[]; //List of schemas,
  customTags?: Array<String>; //Array of Custom Tags
}

export interface PromiseConstructor {
    /**
     * Creates a new Promise.
     * @param executor A callback used to initialize the promise. This callback is passed two arguments:
     * a resolve callback used resolve the promise with a value or the result of another promise,
     * and a reject callback used to reject the promise with a provided reason or error.
     */
    // tslint:disable-next-line: no-any
    new <T>(executor: (resolve: (value?: T | Thenable<T>) => void, reject: (reason?: any) => void) => void): Thenable<T>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T>(values: Array<T | Thenable<T>>): Thenable<T[]>;
    /**
     * Creates a new rejected promise for the provided reason.
     * @param reason The reason the promise was rejected.
     * @returns A new rejected Promise.
     */
    // tslint:disable-next-line: no-any
    reject<T>(reason: any): Thenable<T>;

    /**
     * Creates a new resolved promise for the provided value.
     * @param value A promise.
     * @returns A promise whose internal state matches the provided promise.
     */
    resolve<T>(value: T | Thenable<T>): Thenable<T>;

}

export interface Thenable<R> {
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    // tslint:disable-next-line: no-any
    then<TResult>(onfulfilled?: (value: R) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Thenable<TResult>;
    // tslint:disable-next-line: no-any
    then<TResult>(onfulfilled?: (value: R) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Thenable<TResult>;
}

export interface WorkspaceContextService {
  resolveRelativePath(relativePath: string, resource: string): string;
}
/**
 * The schema request service is used to fetch schemas. The result should the schema file comment, or,
 * in case of an error, a displayable error string
 */
export interface SchemaRequestService {
  (uri: string): Thenable<string>;
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
  configure(settings): void;
  registerCustomSchemaProvider(schemaProvider: CustomSchemaProvider): void;
  doComplete(document: TextDocument, position: Position, doc): Thenable<CompletionList>;
  doValidation(jsonLanguageService: JSONLanguageService, document: TextDocument, yamlDocument, isKubernetes: boolean): Thenable<Diagnostic[]>;
  doHover(jsonLanguageService: JSONLanguageService, document: TextDocument, position: Position, doc);
  findDocumentSymbols(jsonLanguageService: JSONLanguageService, document: TextDocument, doc);
  findDocumentSymbols2(jsonLanguageService: JSONLanguageService, document: TextDocument, doc);
  doResolve(completionItem);
  resetSchema(uri: string): boolean;
  doFormat(document: TextDocument, options: CustomFormatterOptions);
}

export function getLanguageService(schemaRequestService, workspaceContext, contributions, promiseConstructor?): LanguageService {
  const promise = promiseConstructor || Promise;

  const schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);

  const completer = new YAMLCompletion(schemaService, contributions, promise);
  const hover = new YAMLHover(promise);
  const yamlDocumentSymbols = new YAMLDocumentSymbols();
  const yamlValidation = new YAMLValidation(promise);
  const formatter = new YAMLFormatter();

  return {
      configure: settings => {
        schemaService.clearExternalSchemas();
        if (settings.schemas) {
          settings.schemas.forEach(settings => {
            schemaService.registerExternalSchema(settings.uri, settings.fileMatch, settings.schema);
          });
        }
        yamlValidation.configure(settings);
        hover.configure(settings);
        const customTagsSetting = settings && settings['customTags'] ? settings['customTags'] : [];
        completer.configure(settings, customTagsSetting);
        formatter.configure(settings);
      },
      registerCustomSchemaProvider: (schemaProvider: CustomSchemaProvider) => {
        schemaService.registerCustomSchemaProvider(schemaProvider);
      },
      doComplete: completer.doComplete.bind(completer),
      doResolve: completer.doResolve.bind(completer),
      doValidation: yamlValidation.doValidation.bind(yamlValidation),
      doHover: hover.doHover.bind(hover),
      findDocumentSymbols: yamlDocumentSymbols.findDocumentSymbols.bind(yamlDocumentSymbols),
      findDocumentSymbols2: yamlDocumentSymbols.findHierarchicalDocumentSymbols.bind(yamlDocumentSymbols),
      resetSchema: (uri: string) => schemaService.onResourceChange(uri),
      doFormat: formatter.format.bind(formatter)
  };
}
