/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { JSONSchema } from '../jsonSchema07';
import { SchemaRequestService, WorkspaceContextService, PromiseConstructor, Thenable } from '../yamlLanguageService';
import { UnresolvedSchema, ResolvedSchema, JSONSchemaService,
    SchemaDependencies, FilePatternAssociation, ISchemaContributions } from 'vscode-json-languageservice/lib/umd/services/jsonSchemaService';
import * as yaml from 'js-yaml';

import { URI }  from 'vscode-uri';
import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export declare type CustomSchemaProvider = (uri: string) => Thenable<string>;

export class YAMLSchemaService extends JSONSchemaService {

    private customSchemaProvider: CustomSchemaProvider | undefined;
    private filePatternAssociations: FilePatternAssociation[];
    private requestService: SchemaRequestService

    constructor(requestService: SchemaRequestService, contextService?: WorkspaceContextService, promiseConstructor?: PromiseConstructor) {
        super(requestService, contextService, promiseConstructor);
        this.customSchemaProvider = undefined;
        this.requestService = requestService;
    }

    registerCustomSchemaProvider(customSchemaProvider: CustomSchemaProvider) {
        this.customSchemaProvider = customSchemaProvider;
    }

    public getSchemaForResource(resource: string, doc = undefined): Thenable<ResolvedSchema> {
        const resolveSchema = () => {

            const seen: { [schemaId: string]: boolean } = Object.create(null);
            const schemas: string[] = [];
            for (const entry of this.filePatternAssociations) {
                if (entry.matchesPattern(resource)) {
                    for (const schemaId of entry.getSchemas()) {
                        if (!seen[schemaId]) {
                            schemas.push(schemaId);
                            seen[schemaId] = true;
                        }
                    }
                }
            }

            if (schemas.length > 0) {
                return super.createCombinedSchema(resource, schemas).getResolvedSchema();
            }

            return Promise.resolve(null);
        };
        if (this.customSchemaProvider) {
            return this.customSchemaProvider(resource)
                       .then(schemaUri => {
                           if (!schemaUri) {
                               return resolveSchema();
                           }

                           return this.loadSchema(schemaUri)
                               .then(unsolvedSchema => this.resolveSchemaContent(unsolvedSchema, schemaUri, []));
                        })
                       .then(schema => schema, err => resolveSchema());
        } else {
            return resolveSchema();
        }
    }

    loadSchema(schemaUri: string): Thenable<UnresolvedSchema> {
        const requestService = this.requestService;
        return super.loadSchema(schemaUri).then((unresolvedJsonSchema: UnresolvedSchema) => {
            // If json-language-server failed to parse the schema, attempt to parse it as YAML instead.
            if (unresolvedJsonSchema.errors && unresolvedJsonSchema.schema === undefined) {
                return requestService(schemaUri).then(
                    content => {
                        if (!content) {
                            let errorMessage = localize('json.schema.nocontent', 'Unable to load schema from \'{0}\': No content.', toDisplayString(schemaUri));
                            return new UnresolvedSchema(<JSONSchema>{}, [errorMessage]);
                        }

                        try {
                            const schemaContent: JSONSchema = yaml.safeLoad(content);
                            return new UnresolvedSchema(schemaContent, []);
                        } catch (yamlError) {
                            let errorMessage = localize('json.schema.invalidFormat', "Unable to parse content from '{0}': {1}.", toDisplayString(schemaUri), yamlError)
                            return new UnresolvedSchema(<JSONSchema>{}, [errorMessage])
                        }
                    },
                    (error: any) => {
                        let errorMessage = error.toString();
                        let errorSplit = error.toString().split('Error: ');
                        if (errorSplit.length > 1) {
                            // more concise error message, URL and context are attached by caller anyways
                            errorMessage = errorSplit[1];
                        }
                        return new UnresolvedSchema(<JSONSchema>{}, [errorMessage]);
                    }
                )
            }

            return unresolvedJsonSchema
        });
    }

    /**
     * Everything below here is needed because we're importing from vscode-json-languageservice umd and we need
     * to provide a wrapper around the javascript methods we are calling since they have no type
     */

    resolveSchemaContent(schemaToResolve: UnresolvedSchema, schemaURL: string, dependencies: SchemaDependencies): Thenable<ResolvedSchema> {
        return super.resolveSchemaContent(schemaToResolve, schemaURL, dependencies);
    }

    registerExternalSchema(uri: string, filePatterns?: string[], unresolvedSchema?: JSONSchema) {
        return super.registerExternalSchema(uri, filePatterns, unresolvedSchema);
    }

    clearExternalSchemas(): void {
        super.clearExternalSchemas();
    }

    setSchemaContributions(schemaContributions: ISchemaContributions): void {
        super.setSchemaContributions(schemaContributions);
    }

    getRegisteredSchemaIds(filter?: (scheme: any) => boolean): string[] {
        return super.getRegisteredSchemaIds(filter);
    }

    getResolvedSchema(schemaId: string): Thenable<ResolvedSchema> {
        return super.getResolvedSchema(schemaId);
    }

    onResourceChange(uri: string): boolean {
        return super.onResourceChange(uri);
    }
}

function toDisplayString(url: string) {
	try {
		let uri = URI.parse(url);
		if (uri.scheme === 'file') {
			return uri.fsPath;
		}
	} catch (e) {
		// ignore
	}
	return url;
}