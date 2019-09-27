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

export declare type CustomSchemaProvider = (uri: string) => Thenable<string>;

export class YAMLSchemaService extends JSONSchemaService {

    private customSchemaProvider: CustomSchemaProvider | undefined;
    private filePatternAssociations: FilePatternAssociation[];

    constructor(requestService: SchemaRequestService, contextService?: WorkspaceContextService, promiseConstructor?: PromiseConstructor) {
        super(requestService, contextService, promiseConstructor);
        this.customSchemaProvider = undefined;
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

    /**
     * Everything below here is needed because we're importing from vscode-json-languageservice umd and we need
     * to provide a wrapper around the javascript methods we are calling since they have no type
     */

    resolveSchemaContent(schemaToResolve: UnresolvedSchema, schemaURL: string, dependencies: SchemaDependencies): Thenable<ResolvedSchema> {
        return super.resolveSchemaContent(schemaToResolve, schemaURL, dependencies);
    }

    // tslint:disable-next-line: no-any
    loadSchema(schemaUri: string): Thenable<any> {
        return super.loadSchema(schemaUri);
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
