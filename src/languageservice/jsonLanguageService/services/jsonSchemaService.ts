/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Forked from vscode-json-languageservice@6.0.0-next.1
// Source: https://github.com/microsoft/vscode-json-languageservice/blob/810471bbb462bb6b87351c2232e209a3bb4062ca/src/services/jsonSchemaService.ts

import * as Json from 'jsonc-parser';
import { JSONSchema, JSONSchemaMap, JSONSchemaRef } from '../../jsonSchema';
import { URI } from 'vscode-uri';
import * as Strings from '../utils/strings';
import { asSchema, getSchemaDraftFromId, JSONDocument, normalizeId } from '../parser/jsonParser';
import {
  SchemaRequestService,
  WorkspaceContextService,
  PromiseConstructor,
  MatchingSchema,
  TextDocument,
  SchemaConfiguration,
  SchemaDraft,
  ErrorCode,
} from '../jsonLanguageTypes';

import * as l10n from '@vscode/l10n';
import { createRegex } from '../utils/glob';
import { isObject, isString } from '../utils/objects';
import { DiagnosticRelatedInformation, Range } from 'vscode-languageserver-types';

export interface IJSONSchemaService {
  /**
   * Clears all cached schema files
   */
  clearExternalSchemas(): void;

  /**
   * Registers contributed schemas
   */
  setSchemaContributions(schemaContributions: ISchemaContributions): void;

  /**
   * Looks up the appropriate schema for the given URI
   */
  getSchemaForResource(resource: string, document?: JSONDocument): PromiseLike<ResolvedSchema | undefined>;

  /**
   * Returns all registered schema ids
   */
  getRegisteredSchemaIds(filter?: (scheme: string) => boolean): string[];
}

export interface SchemaAssociation {
  pattern: string[];
  uris: string[];
  folderUri?: string;
}

export interface ISchemaContributions {
  schemas?: { [id: string]: JSONSchema };
  schemaAssociations?: SchemaAssociation[];
}

export interface ISchemaHandle {
  /**
   * The schema id
   */
  uri: string;

  /**
   * The schema from the file, with potential $ref references
   */
  getUnresolvedSchema(): PromiseLike<UnresolvedSchema>;

  /**
   * The schema from the file, with references resolved
   */
  getResolvedSchema(): PromiseLike<ResolvedSchema>;
}

const BANG = '!';
const PATH_SEP = '/';

interface IGlobWrapper {
  regexp: RegExp;
  include: boolean;
}

class FilePatternAssociation {
  private readonly globWrappers: IGlobWrapper[];

  constructor(
    pattern: string[],
    private readonly folderUri: string | undefined,
    public readonly uris: string[]
  ) {
    this.globWrappers = [];
    try {
      for (let patternString of pattern) {
        const include = patternString[0] !== BANG;
        if (!include) {
          patternString = patternString.substring(1);
        }
        if (patternString.length > 0) {
          if (patternString[0] === PATH_SEP) {
            patternString = patternString.substring(1);
          }
          this.globWrappers.push({
            regexp: createRegex(patternString, { extended: true, globstar: true }),
            include: include,
          });
          this.globWrappers.push({
            regexp: createRegex('**/' + patternString, { extended: true, globstar: true }),
            include: include,
          });
        }
      }
      if (folderUri) {
        folderUri = normalizeResourceForMatching(folderUri);
        if (!folderUri.endsWith('/')) {
          folderUri = folderUri + '/';
        }
        this.folderUri = folderUri;
      }
    } catch {
      this.globWrappers.length = 0;
      this.uris = [];
    }
  }

  public matchesPattern(fileName: string): boolean {
    if (this.folderUri && !fileName.startsWith(this.folderUri)) {
      return false;
    }
    let match = false;
    for (const { regexp, include } of this.globWrappers) {
      if (regexp.test(fileName)) {
        match = include;
      }
    }
    return match;
  }

  public getURIs(): string[] {
    return this.uris;
  }
}

export type SchemaDependencies = { [uri: string]: boolean };

export class SchemaHandle implements ISchemaHandle {
  public readonly uri: string;
  public dependencies: SchemaDependencies;
  public anchors: Map<string, JSONSchema> | undefined;
  private resolvedSchema: PromiseLike<ResolvedSchema> | undefined;
  private unresolvedSchema: PromiseLike<UnresolvedSchema> | undefined;
  private readonly service: JSONSchemaService;

  constructor(service: JSONSchemaService, uri: string, unresolvedSchemaContent?: JSONSchema) {
    this.service = service;
    this.uri = uri;
    this.dependencies = {};
    this.anchors = undefined;
    if (unresolvedSchemaContent) {
      this.unresolvedSchema = this.service.promise.resolve(new UnresolvedSchema(unresolvedSchemaContent));
    }
  }

  public getUnresolvedSchema(): PromiseLike<UnresolvedSchema> {
    if (!this.unresolvedSchema) {
      this.unresolvedSchema = this.service.loadSchema(this.uri);
    }
    return this.unresolvedSchema;
  }

  public getResolvedSchema(): PromiseLike<ResolvedSchema> {
    if (!this.resolvedSchema) {
      this.resolvedSchema = this.getUnresolvedSchema().then((unresolved) => {
        return this.service.resolveSchemaContent(unresolved, this.uri, this.dependencies);
      });
    }
    return this.resolvedSchema;
  }

  public clearSchema(): boolean {
    const hasChanges = !!this.unresolvedSchema;
    this.resolvedSchema = undefined;
    this.unresolvedSchema = undefined;
    this.dependencies = {};
    this.anchors = undefined;
    return hasChanges;
  }
}

export class UnresolvedSchema {
  public readonly schema: JSONSchema;
  public readonly errors: SchemaDiagnostic[];
  public uri?: string;

  constructor(schema: JSONSchema, errors: SchemaDiagnostic[] = []) {
    this.schema = schema;
    this.errors = errors;
  }
}

export type SchemaDiagnostic = {
  readonly message: string;
  readonly code: ErrorCode;
  relatedInformation?: DiagnosticRelatedInformation[];
};

export function toDiagnostic(message: string, code: ErrorCode, relatedURL?: string): SchemaDiagnostic {
  const relatedInformation: DiagnosticRelatedInformation[] | undefined = relatedURL
    ? [
        {
          location: { uri: relatedURL, range: Range.create(0, 0, 0, 0) },
          message,
        },
      ]
    : undefined;
  return { message, code, relatedInformation };
}

export class ResolvedSchema {
  public readonly schema: JSONSchema;
  public readonly errors: SchemaDiagnostic[];
  public readonly warnings: SchemaDiagnostic[];
  public readonly schemaDraft: SchemaDraft | undefined;

  constructor(schema: JSONSchema, errors: SchemaDiagnostic[] = [], warnings: SchemaDiagnostic[] = [], schemaDraft?: SchemaDraft) {
    this.schema = schema;
    this.errors = errors;
    this.warnings = warnings;
    this.schemaDraft = schemaDraft;
  }

  public getSection(path: string[]): JSONSchema | undefined {
    const schemaRef = this.getSectionRecursive(path, this.schema);
    if (schemaRef) {
      return asSchema(schemaRef);
    }
    return undefined;
  }

  private getSectionRecursive(path: string[], schema: JSONSchemaRef): JSONSchemaRef | undefined {
    if (!schema || typeof schema === 'boolean' || path.length === 0) {
      return schema;
    }
    const next = path.shift()!;

    if (schema.properties && typeof schema.properties[next]) {
      return this.getSectionRecursive(path, schema.properties[next]);
    } else if (schema.patternProperties) {
      for (const pattern of Object.keys(schema.patternProperties)) {
        const regex = Strings.extendedRegExp(pattern);
        if (regex?.test(next)) {
          return this.getSectionRecursive(path, schema.patternProperties[pattern]);
        }
      }
    } else if (typeof schema.additionalProperties === 'object') {
      return this.getSectionRecursive(path, schema.additionalProperties);
    } else if (next.match('[0-9]+')) {
      if (Array.isArray(schema.items)) {
        const index = parseInt(next, 10);
        if (!isNaN(index) && schema.items[index]) {
          return this.getSectionRecursive(path, schema.items[index]);
        }
      } else if (schema.items) {
        return this.getSectionRecursive(path, schema.items);
      }
    }

    return undefined;
  }
}

export class JSONSchemaService implements IJSONSchemaService {
  protected contributionSchemas: { [id: string]: SchemaHandle };
  protected contributionAssociations: FilePatternAssociation[];

  protected schemasById: { [id: string]: SchemaHandle };
  protected filePatternAssociations: FilePatternAssociation[];
  protected registeredSchemasIds: { [id: string]: boolean };

  protected contextService: WorkspaceContextService | undefined;
  protected callOnDispose: (() => void)[];
  protected requestService: SchemaRequestService | undefined;
  protected promiseConstructor: PromiseConstructor;

  private cachedSchemaForResource: { resource: string; resolvedSchema: PromiseLike<ResolvedSchema | undefined> } | undefined;

  constructor(
    requestService?: SchemaRequestService,
    contextService?: WorkspaceContextService,
    promiseConstructor?: PromiseConstructor
  ) {
    this.contextService = contextService;
    this.requestService = requestService;
    this.promiseConstructor = promiseConstructor || Promise;
    this.callOnDispose = [];

    this.contributionSchemas = {};
    this.contributionAssociations = [];
    this.schemasById = {};
    this.filePatternAssociations = [];
    this.registeredSchemasIds = {};
  }

  public getRegisteredSchemaIds(filter?: (scheme: string) => boolean): string[] {
    return Object.keys(this.registeredSchemasIds).filter((id) => {
      const scheme = URI.parse(id).scheme;
      return scheme !== 'schemaservice' && (!filter || filter(scheme));
    });
  }

  public get promise(): PromiseConstructor {
    return this.promiseConstructor;
  }

  public dispose(): void {
    while (this.callOnDispose.length > 0) {
      this.callOnDispose.pop()!();
    }
  }

  public onResourceChange(uri: string): boolean {
    // always clear this local cache when a resource changes
    this.cachedSchemaForResource = undefined;

    let hasChanges = false;
    uri = normalizeId(uri);

    const toWalk = [uri];
    const all: (SchemaHandle | undefined)[] = Object.keys(this.schemasById).map((key) => this.schemasById[key]);

    while (toWalk.length) {
      const curr = toWalk.pop()!;
      for (let i = 0; i < all.length; i++) {
        const handle = all[i];
        if (handle && (handle.uri === curr || handle.dependencies[curr])) {
          if (handle.uri !== curr) {
            toWalk.push(handle.uri);
          }
          if (handle.clearSchema()) {
            hasChanges = true;
          }
          all[i] = undefined;
        }
      }
    }
    return hasChanges;
  }

  public setSchemaContributions(schemaContributions: ISchemaContributions): void {
    if (schemaContributions.schemas) {
      const schemas = schemaContributions.schemas;
      for (const id in schemas) {
        const normalizedId = normalizeId(id);
        this.contributionSchemas[normalizedId] = this.addSchemaHandle(normalizedId, schemas[id]);
      }
    }
    if (Array.isArray(schemaContributions.schemaAssociations)) {
      const schemaAssociations = schemaContributions.schemaAssociations;
      for (const schemaAssociation of schemaAssociations) {
        const uris = schemaAssociation.uris.map(normalizeId);
        const association = this.addFilePatternAssociation(schemaAssociation.pattern, schemaAssociation.folderUri, uris);
        this.contributionAssociations.push(association);
      }
    }
  }

  protected addSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): SchemaHandle {
    const schemaHandle = new SchemaHandle(this, id, unresolvedSchemaContent);
    this.schemasById[id] = schemaHandle;
    return schemaHandle;
  }

  protected getOrAddSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): SchemaHandle {
    return this.schemasById[id] || this.addSchemaHandle(id, unresolvedSchemaContent);
  }

  protected addFilePatternAssociation(pattern: string[], folderUri: string | undefined, uris: string[]): FilePatternAssociation {
    const fpa = new FilePatternAssociation(pattern, folderUri, uris);
    this.filePatternAssociations.push(fpa);
    return fpa;
  }

  public registerExternalSchema(
    config: SchemaConfiguration | string,
    filePatterns?: string[],
    unresolvedSchemaContent?: JSONSchema
  ): SchemaHandle {
    if (typeof config === 'string') {
      config = { uri: config, fileMatch: filePatterns, schema: unresolvedSchemaContent };
    }
    const id = normalizeId(config.uri);
    this.registeredSchemasIds[id] = true;
    this.cachedSchemaForResource = undefined;

    if (config.fileMatch && config.fileMatch.length) {
      this.addFilePatternAssociation(config.fileMatch, config.folderUri, [id]);
    }
    return config.schema ? this.addSchemaHandle(id, config.schema) : this.getOrAddSchemaHandle(id);
  }

  public clearExternalSchemas(): void {
    this.schemasById = {};
    this.filePatternAssociations = [];
    this.registeredSchemasIds = {};
    this.cachedSchemaForResource = undefined;

    for (const id in this.contributionSchemas) {
      this.schemasById[id] = this.contributionSchemas[id];
      this.registeredSchemasIds[id] = true;
    }
    for (const contributionAssociation of this.contributionAssociations) {
      this.filePatternAssociations.push(contributionAssociation);
    }
  }

  public getResolvedSchema(schemaId: string): PromiseLike<ResolvedSchema | undefined> {
    const id = normalizeId(schemaId);
    const schemaHandle = this.schemasById[id];
    if (schemaHandle) {
      return schemaHandle.getResolvedSchema();
    }
    return this.promise.resolve(undefined);
  }

  public loadSchema(url: string): PromiseLike<UnresolvedSchema> {
    if (!this.requestService) {
      const errorMessage = l10n.t("Unable to load schema from '{0}'. No schema request service available", toDisplayString(url));
      return this.promise.resolve(
        new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, ErrorCode.SchemaResolveError, url)])
      );
    }
    return this.requestService(url).then(
      (content) => {
        if (!content) {
          const errorMessage = l10n.t("Unable to load schema from '{0}': No content.", toDisplayString(url));
          return new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, ErrorCode.SchemaResolveError, url)]);
        }
        const errors = [];
        if (content.charCodeAt(0) === 65279) {
          errors.push(
            toDiagnostic(
              l10n.t("Problem reading content from '{0}': UTF-8 with BOM detected, only UTF 8 is allowed.", toDisplayString(url)),
              ErrorCode.SchemaResolveError,
              url
            )
          );
          content = content.trimStart();
        }

        let schemaContent: JSONSchema = {};
        const jsonErrors: Json.ParseError[] = [];
        schemaContent = Json.parse(content, jsonErrors);
        if (jsonErrors.length) {
          errors.push(
            toDiagnostic(
              l10n.t(
                "Unable to parse content from '{0}': Parse error at offset {1}.",
                toDisplayString(url),
                jsonErrors[0].offset
              ),
              ErrorCode.SchemaResolveError,
              url
            )
          );
        }
        return new UnresolvedSchema(schemaContent, errors);
      },
      (error) => {
        let { message } = error;
        const { code } = error;
        if (typeof message !== 'string') {
          let errorString = error.toString() as string;
          const errorSplit = error.toString().split('Error: ');
          if (errorSplit.length > 1) {
            // more concise error message, URL and context are attached by caller anyways
            errorString = errorSplit[1];
          }
          if (Strings.endsWith(errorString, '.')) {
            errorString = errorString.substr(0, errorString.length - 1);
          }
          message = errorString;
        }
        const errorCode = ErrorCode.SchemaResolveError + (typeof code === 'number' && code < 0x10000 ? code : 0);
        const errorMessage = l10n.t("Unable to load schema from '{0}': {1}.", toDisplayString(url), message);
        return new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, errorCode, url)]);
      }
    );
  }

  public resolveSchemaContent(
    schemaToResolve: UnresolvedSchema,
    schemaURL: string,
    dependencies: SchemaDependencies
  ): PromiseLike<ResolvedSchema> {
    const handle = this.getOrAddSchemaHandle(schemaURL);
    handle.dependencies = dependencies;

    const resolveErrors: SchemaDiagnostic[] = schemaToResolve.errors.slice(0);
    const schema = schemaToResolve.schema;

    const schemaDraft = schema.$schema ? getSchemaDraftFromId(schema.$schema) : undefined;
    if (schemaDraft === SchemaDraft.v3) {
      return this.promise.resolve(
        new ResolvedSchema(
          {},
          [toDiagnostic(l10n.t('Draft-03 schemas are not supported.'), ErrorCode.SchemaUnsupportedFeature)],
          [],
          schemaDraft
        )
      );
    }

    const usesUnsupportedFeatures = new Set();

    const contextService = this.contextService;

    const findSectionByJSONPointer = (schema: JSONSchema, path: string): unknown => {
      path = decodeURIComponent(path);
      let current = schema;
      if (path[0] === '/') {
        path = path.substring(1);
      }
      path.split('/').some((part) => {
        part = part.replace(/~1/g, '/').replace(/~0/g, '~');
        current = current[part];
        return !current;
      });
      return current;
    };

    const collectAnchors = (root: JSONSchema): Map<string, JSONSchema> => {
      const result = new Map<string, JSONSchema>();
      this.traverseNodes(root, (next) => {
        const id = next.$id || next.id;
        const anchor = isString(id) && id.charAt(0) === '#' ? id.substring(1) : next.$anchor;
        if (anchor) {
          if (result.has(anchor)) {
            resolveErrors.push(toDiagnostic(l10n.t("Duplicate anchor declaration: '{0}'", anchor), ErrorCode.SchemaResolveError));
          } else {
            result.set(anchor, next);
          }
        }
        if (next.$recursiveAnchor) {
          usesUnsupportedFeatures.add('$recursiveAnchor');
        }
        if (next.$dynamicAnchor) {
          usesUnsupportedFeatures.add('$dynamicAnchor');
        }
      });
      return result;
    };

    const findSchemaById = (schema: JSONSchema, handle: SchemaHandle, id: string): JSONSchema | undefined => {
      if (!handle.anchors) {
        handle.anchors = collectAnchors(schema);
      }
      return handle.anchors.get(id);
    };

    const merge = (target: JSONSchema, section: JSONSchema): void => {
      for (const key in section) {
        if (Object.prototype.hasOwnProperty.call(section, key) && key !== 'id' && key !== '$id') {
          (target as Record<string, unknown>)[key] = (section as Record<string, unknown>)[key];
        }
      }
    };

    const mergeRef = (
      target: JSONSchema,
      sourceRoot: JSONSchema,
      sourceHandle: SchemaHandle,
      refSegment: string | undefined
    ): void => {
      let section;
      if (refSegment === undefined || refSegment.length === 0) {
        section = sourceRoot;
      } else if (refSegment.charAt(0) === '/') {
        // A $ref to a JSON Pointer (i.e #/definitions/foo)
        section = findSectionByJSONPointer(sourceRoot, refSegment);
      } else {
        // A $ref to a sub-schema with an $id (i.e #hello)
        section = findSchemaById(sourceRoot, sourceHandle, refSegment);
      }
      if (section) {
        merge(target, section);
      } else {
        const message = l10n.t("$ref '{0}' in '{1}' can not be resolved.", refSegment || '', sourceHandle.uri);
        resolveErrors.push(toDiagnostic(message, ErrorCode.SchemaResolveError));
      }
    };

    const resolveExternalLink = (
      node: JSONSchema,
      uri: string,
      refSegment: string | undefined,
      parentHandle: SchemaHandle
    ): PromiseLike<unknown> => {
      if (contextService && !/^[A-Za-z][A-Za-z0-9+\-.+]*:\/.*/.test(uri)) {
        uri = contextService.resolveRelativePath(uri, parentHandle.uri);
      }
      uri = normalizeId(uri);
      const referencedHandle = this.getOrAddSchemaHandle(uri);
      return referencedHandle.getUnresolvedSchema().then((unresolvedSchema) => {
        parentHandle.dependencies[uri] = true;
        if (unresolvedSchema.errors.length) {
          const error = unresolvedSchema.errors[0];
          const errorMessage = refSegment
            ? l10n.t("Problems loading reference '{0}': {1}", refSegment, error.message)
            : error.message;
          resolveErrors.push(toDiagnostic(errorMessage, error.code, uri));
        }
        mergeRef(node, unresolvedSchema.schema, referencedHandle, refSegment);
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return resolveRefs(node, unresolvedSchema.schema, referencedHandle);
      });
    };

    const resolveRefs = (node: JSONSchema, parentSchema: JSONSchema, parentHandle: SchemaHandle): PromiseLike<unknown[]> => {
      const openPromises: PromiseLike<unknown>[] = [];

      this.traverseNodes(node, (next) => {
        const seenRefs = new Set<string>();
        while (next.$ref) {
          const ref = next.$ref;
          const segments = ref.split('#', 2);
          delete next.$ref;
          if (segments[0].length > 0) {
            // This is a reference to an external schema
            openPromises.push(resolveExternalLink(next, segments[0], segments[1], parentHandle));
            return;
          } else {
            // This is a reference inside the current schema
            if (!seenRefs.has(ref)) {
              const id = segments[1];
              mergeRef(next, parentSchema, parentHandle, id);
              seenRefs.add(ref);
            }
          }
        }
        if (next.$recursiveRef) {
          usesUnsupportedFeatures.add('$recursiveRef');
        }
        if (next.$dynamicRef) {
          usesUnsupportedFeatures.add('$dynamicRef');
        }
      });

      return this.promise.all(openPromises);
    };

    return resolveRefs(schema, schema, handle).then(() => {
      const resolveWarnings: SchemaDiagnostic[] = [];
      if (usesUnsupportedFeatures.size) {
        resolveWarnings.push(
          toDiagnostic(
            l10n.t(
              'The schema uses meta-schema features ({0}) that are not yet supported by the validator.',
              Array.from(usesUnsupportedFeatures.keys()).join(', ')
            ),
            ErrorCode.SchemaUnsupportedFeature
          )
        );
      }
      return new ResolvedSchema(schema, resolveErrors, resolveWarnings, schemaDraft);
    });
  }

  protected traverseNodes(root: JSONSchema, handle: (node: JSONSchema) => void): void {
    if (!root || typeof root !== 'object') {
      return;
    }
    const seen = new Set<JSONSchema>();
    const toWalk: JSONSchema[] = [root];

    const collectEntries = (...entries: (JSONSchemaRef | undefined)[]): void => {
      for (const entry of entries) {
        if (isObject(entry)) {
          toWalk.push(entry);
        }
      }
    };
    const collectMapEntries = (...maps: (JSONSchemaMap | undefined)[]): void => {
      for (const map of maps) {
        if (isObject(map)) {
          for (const k in map) {
            const key = k as keyof JSONSchemaMap;
            const entry = map[key];
            if (isObject(entry)) {
              toWalk.push(entry);
            }
          }
        }
      }
    };
    const collectArrayEntries = (...arrays: (JSONSchemaRef[] | undefined)[]): void => {
      for (const array of arrays) {
        if (Array.isArray(array)) {
          for (const entry of array) {
            if (isObject(entry)) {
              toWalk.push(entry);
            }
          }
        }
      }
    };
    const collectEntryOrArrayEntries = (items: JSONSchemaRef[] | JSONSchemaRef | undefined): void => {
      if (Array.isArray(items)) {
        for (const entry of items) {
          if (isObject(entry)) {
            toWalk.push(entry);
          }
        }
      } else if (isObject(items)) {
        toWalk.push(items);
      }
    };

    let next = toWalk.pop();
    while (next) {
      if (!seen.has(next)) {
        seen.add(next);
        handle(next);
        collectEntries(
          next.additionalItems,
          next.additionalProperties,
          next.not,
          next.contains,
          next.propertyNames,
          next.if,
          next.then,
          next.else,
          next.unevaluatedItems,
          next.unevaluatedProperties
        );
        collectMapEntries(
          next.definitions,
          next.$defs,
          next.properties,
          next.patternProperties,
          <JSONSchemaMap>next.dependencies,
          next.dependentSchemas
        );
        collectArrayEntries(next.anyOf, next.allOf, next.oneOf, next.prefixItems);
        collectEntryOrArrayEntries(next.items);
      }
      next = toWalk.pop();
    }
  }

  private getSchemaFromProperty(resource: string, document: JSONDocument): string | undefined {
    if (document.root?.type === 'object') {
      for (const p of document.root.properties) {
        if (p.keyNode.value === '$schema' && p.valueNode?.type === 'string') {
          let schemaId = p.valueNode.value;
          if (this.contextService && !/^\w[\w\d+.-]*:/.test(schemaId)) {
            // has scheme
            schemaId = this.contextService.resolveRelativePath(schemaId, resource);
          }
          return schemaId;
        }
      }
    }
    return undefined;
  }

  private getAssociatedSchemas(resource: string): string[] {
    const seen: { [schemaId: string]: boolean } = Object.create(null);
    const schemas: string[] = [];
    const normalizedResource = normalizeResourceForMatching(resource);
    for (const entry of this.filePatternAssociations) {
      if (entry.matchesPattern(normalizedResource)) {
        for (const schemaId of entry.getURIs()) {
          if (!seen[schemaId]) {
            schemas.push(schemaId);
            seen[schemaId] = true;
          }
        }
      }
    }
    return schemas;
  }

  public getSchemaURIsForResource(resource: string, document?: JSONDocument): string[] {
    const schemeId = document && this.getSchemaFromProperty(resource, document);
    if (schemeId) {
      return [schemeId];
    }
    return this.getAssociatedSchemas(resource);
  }

  public getSchemaForResource(resource: string, document?: JSONDocument): PromiseLike<ResolvedSchema | undefined> {
    if (document) {
      // first use $schema if present
      const schemeId = this.getSchemaFromProperty(resource, document);
      if (schemeId) {
        const id = normalizeId(schemeId);
        return this.getOrAddSchemaHandle(id).getResolvedSchema();
      }
    }
    if (this.cachedSchemaForResource && this.cachedSchemaForResource.resource === resource) {
      return this.cachedSchemaForResource.resolvedSchema;
    }
    const schemas = this.getAssociatedSchemas(resource);
    const resolvedSchema =
      schemas.length > 0 ? this.createCombinedSchema(resource, schemas).getResolvedSchema() : this.promise.resolve(undefined);
    this.cachedSchemaForResource = { resource, resolvedSchema };
    return resolvedSchema;
  }

  protected createCombinedSchema(resource: string, schemaIds: string[]): SchemaHandle {
    if (schemaIds.length === 1) {
      return this.getOrAddSchemaHandle(schemaIds[0]);
    } else {
      const combinedSchemaId = 'schemaservice://combinedSchema/' + encodeURIComponent(resource);
      const combinedSchema: JSONSchema = {
        allOf: schemaIds.map((schemaId) => ({ $ref: schemaId })),
      };
      return this.addSchemaHandle(combinedSchemaId, combinedSchema);
    }
  }

  public getMatchingSchemas(
    document: TextDocument,
    jsonDocument: JSONDocument,
    schema?: JSONSchema
  ): PromiseLike<MatchingSchema[]> {
    if (schema) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      const id = schema.id || 'schemaservice://untitled/matchingSchemas/' + idCounter++;
      const handle = this.addSchemaHandle(id, schema);
      return handle.getResolvedSchema().then((resolvedSchema) => {
        return jsonDocument.getMatchingSchemas(resolvedSchema.schema).filter((s) => !s.inverted);
      });
    }
    return this.getSchemaForResource(document.uri, jsonDocument).then((schema) => {
      if (schema) {
        return jsonDocument.getMatchingSchemas(schema.schema).filter((s) => !s.inverted);
      }
      return [];
    });
  }
}

let idCounter = 0;

function normalizeResourceForMatching(resource: string): string {
  // remove queries and fragments, normalize drive capitalization
  try {
    return URI.parse(resource).with({ fragment: null, query: null }).toString(true);
  } catch {
    return resource;
  }
}

function toDisplayString(url: string): string {
  try {
    const uri = URI.parse(url);
    if (uri.scheme === 'file') {
      return uri.fsPath;
    }
  } catch {
    // ignore
  }
  return url;
}
