/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONSchema, JSONSchemaMap, JSONSchemaRef, SchemaDialect } from '../jsonSchema';
import { SchemaPriority, SchemaRequestService, WorkspaceContextService } from '../yamlLanguageService';
import { SettingsState } from '../../yamlSettings';
import {
  UnresolvedSchema,
  ResolvedSchema,
  JSONSchemaService,
  SchemaDependencies,
  ISchemaContributions,
  SchemaHandle,
} from 'vscode-json-languageservice/lib/umd/services/jsonSchemaService';

import { URI } from 'vscode-uri';
import * as l10n from '@vscode/l10n';
import { convertSimple2RegExpPattern } from '../utils/strings';
import { SingleYAMLDocument } from '../parser/yamlParser07';
import { JSONDocument } from '../parser/jsonDocument';
import * as path from 'path';
import { getSchemaFromModeline } from './modelineUtil';
import { JSONSchemaDescriptionExt } from '../../requestTypes';
import { SchemaVersions } from '../yamlTypes';

import { parse } from 'yaml';
import * as Json from 'jsonc-parser';
import Ajv, { DefinedError, type AnySchemaObject, type ValidateFunction } from 'ajv';
import Ajv4 from 'ajv-draft-04';
import Ajv2019 from 'ajv/dist/2019';
import Ajv2020 from 'ajv/dist/2020';
import { autoDetectKubernetesSchemaFromDocument } from './crdUtil';
import { CRD_CATALOG_URL, KUBERNETES_SCHEMA_URL } from '../utils/schemaUrls';

const ajv4 = new Ajv4({ allErrors: true });
const ajv7 = new Ajv({ allErrors: true });
const ajv2019 = new Ajv2019({ allErrors: true });
const ajv2020 = new Ajv2020({ allErrors: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsonSchema04 = require('ajv-draft-04/dist/refs/json-schema-draft-04.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsonSchema07 = require('ajv/dist/refs/json-schema-draft-07.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsonSchema2019 = require('ajv/dist/refs/json-schema-2019-09/schema.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsonSchema2020 = require('ajv/dist/refs/json-schema-2020-12/schema.json');

const schema04Validator = ajv4.compile(jsonSchema04);
const schema07Validator = ajv7.compile(jsonSchema07);
const schema2019Validator = ajv2019.compile(jsonSchema2019);
const schema2020Validator = ajv2020.compile(jsonSchema2020);

const schemaDialectCache = new Map<string, SchemaDialect>();
const schemaDialectInFlight = new Map<string, Promise<SchemaDialect>>();

export declare type CustomSchemaProvider = (uri: string) => Promise<string | string[]>;

export enum MODIFICATION_ACTIONS {
  'delete',
  'add',
  'deleteAll',
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

export interface SchemaDeletionsAll {
  schemas: string[];
  action: MODIFICATION_ACTIONS.deleteAll;
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

  public addSchema(id: string): void {
    this.schemas.push(id);
  }

  public matchesPattern(fileName: string): boolean {
    return this.patternRegExp && this.patternRegExp.test(fileName);
  }

  public getSchemas(): string[] {
    return this.schemas;
  }
}
interface SchemaStoreSchema {
  name: string;
  description: string;
  versions?: SchemaVersions;
}
export class YAMLSchemaService extends JSONSchemaService {
  // To allow to use schemasById from super.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [x: string]: any;

  private customSchemaProvider: CustomSchemaProvider | undefined;
  private filePatternAssociations: JSONSchemaService.FilePatternAssociation[];
  private contextService: WorkspaceContextService;
  private requestService: SchemaRequestService;
  private yamlSettings: SettingsState;
  public schemaPriorityMapping: Map<string, Set<SchemaPriority>>;

  private schemaUriToNameAndDescription = new Map<string, SchemaStoreSchema>();

  constructor(
    requestService: SchemaRequestService,
    contextService?: WorkspaceContextService,
    promiseConstructor?: PromiseConstructor,
    yamlSettings?: SettingsState
  ) {
    super(requestService, contextService, promiseConstructor);
    this.customSchemaProvider = undefined;
    this.requestService = requestService;
    this.schemaPriorityMapping = new Map();
    this.yamlSettings = yamlSettings;
  }

  registerCustomSchemaProvider(customSchemaProvider: CustomSchemaProvider): void {
    this.customSchemaProvider = customSchemaProvider;
  }

  getAllSchemas(): JSONSchemaDescriptionExt[] {
    const result: JSONSchemaDescriptionExt[] = [];
    const schemaUris = new Set<string>();
    for (const filePattern of this.filePatternAssociations) {
      const schemaUri = filePattern.uris[0];
      if (schemaUris.has(schemaUri)) {
        continue;
      }
      schemaUris.add(schemaUri);
      const schemaHandle: JSONSchemaDescriptionExt = {
        uri: schemaUri,
        fromStore: false,
        usedForCurrentFile: false,
      };

      if (this.schemaUriToNameAndDescription.has(schemaUri)) {
        const { name, description, versions } = this.schemaUriToNameAndDescription.get(schemaUri);
        schemaHandle.name = name;
        schemaHandle.description = description;
        schemaHandle.fromStore = true;
        schemaHandle.versions = versions;
      }
      result.push(schemaHandle);
    }

    return result;
  }

  async resolveSchemaContent(
    schemaToResolve: UnresolvedSchema,
    schemaURL: string,
    dependencies: SchemaDependencies
  ): Promise<ResolvedSchema> {
    const resolveErrors: string[] = schemaToResolve.errors.slice(0);
    const loc = toDisplayString(schemaURL);

    const raw: unknown = schemaToResolve.schema;
    if (raw === null || Array.isArray(raw) || (typeof raw !== 'object' && typeof raw !== 'boolean')) {
      const got = raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;
      resolveErrors.push(
        l10n.t("Schema '{0}' is not valid: {1}", loc, `expected a JSON Schema object or boolean, got "${got}".`)
      );
      return new ResolvedSchema({}, resolveErrors);
    }

    const contextService = this.contextService;
    let schema = raw as JSONSchema;
    const schemaDialect = await pickSchemaDialect(schema.$schema, (uri) => this.loadSchema(uri));
    const validator = pickMetaValidator(schemaDialect);
    if (validator && !validator(schema)) {
      const errs: string[] = [];
      for (const err of validator.errors as DefinedError[]) {
        errs.push(`${err.instancePath} : ${err.message}`);
      }
      resolveErrors.push(l10n.t("Schema '{0}' is not valid: {1}", loc, `\n${errs.join('\n')}`));
    }

    /**
     * ----------------------------
     * Schema resource and fragment resolution
     * ----------------------------
     * Manages two types of schema identification:
     * 1. Embedded resources ($id without fragment):
     *    Creates a new resource scope that can be referenced by other schemas, e.g. "$id": "other.json"
     * 2. Plain-name fragments/anchors:
     *    Creates named anchors within a resource for direct reference.
     *
     * Cache per resource URI in resourceIndexByUri:
     * - root: schema node for the resource
     * - fragments: map of plain-name anchors to their schema nodes
     */
    type PlainNameFragmentMap = Map<string, JSONSchema>;
    type ResourceIndex = { root?: JSONSchema; fragments: PlainNameFragmentMap };
    const resourceIndexByUri = new Map<string, ResourceIndex>();

    // remove #fragment from URI
    const stripFragment = (uri: string): string => {
      const hashIndex = uri.indexOf('#');
      return hashIndex === -1 ? uri : uri.slice(0, hashIndex);
    };

    // resolve relative URI against base URI
    // e.g. resolve "foo.json" against "http://example.com/bar.json" or "#Foo" against "http://example.com/bar.json"
    const resolveAgainstBase = (baseUri: string, ref: string): string => {
      if (contextService) {
        return this.normalizeId(contextService.resolveRelativePath(ref, baseUri));
      }
      return this.normalizeId(ref);
    };

    // check if two URIs have the same origin (scheme + authority)
    const isSameOrigin = (uri1: string, uri2: string): boolean => {
      try {
        const parsed1 = URI.parse(uri1);
        const parsed2 = URI.parse(uri2);
        return parsed1.scheme === parsed2.scheme && parsed1.authority === parsed2.authority;
      } catch {
        return false;
      }
    };

    const getResourceIndex = (resourceUri: string): ResourceIndex => {
      let entry = resourceIndexByUri.get(resourceUri);
      if (!entry) {
        entry = { fragments: new Map<string, JSONSchema>() };
        resourceIndexByUri.set(resourceUri, entry);
      }
      return entry;
    };

    const registerSchemaResource = (resourceUri: string, node: JSONSchema): void => {
      const entry = getResourceIndex(resourceUri);
      if (!entry.root) {
        entry.root = node;
      }
    };

    const collectPlainNameFragments = (root: JSONSchema, initialBaseUri: string): void => {
      type WorkItem = { node: JSONSchema; baseUri: string };

      const seen = new Set<unknown>();
      const stack: WorkItem[] = [{ node: root, baseUri: initialBaseUri }];
      if (stripFragment(initialBaseUri) === initialBaseUri) {
        registerSchemaResource(initialBaseUri, root);
      }

      while (stack.length) {
        const current = stack.pop();
        if (!current) continue;

        const node = current.node;
        if (!node || typeof node !== 'object') continue;
        if (seen.has(node)) continue;
        seen.add(node);

        let baseUri = current.baseUri;
        const id = node.$id || node.id;
        if (id) {
          const normalizedId = resolveAgainstBase(baseUri, id);
          const hashIndex = normalizedId.indexOf('#');
          if (hashIndex !== -1 && hashIndex < normalizedId.length - 1) {
            // Draft-07 and earlier: $id with fragment defines a plain-name anchor scoped to the resolved base
            const frag = normalizedId.slice(hashIndex + 1);
            getResourceIndex(baseUri).fragments.set(frag, node);
          } else {
            // $id without fragment (e.g. $id: "other.json") creates a new resource scope (applies to all draft versions)
            baseUri = normalizedId;
            registerSchemaResource(baseUri, node);
          }
        }
        // Draft 2019-09+: $anchor keyword
        if (node.$anchor) {
          getResourceIndex(baseUri).fragments.set(node.$anchor, node);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const push = (v: any): void => {
          if (!v) return;
          if (typeof v === 'boolean') return;
          if (typeof v === 'object') stack.push({ node: v as JSONSchema, baseUri });
        };

        // arrays
        for (const k of ['allOf', 'anyOf', 'oneOf']) {
          const arr = node[k];
          if (Array.isArray(arr)) arr.forEach(push);
        }

        // singles
        for (const k of [
          'not',
          'if',
          'then',
          'else',
          'contains',
          'propertyNames',
          'additionalProperties',
          'items',
          'additionalItems',
        ]) {
          push(node[k]);
        }

        // maps
        for (const k of ['properties', 'patternProperties', 'definitions', '$defs', 'dependentSchemas']) {
          const map = node[k];
          if (map && typeof map === 'object') {
            for (const key of Object.keys(map)) push(map[key]);
          }
        }
      }
    };

    const getPlainNameFragmentsFor = (schemaRoot: JSONSchema, schemaUri: string): PlainNameFragmentMap => {
      if (!resourceIndexByUri.has(schemaUri)) {
        collectPlainNameFragments(schemaRoot, schemaUri);
      }
      return getResourceIndex(schemaUri).fragments;
    };

    // collect plain-name fragments for the root schema document
    getPlainNameFragmentsFor(schema, schemaURL);

    const findSection = (schemaRoot: JSONSchema, refPath: string, sourceURI: string): JSONSchema => {
      if (!refPath) {
        return schemaRoot;
      }

      // JSON pointer style (starts with "/")
      if (refPath[0] === '/') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let current: any = schemaRoot;
        const parts = refPath.substr(1).split('/');
        for (const part of parts) {
          current = current?.[part];
          if (!current) return undefined;
        }
        return current as JSONSchema;
      }

      // plain-name fragment -> lookup in collected fragments ($anchor or $id#fragment)
      const fragments = getPlainNameFragmentsFor(schemaRoot, sourceURI);
      return fragments.get(refPath);
    };

    const merge = (target: JSONSchema, sourceRoot: JSONSchema, sourceURI: string, refPath: string): void => {
      const section = findSection(sourceRoot, refPath, sourceURI);
      if (section) {
        for (const key in section) {
          if (Object.prototype.hasOwnProperty.call(section, key) && !Object.prototype.hasOwnProperty.call(target, key)) {
            target[key] = section[key];
          }
        }
      } else {
        resolveErrors.push(l10n.t("$ref '{0}' in '{1}' cannot be resolved.", refPath, sourceURI));
      }
    };

    const resolveExternalLink = (
      node: JSONSchema,
      uri: string,
      linkPath: string,
      parentSchemaURL: string,
      parentSchemaDependencies: SchemaDependencies
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> => {
      const resolvedUri = resolveAgainstBase(parentSchemaURL, uri);
      const embeddedSchema = resourceIndexByUri.get(resolvedUri)?.root;
      if (embeddedSchema) {
        parentSchemaDependencies[resolvedUri] = true;
        merge(node, embeddedSchema, resolvedUri, linkPath);
        node.url = resolvedUri;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return resolveRefs(node, embeddedSchema, resolvedUri, parentSchemaDependencies);
      }

      const referencedHandle = this.getOrAddSchemaHandle(resolvedUri);
      return referencedHandle.getUnresolvedSchema().then((unresolvedSchema) => {
        parentSchemaDependencies[resolvedUri] = true;
        if (unresolvedSchema.errors.length) {
          const loc = linkPath ? resolvedUri + '#' + linkPath : resolvedUri;
          resolveErrors.push(l10n.t("Problems loading reference '{0}': {1}", loc, unresolvedSchema.errors[0]));
        }
        merge(node, unresolvedSchema.schema, resolvedUri, linkPath);
        node.url = resolvedUri;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return resolveRefs(node, unresolvedSchema.schema, resolvedUri, referencedHandle.dependencies);
      });
    };

    const resolveRefs = async (
      node: JSONSchema,
      parentSchema: JSONSchema,
      parentSchemaURL: string,
      parentSchemaDependencies: SchemaDependencies
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> => {
      if (!node || typeof node !== 'object') {
        return null;
      }

      // track nodes with their base URL for $id resolution
      type WalkItem = { node: JSONSchema; baseURL: string; isRoot?: boolean };
      const toWalk: WalkItem[] = [{ node, baseURL: parentSchemaURL, isRoot: true }];
      const seen: Set<JSONSchema> = new Set();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const openPromises: Promise<any>[] = [];

      const collectEntries = (baseURL: string, ...entries: JSONSchemaRef[]): void => {
        for (const entry of entries) {
          if (typeof entry === 'object') {
            toWalk.push({ node: entry, baseURL });
          }
        }
      };
      const collectMapEntries = (baseURL: string, ...maps: Array<JSONSchemaMap | undefined>): void => {
        for (const map of maps) {
          if (typeof map === 'object') {
            for (const key in map) {
              const entry = map[key];
              if (typeof entry === 'object') {
                toWalk.push({ node: entry, baseURL });
              }
            }
          }
        }
      };
      const collectArrayEntries = (baseURL: string, ...arrays: JSONSchemaRef[][]): void => {
        for (const array of arrays) {
          if (Array.isArray(array)) {
            for (const entry of array) {
              if (typeof entry === 'object') {
                toWalk.push({ node: entry, baseURL });
              }
            }
          }
        }
      };

      // metadata/keyword that doesn't affect validation
      const REF_SIBLING_NONCONSTRAINT_KEYS = new Set([
        '$ref',
        '_$ref',
        '$schema',
        '$id',
        'id',
        '$anchor',
        '$dynamicAnchor',
        '$recursiveAnchor',
        'definitions',
        '$defs',
        '$comment',
        'title',
        'description',
        '$vocabulary',
        'examples',
        'default',
        'url',
        'closestTitle',
      ]);

      const hasRefSiblings = (node: JSONSchema): boolean => {
        for (const k of Object.keys(node)) {
          if (REF_SIBLING_NONCONSTRAINT_KEYS.has(k)) {
            continue;
          }
          return true;
        }
        return false;
      };

      /**
       * For Draft-2019+:
       *   { $ref: "...", <siblings...> }
       * becomes
       *   { allOf: [ { $ref: "..." }, <siblings...> ] }
       */
      const rewriteRefWithSiblingsToAllOf = (node: JSONSchema): void => {
        const siblings: JSONSchema = {};
        for (const k of Object.keys(node)) {
          if (!REF_SIBLING_NONCONSTRAINT_KEYS.has(k)) {
            siblings[k] = node[k];
            delete node[k];
          }
        }
        node.allOf = [{ $ref: node.$ref }, siblings];
        delete node.$ref;
      };

      const stripRefSiblings = (node: JSONSchema): void => {
        for (const k of Object.keys(node)) {
          if (!REF_SIBLING_NONCONSTRAINT_KEYS.has(k)) {
            delete node[k];
          }
        }
      };

      const handleRef = (next: JSONSchema, nodeBaseURL: string, childBaseURL: string): void => {
        const seenRefs = new Set<string>();
        while (next.$ref) {
          next._$ref = next.$ref;

          if (hasRefSiblings(next)) {
            // Draft-07 and earlier: ignore siblings
            if (schemaDialect === SchemaDialect.draft04 || schemaDialect === SchemaDialect.draft07) {
              stripRefSiblings(next);
            } else {
              // Draft-2019+: support sibling keywords
              rewriteRefWithSiblingsToAllOf(next);
              collectArrayEntries(childBaseURL, next.allOf);
              return;
            }
          }

          const ref = decodeURIComponent(next.$ref);
          const segments = ref.split('#', 2);
          delete next.$ref;

          const baseUri = segments[0];
          const frag = segments.length > 1 ? segments[1] : '';

          if (baseUri.length > 0) {
            // resolve relative to this node's base URL
            openPromises.push(resolveExternalLink(next, baseUri, frag, nodeBaseURL, parentSchemaDependencies));
            return;
          } else {
            if (!seenRefs.has(ref)) {
              // frag can be JSON pointer (starts with /) or plain anchor name
              merge(next, parentSchema, nodeBaseURL, frag);
              seenRefs.add(ref);
            }
          }
        }

        collectEntries(
          childBaseURL,
          <JSONSchema>next.items,
          next.additionalItems,
          <JSONSchema>next.additionalProperties,
          next.not,
          next.contains,
          next.propertyNames,
          next.if,
          next.then,
          next.else
        );

        collectMapEntries(
          childBaseURL,
          next.definitions,
          next.properties,
          next.patternProperties,
          <JSONSchemaMap>next.dependencies
        );
        collectArrayEntries(childBaseURL, next.anyOf, next.allOf, next.oneOf, <JSONSchema[]>next.items, next.schemaSequence);
      };

      if (parentSchemaURL.indexOf('#') > 0) {
        const segments = parentSchemaURL.split('#', 2);
        if (segments[0].length > 0 && segments[1].length > 0) {
          const newSchema = {};
          await resolveExternalLink(newSchema, segments[0], segments[1], parentSchemaURL, parentSchemaDependencies);
          for (const key in schema) {
            if (key === 'required') {
              continue;
            }
            if (Object.prototype.hasOwnProperty.call(schema, key) && !Object.prototype.hasOwnProperty.call(newSchema, key)) {
              newSchema[key] = schema[key];
            }
          }
          schema = newSchema;
        }
      }

      while (toWalk.length) {
        const item = toWalk.pop();
        const next = item.node;
        let nodeBaseURL = item.baseURL;
        if (seen.has(next)) {
          continue;
        }
        seen.add(next);

        // check if this node has $id and update base URL for resolving refs and for children
        let childBaseURL = nodeBaseURL;
        const id = next.$id || next.id;
        if (id) {
          const normalizedId = resolveAgainstBase(nodeBaseURL, id);

          // For root node with same-origin $id mismatch, keep retrieval URI
          // Otherwise, use $id as the base URI
          if (!item.isRoot || !isSameOrigin(nodeBaseURL, normalizedId)) {
            nodeBaseURL = normalizedId;
            childBaseURL = normalizedId;
          }
        }

        // collect definitions first with child base URL
        collectMapEntries(childBaseURL, next.definitions, next.$defs);

        handleRef(next, nodeBaseURL, childBaseURL);
      }
      return Promise.all(openPromises);
    };

    await resolveRefs(schema, schema, schemaURL, dependencies);
    if (schema && typeof schema === 'object') {
      schema.dialect = schemaDialect;
    }
    return new ResolvedSchema(schema, resolveErrors);
  }

  public getSchemaForResource(resource: string, doc: JSONDocument): Promise<ResolvedSchema> {
    const resolveModelineSchema = (): string | undefined => {
      let schemaFromModeline = getSchemaFromModeline(doc);
      if (schemaFromModeline !== undefined) {
        if (!schemaFromModeline.startsWith('file:') && !schemaFromModeline.startsWith('http')) {
          // If path contains a fragment and it is left intact, "#" will be
          // considered part of the filename and converted to "%23" by
          // path.resolve() -> take it out and add back after path.resolve
          let appendix = '';
          if (schemaFromModeline.indexOf('#') > 0) {
            const segments = schemaFromModeline.split('#', 2);
            schemaFromModeline = segments[0];
            appendix = segments[1];
          }
          if (!path.isAbsolute(schemaFromModeline)) {
            const resUri = URI.parse(resource);
            schemaFromModeline = URI.file(path.resolve(path.parse(resUri.fsPath).dir, schemaFromModeline)).toString();
          } else {
            schemaFromModeline = URI.file(schemaFromModeline).toString();
          }
          if (appendix.length > 0) {
            schemaFromModeline += '#' + appendix;
          }
        }
        return schemaFromModeline;
      }
    };

    const resolveSchemaForResource = (schemas: string[]): Promise<ResolvedSchema> => {
      const schemaHandle = super.createCombinedSchema(resource, schemas);
      return schemaHandle.getResolvedSchema().then((schema) => {
        return this.finalizeResolvedSchema(schema, schemaHandle.url, doc, false);
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolveSchema = async (): Promise<any> => {
      const seen: { [schemaId: string]: boolean } = Object.create(null);
      const schemas: string[] = [];
      let k8sAllSchema: ResolvedSchema = undefined;

      for (const entry of this.filePatternAssociations) {
        if (entry.matchesPattern(resource)) {
          for (const schemaId of entry.getURIs()) {
            if (!seen[schemaId]) {
              if (this.yamlSettings?.kubernetesCRDStoreEnabled && schemaId === KUBERNETES_SCHEMA_URL) {
                if (!k8sAllSchema) {
                  k8sAllSchema = await this.getResolvedSchema(KUBERNETES_SCHEMA_URL);
                }
                const kubeSchema = autoDetectKubernetesSchemaFromDocument(
                  doc,
                  this.yamlSettings.kubernetesCRDStoreUrl ?? CRD_CATALOG_URL,
                  k8sAllSchema
                );
                if (kubeSchema) {
                  schemas.push(kubeSchema);
                  seen[schemaId] = true;
                } else {
                  schemas.push(schemaId);
                  seen[schemaId] = true;
                }
              } else {
                schemas.push(schemaId);
                seen[schemaId] = true;
              }
            }
          }
        }
      }

      if (schemas.length > 0) {
        // Join all schemas with the highest priority.
        const highestPrioSchemas = this.highestPrioritySchemas(schemas);
        return resolveSchemaForResource(highestPrioSchemas);
      }

      return Promise.resolve(null);
    };
    const modelineSchema = resolveModelineSchema();
    if (modelineSchema) {
      return resolveSchemaForResource([modelineSchema]);
    }

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
                    allOf: schemas.map((schemaObj) => {
                      return schemaObj.schema;
                    }),
                  },
                };
              },
              () => {
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
          () => {
            return resolveSchema();
          }
        );
    }
    return resolveSchema();
  }

  private finalizeResolvedSchema(
    schema: ResolvedSchema,
    schemaUrl: string,
    doc: JSONDocument,
    includeErrorsForSequence: boolean
  ): ResolvedSchema {
    if (schema.schema && typeof schema.schema === 'object') {
      schema.schema.url = schemaUrl;
      if (schema.schema.schemaSequence && schema.schema.schemaSequence[(<SingleYAMLDocument>doc).currentDocIndex]) {
        const selectedSchema = schema.schema.schemaSequence[(<SingleYAMLDocument>doc).currentDocIndex];
        if (includeErrorsForSequence) {
          return new ResolvedSchema(selectedSchema, schema.errors);
        }
        return new ResolvedSchema(selectedSchema);
      }
    }
    return schema;
  }

  // Set the priority of a schema in the schema service
  public addSchemaPriority(uri: string, priority: number): void {
    let currSchemaArray = this.schemaPriorityMapping.get(uri);
    if (currSchemaArray) {
      currSchemaArray = currSchemaArray.add(priority);
      this.schemaPriorityMapping.set(uri, currSchemaArray);
    } else {
      this.schemaPriorityMapping.set(uri, new Set<SchemaPriority>().add(priority));
    }
  }

  /**
   * Search through all the schemas and find the ones with the highest priority
   */
  private highestPrioritySchemas(schemas: string[]): string[] {
    let highestPrio = 0;
    const priorityMapping = new Map<SchemaPriority, string[]>();
    schemas.forEach((schema) => {
      // If the schema does not have a priority then give it a default one of [0]
      const priority = this.schemaPriorityMapping.get(schema) || [0];
      priority.forEach((prio) => {
        if (prio > highestPrio) {
          highestPrio = prio;
        }

        // Build up a mapping of priority to schemas so that we can easily get the highest priority schemas easier
        let currPriorityArray = priorityMapping.get(prio);
        if (currPriorityArray) {
          currPriorityArray = (currPriorityArray as string[]).concat(schema);
          priorityMapping.set(prio, currPriorityArray);
        } else {
          priorityMapping.set(prio, [schema]);
        }
      });
    });
    return priorityMapping.get(highestPrio) || [];
  }

  private async resolveCustomSchema(schemaUri, doc): ResolvedSchema {
    const unresolvedSchema = await this.loadSchema(schemaUri);
    const schema = await this.resolveSchemaContent(unresolvedSchema, schemaUri, []);
    return this.finalizeResolvedSchema(schema, schemaUri, doc, true);
  }

  /**
   * Save a schema with schema ID and schema content.
   * Overrides previous schemas set for that schema ID.
   */
  public async saveSchema(schemaId: string, schemaContent: JSONSchema): Promise<void> {
    const id = this.normalizeId(schemaId);
    this.getOrAddSchemaHandle(id, schemaContent);
    this.schemaPriorityMapping.set(id, new Set<SchemaPriority>().add(SchemaPriority.Settings));
    return Promise.resolve(undefined);
  }

  /**
   * Delete schemas on specific path
   */
  public async deleteSchemas(deletions: SchemaDeletionsAll): Promise<void> {
    deletions.schemas.forEach((s) => {
      this.deleteSchema(s);
    });
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
    this.schemaPriorityMapping.delete(id);
    return Promise.resolve(undefined);
  }

  /**
   * Add content to a specified schema at a specified path
   */
  public async addContent(additions: SchemaAdditions): Promise<void> {
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
  public async deleteContent(deletions: SchemaDeletions): Promise<void> {
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
  private resolveNext(object: any, token: any): void {
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

  normalizeId(id: string): string {
    // The parent's `super.normalizeId(id)` isn't visible, so duplicated the code here
    try {
      return URI.parse(id).toString();
    } catch (e) {
      return id;
    }
  }

  getOrAddSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): SchemaHandle {
    return super.getOrAddSchemaHandle(id, unresolvedSchemaContent);
  }

  loadSchema(schemaUri: string): Promise<UnresolvedSchema> {
    const requestService = this.requestService;
    return super.loadSchema(schemaUri).then(async (unresolvedJsonSchema: UnresolvedSchema) => {
      // If json-language-server failed to parse the schema, attempt to parse it as YAML instead.
      // If the YAML file starts with %YAML 1.x or contains a comment with a number the schema will
      // contain a number instead of being undefined, so we need to check for that too.
      if (
        unresolvedJsonSchema.errors &&
        (unresolvedJsonSchema.schema === undefined || typeof unresolvedJsonSchema.schema === 'number')
      ) {
        return requestService(schemaUri).then(
          (content) => {
            if (!content) {
              const errorMessage = l10n.t(
                "Unable to load schema from '{0}': No content. {1}",
                toDisplayString(schemaUri),
                unresolvedJsonSchema.errors
              );
              return new UnresolvedSchema(<JSONSchema>{}, [errorMessage]);
            }

            try {
              const schemaContent = parse(content);
              return new UnresolvedSchema(schemaContent, []);
            } catch (yamlError) {
              const errorMessage = l10n.t("Unable to parse content from '{0}': {1}.", toDisplayString(schemaUri), yamlError);
              return new UnresolvedSchema(<JSONSchema>{}, [errorMessage]);
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (error: any) => {
            let errorMessage = error.toString();
            const errorSplit = error.toString().split('Error: ');
            if (errorSplit.length > 1) {
              // more concise error message, URL and context are attached by caller anyways
              errorMessage = errorSplit[1];
            }
            return new UnresolvedSchema(<JSONSchema>{}, [errorMessage]);
          }
        );
      }
      unresolvedJsonSchema.uri = schemaUri;
      if (this.schemaUriToNameAndDescription.has(schemaUri)) {
        const { name, description, versions } = this.schemaUriToNameAndDescription.get(schemaUri);
        unresolvedJsonSchema.schema.title = name ?? unresolvedJsonSchema.schema.title;
        unresolvedJsonSchema.schema.description = description ?? unresolvedJsonSchema.schema.description;
        unresolvedJsonSchema.schema.versions = versions ?? unresolvedJsonSchema.schema.versions;
      } else if (unresolvedJsonSchema.errors && unresolvedJsonSchema.errors.length > 0) {
        let errorMessage: string = unresolvedJsonSchema.errors[0];
        if (errorMessage.toLowerCase().indexOf('load') !== -1) {
          errorMessage = l10n.t("Unable to load schema from '{0}': No content.", toDisplayString(schemaUri));
        } else if (errorMessage.toLowerCase().indexOf('parse') !== -1) {
          const content = await requestService(schemaUri);
          const jsonErrors: Json.ParseError[] = [];
          const schemaContent = Json.parse(content, jsonErrors);
          if (jsonErrors.length && schemaContent) {
            const { offset } = jsonErrors[0];
            const { line, column } = getLineAndColumnFromOffset(content, offset);
            errorMessage = l10n.t(
              "Unable to parse content from '{0}': Parse error at line: {1} column: {2}",
              toDisplayString(schemaUri),
              line,
              column
            );
          }
        }
        return new UnresolvedSchema(<JSONSchema>{}, [errorMessage]);
      }
      return unresolvedJsonSchema;
    });
  }

  registerExternalSchema(
    uri: string,
    filePatterns?: string[],
    unresolvedSchema?: JSONSchema,
    name?: string,
    description?: string,
    versions?: SchemaVersions
  ): SchemaHandle {
    if (name || description) {
      this.schemaUriToNameAndDescription.set(uri, { name, description, versions });
    }
    return super.registerExternalSchema(uri, filePatterns, unresolvedSchema);
  }

  clearExternalSchemas(): void {
    super.clearExternalSchemas();
  }

  setSchemaContributions(schemaContributions: ISchemaContributions): void {
    super.setSchemaContributions(schemaContributions);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRegisteredSchemaIds(filter?: (scheme: any) => boolean): string[] {
    return super.getRegisteredSchemaIds(filter);
  }

  getResolvedSchema(schemaId: string): Promise<ResolvedSchema> {
    return super.getResolvedSchema(schemaId);
  }

  onResourceChange(uri: string): boolean {
    return super.onResourceChange(uri);
  }
}

function toDisplayString(url: string): string {
  try {
    const uri = URI.parse(url);
    if (uri.scheme === 'file') {
      return uri.fsPath;
    }
  } catch (e) {
    // ignore
  }
  return url;
}

function getLineAndColumnFromOffset(text: string, offset: number): { line: number; column: number } {
  const lines = text.slice(0, offset).split(/\r?\n/);
  const line = lines.length; // 1-based line number
  const column = lines[lines.length - 1].length + 1; // 1-based column number
  return { line, column };
}

function normalizeSchemaUri(uri: string | AnySchemaObject): string {
  if (!uri) return '';

  let s: string;
  if (typeof uri === 'string') {
    s = uri;
  } else {
    s = uri.$id || uri.id || '';
  }
  s = s.trim();

  // strips fragment (# or #/something)
  const hash = s.indexOf('#');

  s = hash === -1 ? s : s.slice(0, hash);

  // normalize http to https (don't normalize custom dialects)
  s = s.replace(/^http:\/\/json-schema\.org\//i, 'https://json-schema.org/');

  // normalize to no trailing slash
  s = s.replace(/\/+$/g, '');
  return s;
}

function knownDialectFromSchemaUri(schemaUri?: string): SchemaDialect {
  if (schemaUri === normalizeSchemaUri(ajv4.defaultMeta())) return SchemaDialect.draft04;
  if (schemaUri === normalizeSchemaUri(ajv7.defaultMeta())) return SchemaDialect.draft07;
  if (schemaUri === normalizeSchemaUri(ajv2019.defaultMeta())) return SchemaDialect.draft2019;
  if (schemaUri === normalizeSchemaUri(ajv2020.defaultMeta())) return SchemaDialect.draft2020;
  return SchemaDialect.undefined;
}

async function pickSchemaDialect(
  $schema: string | undefined,
  loadSchema: (uri: string) => Promise<UnresolvedSchema>
): Promise<SchemaDialect> {
  if (!$schema) return SchemaDialect.undefined;
  const s = normalizeSchemaUri($schema || '');

  const dialect = knownDialectFromSchemaUri(s);
  if (dialect !== SchemaDialect.undefined) return dialect;

  // cache custom dialect result
  const cached = schemaDialectCache.get(s);
  if (cached) {
    return cached;
  }
  const inflight = schemaDialectInFlight.get(s);
  if (inflight) {
    return inflight;
  }

  // resolve custom dialect: load the dialect meta-schema doc and infer base dialect from its $schema
  const promise = (async () => {
    const meta = await loadSchema(s);
    if (meta.errors?.length) {
      return SchemaDialect.undefined;
    }
    const metaSchema = meta.schema;
    if (!metaSchema || typeof metaSchema !== 'object') {
      return SchemaDialect.undefined;
    }
    const metaDialect = knownDialectFromSchemaUri(metaSchema.$schema);
    if (metaDialect !== SchemaDialect.undefined) return metaDialect;
    return SchemaDialect.undefined;
  })();

  schemaDialectInFlight.set(s, promise);
  try {
    const result = await promise;
    schemaDialectCache.set(s, result);
    return result;
  } finally {
    schemaDialectInFlight.delete(s);
  }
}

function pickMetaValidator(dialect: SchemaDialect): ValidateFunction | undefined {
  switch (dialect) {
    case SchemaDialect.draft04:
      return schema04Validator;
    case SchemaDialect.draft07:
      return schema07Validator;
    case SchemaDialect.draft2019:
      return schema2019Validator;
    case SchemaDialect.draft2020:
      return schema2020Validator;
    default:
      // don't meta-validate unknown schema URI
      return undefined;
  }
}
