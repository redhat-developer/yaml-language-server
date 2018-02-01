import { JSONSchemaService } from './services/jsonSchemaService'
import { LanguageSettings } from 'vscode-yaml-languageservice';
import { TextDocument, Position, CompletionList } from 'vscode-languageserver-types';
import { JSONSchema } from './jsonSchema';
import { schemaContributions } from './services/configuration';
import { YAMLDocumentSymbols } from './services/documentSymbols';
import { YAMLCompletion } from "./services/yamlCompletion";
import { JSONDocument } from 'vscode-json-languageservice';
import { YAMLHover } from "./services/yamlHover";
import { YAMLValidation } from "./services/yamlValidation";
import { YAMLDocument, Diagnostic } from 'vscode-yaml-languageservice';
//const jsonValidation_1 = require("vscode-json-languageservice/lib/services/jsonValidation");

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

export interface LanguageService {
  configure(settings): void;
	doComplete(document: TextDocument, position: Position, doc, isKubernetes: Boolean): Thenable<CompletionList>;
  doValidation(document: TextDocument, yamlDocument, isKubernetes: Boolean): Thenable<Diagnostic[]>;
  doHover(document: TextDocument, position: Position, doc, isKubernetes: Boolean);
  findDocumentSymbols(document: TextDocument, doc);
  doResolve(completionItem);
}

export function getLanguageService(schemaRequestService, workspaceContext, contributions, promiseConstructor?): LanguageService {
  let promise = promiseConstructor || Promise;

  let schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);
  schemaService.setSchemaContributions(schemaContributions);

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
      },
      doComplete: completer.doComplete.bind(completer),
      doResolve: completer.doResolve.bind(completer),
      doValidation: yamlValidation.doValidation.bind(yamlValidation),
      doHover: hover.doHover.bind(hover),
      findDocumentSymbols: yamlDocumentSymbols.findDocumentSymbols.bind(yamlDocumentSymbols)
  }
}
