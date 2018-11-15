/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONSchemaService, CustomSchemaProvider } from './services/jsonSchemaService'
import { TextDocument, Position, CompletionList, Diagnostic } from 'vscode-languageserver-types';
import { JSONSchema } from './jsonSchema';
import { YAMLDocumentSymbols } from './services/documentSymbols';
import { YAMLCompletion } from "./services/yamlCompletion";
import { YAMLHover } from "./services/yamlHover";
import { YAMLValidation } from "./services/yamlValidation";
import { format } from './services/yamlFormatter';

export interface LanguageSettings {
  validate?: boolean; //Setting for whether we want to validate the schema
  hover?: boolean; //Setting for whether we want to have hover results
  completion?: boolean; //Setting for whether we want to have completion results
  isKubernetes?: boolean; //If true then its validating against kubernetes
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
    then<TResult>(onfulfilled?: (value: R) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Thenable<TResult>;
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
}

export interface LanguageService {
  configure(settings): void;
  registerCustomSchemaProvider(schemaProvider: CustomSchemaProvider): void; // Register a custom schema provider
	doComplete(document: TextDocument, position: Position, doc): Thenable<CompletionList>;
  doValidation(document: TextDocument, yamlDocument): Thenable<Diagnostic[]>;
  doHover(document: TextDocument, position: Position, doc);
  findDocumentSymbols(document: TextDocument, doc);
  doResolve(completionItem);
  resetSchema(uri: string): boolean;
  doFormat(document: TextDocument, options: CustomFormatterOptions);
}

export function getLanguageService(schemaRequestService, workspaceContext, contributions, promiseConstructor?): LanguageService {
  let promise = promiseConstructor || Promise;

  let schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);

  let completer = new YAMLCompletion(schemaService, contributions, promise);
  let hover = new YAMLHover(schemaService, contributions, promise);
  let yamlDocumentSymbols = new YAMLDocumentSymbols();
  let yamlValidation = new YAMLValidation(schemaService, promise);

  return {
      configure: (settings) => {
        schemaService.clearExternalSchemas();
        if (settings.schemas) {
          settings.schemas.forEach(settings => {
            schemaService.registerExternalSchema(settings.uri, settings.fileMatch, settings.schema);
          });
        }
        yamlValidation.configure(settings);
        hover.configure(settings);
        let customTagsSetting = settings && settings["customTags"] ? settings["customTags"] : [];
        completer.configure(settings, customTagsSetting);
      },
      registerCustomSchemaProvider: (schemaProvider: CustomSchemaProvider) => {
        schemaService.registerCustomSchemaProvider(schemaProvider);
      },
      doComplete: completer.doComplete.bind(completer),
      doResolve: completer.doResolve.bind(completer),
      doValidation: yamlValidation.doValidation.bind(yamlValidation),
      doHover: hover.doHover.bind(hover),
      findDocumentSymbols: yamlDocumentSymbols.findDocumentSymbols.bind(yamlDocumentSymbols),
      resetSchema: (uri: string) => schemaService.onResourceChange(uri),
      doFormat: format
  }
}
