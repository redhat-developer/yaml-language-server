import { autoCompletionProvider } from './providers/autoCompletionProvider';
import { validationProvider } from './providers/validationProvider';
import { JSONSchemaService } from './services/jsonSchemaService'

import { TextDocument, Position, CompletionList } from 'vscode-languageserver-types';
import { YAMLDocument} from 'yaml-ast-parser';
import { JSONSchema } from './jsonSchema';
import { schemaContributions } from './services/configuration';
import { hoverProvider } from "./providers/hoverProvider";

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

export interface LanguageSettings {
	/**
	 * If set, the validator will return syntax errors.
	 */
	validate?: boolean;

	/**
	 * A list of known schemas and/or associations of schemas to file names.
	 */
	schemas?: SchemaConfiguration[];
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
  configure(settings: LanguageSettings): void;
	doComplete(document: TextDocument, documentPosition: Position, doc): Thenable<CompletionList>;
  doValidation(document: TextDocument, doc: YAMLDocument);
  doHover(document, position, doc);
}

export function getLanguageService(schemaRequestService, workspaceContext): LanguageService {

  let schemaService = new JSONSchemaService(schemaRequestService, workspaceContext);
  schemaService.setSchemaContributions(schemaContributions);

  let completer = new autoCompletionProvider(schemaService);
  let validator = new validationProvider(schemaService);
  let hover = new hoverProvider(schemaService);

  return {
      configure: (settings: LanguageSettings) => {
        schemaService.clearExternalSchemas();
        if (settings.schemas) {
          settings.schemas.forEach(settings => {
            schemaService.registerExternalSchema(settings.uri, settings.fileMatch, settings.schema);
          });
        }
      },
    	doComplete: completer.doComplete.bind(completer),
      doValidation: validator.doValidation.bind(validator),
      doHover: hover.doHover.bind(hover)
  }
}
