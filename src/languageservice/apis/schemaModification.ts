/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { JSONSchemaService } from '../services/jsonSchemaService';
import { JSONSchema } from '../jsonSchema04';

export enum MODIFICATION_ACTIONS {
    'delete',
    'add'
}

export interface SchemaAdditions {
    schema: string,
    action: MODIFICATION_ACTIONS.add,
    path: string,
    key: string,
    // tslint:disable-next-line: no-any
    content: any
}

export interface SchemaDeletions {
    schema: string,
    action: MODIFICATION_ACTIONS.delete,
    path: string,
    key: string
}

export class SchemaModification {

    /**
     * Add content to a specified schema at a specified path
     */
    public async addContent(schemaService: JSONSchemaService, additions: SchemaAdditions) {
        const schema = await schemaService.getResolvedSchema(additions.schema);
        if (schema) {
            const resolvedSchemaLocation = this.resolveJSONSchemaToSection(schema.schema, additions.path);

            if (typeof resolvedSchemaLocation === 'object') {
                resolvedSchemaLocation[additions.key] = additions.content;
            }
            await schemaService.saveSchema(additions.schema, schema.schema);
        }
    }

    /**
     * Delete content in a specified schema at a specified path
     */
    public async deleteContent(schemaService: JSONSchemaService, deletions: SchemaDeletions) {
        const schema = await schemaService.getResolvedSchema(deletions.schema);
        if (schema) {
            const resolvedSchemaLocation = this.resolveJSONSchemaToSection(schema.schema, deletions.path);

            if (typeof resolvedSchemaLocation === 'object') {
                delete resolvedSchemaLocation[deletions.key];
            }
            await schemaService.saveSchema(deletions.schema, schema.schema);
        }
    }

    /**
     * Take a JSON Schema and the path that you would like to get to
     * @returns the JSON Schema resolved at that specific path
     */
    private resolveJSONSchemaToSection(schema: JSONSchema, paths: string): JSONSchema {
        const splitPathway = paths.split('/');
        let resolvedSchemaLocation = schema;
        for (const path of splitPathway) {
            if (path === '') {
                continue;
            }
            this.resolveNext(resolvedSchemaLocation, path);
            resolvedSchemaLocation = resolvedSchemaLocation[path];
        }
        return resolvedSchemaLocation;
    }

    /**
     * Resolve the next Object if they have compatible types
     * @param object a location in the JSON Schema
     * @param token the next token that you want to search for
     */
    // tslint:disable-next-line: no-any
    private resolveNext(object: any, token: any) {
        // tslint:disable-next-line: no-any
        if (Array.isArray(object) && isNaN(token)) {
            throw new Error('Expected a number after the array object');
        } else if (typeof object === 'object' && typeof token !== 'string') {
            throw new Error('Expected a string after the object');
        }
    }
}
