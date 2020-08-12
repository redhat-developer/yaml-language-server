/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { JSONSchema, JSONSchemaMap, JSONSchemaRef } from '../jsonSchema';
import { SchemaRequestService, WorkspaceContextService, PromiseConstructor, Thenable } from '../yamlLanguageService';
import {
  UnresolvedSchema,
  ResolvedSchema,
  JSONSchemaService,
  SchemaDependencies,
  ISchemaContributions,
} from 'vscode-json-languageservice/lib/umd/services/jsonSchemaService';

import { URI } from 'vscode-uri';

import * as nls from 'vscode-nls';
import { convertSimple2RegExpPattern } from '../utils/strings';
import { TextDocument } from 'vscode-languageserver';
import { SingleYAMLDocument } from '../parser/yamlParser07';
import { stringifyObject } from '../utils/json';
import { getNodeValue, JSONDocument } from '../parser/jsonParser07';
import { Parser } from 'prettier';
const localize = nls.loadMessageBundle();

export declare type CustomSchemaProvider = (uri: string) => Thenable<string | string[]>;

export enum MODIFICATION_ACTIONS {
  'delete',
  'add',
}

export interface SchemaAdditions {
  schema: string;
  action: MODIFICATION_ACTIONS.add;
  path: string;
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
}

export interface SchemaDeletions {
  schema: string;
  action: MODIFICATION_ACTIONS.delete;
  path: string;
  key: string;
}

export class FilePatternAssociation {
  private schemas: string[];
  private patternRegExp: RegExp;

  constructor(pattern: string) {
    try {
      this.patternRegExp = new RegExp(convertSimple2RegExpPattern(pattern) + '$');
    } catch (e) {
      // invalid pattern
      this.patternRegExp = null;
    }
    this.schemas = [];
  }

  public addSchema(id: string) {
    this.schemas.push(id);
  }

  public matchesPattern(fileName: string): boolean {
    return this.patternRegExp && this.patternRegExp.test(fileName);
  }

  public getSchemas() {
    return this.schemas;
  }
}

export class YAMLSchemaService extends JSONSchemaService {
  // To allow to use schemasById from super.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [x: string]: any;

  private customSchemaProvider: CustomSchemaProvider | undefined;
  private filePatternAssociations: JSONSchemaService.FilePatternAssociation[];
  private contextService: WorkspaceContextService;

  constructor(
    requestService: SchemaRequestService,
    contextService?: WorkspaceContextService,
    promiseConstructor?: PromiseConstructor
  ) {
    super(requestService, contextService, promiseConstructor);
    this.customSchemaProvider = undefined;
  }

  registerCustomSchemaProvider(customSchemaProvider: CustomSchemaProvider) {
    this.customSchemaProvider = customSchemaProvider;
  }

  //tslint:disable
  public resolveSchemaContent(
    schemaToResolve: UnresolvedSchema,
    schemaURL: string,
    dependencies: SchemaDependencies
  ): Thenable<ResolvedSchema> {
    const resolveErrors: string[] = schemaToResolve.errors.slice(0);
    const schema = schemaToResolve.schema;
    const contextService = this.contextService;

    const findSection = (schema: JSONSchema, path: string): any => {
      if (!path) {
        return schema;
      }
      let current: any = schema;
      if (path[0] === '/') {
        path = path.substr(1);
      }
      path.split('/').some((part) => {
        current = current[part];
        return !current;
      });
      return current;
    };

    const merge = (target: JSONSchema, sourceRoot: JSONSchema, sourceURI: string, path: string): void => {
      const section = findSection(sourceRoot, path);
      if (section) {
        for (const key in section) {
          if (Object.prototype.hasOwnProperty.call(section, key) && !Object.prototype.hasOwnProperty.call(target, key)) {
            target[key] = section[key];
          }
        }
      } else {
        resolveErrors.push(localize('json.schema.invalidref', "$ref '{0}' in '{1}' can not be resolved.", path, sourceURI));
      }
    };

    const resolveExternalLink = (
      node: JSONSchema,
      uri: string,
      linkPath: string,
      parentSchemaURL: string,
      parentSchemaDependencies: SchemaDependencies
    ): Thenable<any> => {
      if (contextService && !/^\w+:\/\/.*/.test(uri)) {
        uri = contextService.resolveRelativePath(uri, parentSchemaURL);
      }
      uri = this.normalizeId(uri);
      const referencedHandle = this.getOrAddSchemaHandle(uri);
      return referencedHandle.getUnresolvedSchema().then((unresolvedSchema) => {
        parentSchemaDependencies[uri] = true;
        if (unresolvedSchema.errors.length) {
          const loc = linkPath ? uri + '#' + linkPath : uri;
          resolveErrors.push(
            localize('json.schema.problemloadingref', "Problems loading reference '{0}': {1}", loc, unresolvedSchema.errors[0])
          );
        }
        merge(node, unresolvedSchema.schema, uri, linkPath);
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return resolveRefs(node, unresolvedSchema.schema, uri, referencedHandle.dependencies);
      });
    };

    const resolveRefs = (
      node: JSONSchema,
      parentSchema: JSONSchema,
      parentSchemaURL: string,
      parentSchemaDependencies: SchemaDependencies
    ): Thenable<any> => {
      if (!node || typeof node !== 'object') {
        return Promise.resolve(null);
      }

      const toWalk: JSONSchema[] = [node];
      const seen: JSONSchema[] = [];

      const openPromises: Thenable<any>[] = [];

      const collectEntries = (...entries: JSONSchemaRef[]) => {
        for (const entry of entries) {
          if (typeof entry === 'object') {
            toWalk.push(entry);
          }
        }
      };
      const collectMapEntries = (...maps: JSONSchemaMap[]) => {
        for (const map of maps) {
          if (typeof map === 'object') {
            for (const key in map) {
              const entry = map[key];
              if (typeof entry === 'object') {
                toWalk.push(entry);
              }
            }
          }
        }
      };
      const collectArrayEntries = (...arrays: JSONSchemaRef[][]) => {
        for (const array of arrays) {
          if (Array.isArray(array)) {
            for (const entry of array) {
              if (typeof entry === 'object') {
                toWalk.push(entry);
              }
            }
          }
        }
      };
      const handleRef = (next: JSONSchema) => {
        const seenRefs = [];
        while (next.$ref) {
          const ref = next.$ref;
          const segments = ref.split('#', 2);
          delete next.$ref;
          if (segments[0].length > 0) {
            openPromises.push(resolveExternalLink(next, segments[0], segments[1], parentSchemaURL, parentSchemaDependencies));
            return;
          } else {
            if (seenRefs.indexOf(ref) === -1) {
              merge(next, parentSchema, parentSchemaURL, segments[1]); // can set next.$ref again, use seenRefs to avoid circle
              seenRefs.push(ref);
            }
          }
        }

        collectEntries(
          <JSONSchema>next.items,
          <JSONSchema>next.additionalProperties,
          next.not,
          next.contains,
          next.propertyNames,
          next.if,
          next.then,
          next.else
        );
        collectMapEntries(next.definitions, next.properties, next.patternProperties, <JSONSchemaMap>next.dependencies);
        collectArrayEntries(next.anyOf, next.allOf, next.oneOf, <JSONSchema[]>next.items, next.schemaSequence);
      };

      while (toWalk.length) {
        const next = toWalk.pop();
        if (seen.indexOf(next) >= 0) {
          continue;
        }
        seen.push(next);
        handleRef(next);
      }
      return Promise.all(openPromises);
    };

    return resolveRefs(schema, schema, schemaURL, dependencies).then(() => {
      return new ResolvedSchema(schema, resolveErrors);
    });
  }
  //tslint:enable

  public getSchemaForResource(resource: string, doc: JSONDocument): Thenable<ResolvedSchema> {
    const resolveSchema = () => {
      const seen: { [schemaId: string]: boolean } = Object.create(null);
      const schemas: string[] = [];

      const schemaFromModeline = this.getSchemaFromModeline(doc);
      if (schemaFromModeline !== undefined) {
        schemas.push(schemaFromModeline);
        seen[schemaFromModeline] = true;
      }

      for (const entry of this.filePatternAssociations) {
        if (entry.matchesPattern(resource)) {
          for (const schemaId of entry.getURIs()) {
            if (!seen[schemaId]) {
              schemas.push(schemaId);
              seen[schemaId] = true;
            }
          }
        }
      }

      /**
       * If this resource matches a schemaID directly then use that schema.
       * This will be used in the case where the yaml language server is being used as a library
       * and clients want to save a schema with a particular ID and also use that schema
       * in language features
       */
      const normalizedResourceID = this.normalizeId(resource);
      if (this.schemasById[normalizedResourceID]) {
        schemas.push(normalizedResourceID);
      }

      if (schemas.length > 0) {
        return super
          .createCombinedSchema(resource, schemas)
          .getResolvedSchema()
          .then((schema) => {
            if (
              schema.schema &&
              schema.schema.schemaSequence &&
              schema.schema.schemaSequence[(<SingleYAMLDocument>doc).currentDocIndex]
            ) {
              return new ResolvedSchema(schema.schema.schemaSequence[(<SingleYAMLDocument>doc).currentDocIndex]);
            }
            return schema;
          });
      }

      return Promise.resolve(null);
    };
    if (this.customSchemaProvider) {
      return this.customSchemaProvider(resource)
        .then((schemaUri) => {
          if (Array.isArray(schemaUri)) {
            if (schemaUri.length === 0) {
              return resolveSchema();
            }
            return Promise.all(
              schemaUri.map((schemaUri) => {
                return this.resolveCustomSchema(schemaUri, doc);
              })
            ).then(
              (schemas) => {
                return {
                  errors: [],
                  schema: {
                    anyOf: schemas.map((schemaObj) => {
                      return schemaObj.schema;
                    }),
                  },
                };
              },
              (err) => {
                return resolveSchema();
              }
            );
          }

          if (!schemaUri) {
            return resolveSchema();
          }

          return this.resolveCustomSchema(schemaUri, doc);
        })
        .then(
          (schema) => {
            return schema;
          },
          (err) => {
            return resolveSchema();
          }
        );
    } else {
      return resolveSchema();
    }
  }

  /**
   * Retrieve schema if declared as modeline.
   * Public for testing purpose, not part of the API.
   * @param doc
   */
  public getSchemaFromModeline(doc: any): string {
    if (doc instanceof SingleYAMLDocument) {
      const yamlLanguageServerModeline = doc.lineComments.find((lineComment) => {
        const matchModeline = lineComment.match(/^#\s+yaml-language-server\s*:/g);
        return matchModeline !== null && matchModeline.length === 1;
      });
      if (yamlLanguageServerModeline != undefined) {
        const schemaMatchs = yamlLanguageServerModeline.match(/\$schema=\S+/g);
        if (schemaMatchs !== null && schemaMatchs.length >= 1) {
          if (schemaMatchs.length >= 2) {
            console.log(
              'Several $schema attributes has been found on the yaml-language-server modeline. The first one will be picked.'
            );
          }
          return schemaMatchs[0].substring('$schema='.length);
        }
      }
    }
    return undefined;
  }

  private async resolveCustomSchema(schemaUri, doc) {
    const unresolvedSchema = await this.loadSchema(schemaUri);
    const schema = await this.resolveSchemaContent(unresolvedSchema, schemaUri, []);
    if (schema.schema && schema.schema.schemaSequence && schema.schema.schemaSequence[doc.currentDocIndex]) {
      return new ResolvedSchema(schema.schema.schemaSequence[doc.currentDocIndex]);
    }
    return schema;
  }

  /**
   * Save a schema with schema ID and schema content.
   * Overrides previous schemas set for that schema ID.
   */
  public async saveSchema(schemaId: string, schemaContent: JSONSchema): Promise<void> {
    const id = this.normalizeId(schemaId);
    this.getOrAddSchemaHandle(id, schemaContent);
    return Promise.resolve(undefined);
  }

  /**
   * Delete a schema with schema ID.
   */
  public async deleteSchema(schemaId: string): Promise<void> {
    const id = this.normalizeId(schemaId);
    if (this.schemasById[id]) {
      delete this.schemasById[id];
    }
    return Promise.resolve(undefined);
  }

  /**
   * Add content to a specified schema at a specified path
   */
  public async addContent(additions: SchemaAdditions) {
    const schema = await this.getResolvedSchema(additions.schema);
    if (schema) {
      const resolvedSchemaLocation = this.resolveJSONSchemaToSection(schema.schema, additions.path);

      if (typeof resolvedSchemaLocation === 'object') {
        resolvedSchemaLocation[additions.key] = additions.content;
      }
      await this.saveSchema(additions.schema, schema.schema);
    }
  }

  /**
   * Delete content in a specified schema at a specified path
   */
  public async deleteContent(deletions: SchemaDeletions) {
    const schema = await this.getResolvedSchema(deletions.schema);
    if (schema) {
      const resolvedSchemaLocation = this.resolveJSONSchemaToSection(schema.schema, deletions.path);

      if (typeof resolvedSchemaLocation === 'object') {
        delete resolvedSchemaLocation[deletions.key];
      }
      await this.saveSchema(deletions.schema, schema.schema);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resolveNext(object: any, token: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray(object) && isNaN(token)) {
      throw new Error('Expected a number after the array object');
    } else if (typeof object === 'object' && typeof token !== 'string') {
      throw new Error('Expected a string after the object');
    }
  }

  /**
   * Everything below here is needed because we're importing from vscode-json-languageservice umd and we need
   * to provide a wrapper around the javascript methods we are calling since they have no type
   */

  normalizeId(id: string) {
    // The parent's `super.normalizeId(id)` isn't visible, so duplicated the code here
    try {
      return URI.parse(id).toString();
    } catch (e) {
      return id;
    }
  }

  getOrAddSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema) {
    return super.getOrAddSchemaHandle(id, unresolvedSchemaContent);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
