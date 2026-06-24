/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AnySchemaObject, DefinedError, ErrorObject, ValidateFunction } from 'ajv';
import type { Localize } from 'ajv-i18n/localize/types';
import type { DiagnosticRelatedInformation } from 'vscode-languageserver-types';

import type { JSONSchemaDescription, JSONSchemaDescriptionExt } from '../../requestTypes';
import type { SettingsState } from '../../yamlSettings';
import type { PromiseConstructor, SchemaConfiguration } from '../jsonLanguageTypes';
import type { JSONSchema, JSONSchemaMap, JSONSchemaRef } from '../jsonSchema';
import type { JSONDocument } from '../parser/jsonDocument';
import type { SingleYAMLDocument } from '../parser/yamlParser07';
import type { SchemaRequestService, WorkspaceContextService } from '../yamlLanguageService';
import type { SchemaVersions } from '../yamlTypes';

import * as path from 'path';

import * as l10n from '@vscode/l10n';
import Ajv from 'ajv';
import Ajv2019 from 'ajv/dist/2019';
import Ajv2020 from 'ajv/dist/2020';
import Ajv4 from 'ajv-draft-04';
import * as ajvLocalizers from 'ajv-i18n';
import * as Json from 'jsonc-parser';
import picomatch from 'picomatch';
import { Range } from 'vscode-languageserver-types';
import { URI } from 'vscode-uri';
import { parse } from 'yaml';

import { getDollarSchema } from './dollarUtils';
import { getSchemaFromModeline } from './modelineUtil';
import { ErrorCode, SchemaDraft } from '../jsonLanguageTypes';
import { asSchema } from '../parser/schemaValidation/baseValidator';
import { SchemaPriority } from '../yamlLanguageService';
import { autoDetectKubernetesSchema } from './k8sSchemaUtil';
import { CRD_CATALOG_URL, EMPTY_SCHEMA_URL, isKubernetes } from '../utils/schemaUrls';
import * as Strings from '../utils/strings';

const ajv4 = new Ajv4({ allErrors: true });
const ajv7 = new Ajv({ allErrors: true });
const ajv2019 = new Ajv2019({ allErrors: true });
const ajv2020 = new Ajv2020({ allErrors: true });

const schema04Validator = getDefaultMetaSchemaValidator(ajv4);
const schema07Validator = getDefaultMetaSchemaValidator(ajv7);
const schema2019Validator = getDefaultMetaSchemaValidator(ajv2019);
const schema2020Validator = getDefaultMetaSchemaValidator(ajv2020);

const schemaDraftCache = new Map<string, SchemaDraft>();
const schemaDraftInFlight = new Map<string, Promise<SchemaDraft>>();

const AJV_LOCALE_ALIASES = new Map<string, string>([
  ['zh-cn', 'zh'],
  ['zh-tw', 'zh-TW'],
]);

const PATH_SEP = '/';

// metadata/keywords that don't add constraints and thus don't count as $ref siblings
const REF_SIBLING_NONCONSTRAINT_KEYS = new Set([
  '$ref',
  '_$ref',
  '$schema',
  '$id',
  'id',
  '_baseUri',
  '_sourceUri',
  '_schemaDraft',
  '$anchor',
  '$dynamicAnchor',
  '$dynamicRef',
  '$recursiveAnchor',
  '$recursiveRef',
  'definitions',
  '$defs',
  '$comment',
  'title',
  'description',
  'markdownDescription',
  '$vocabulary',
  'examples',
  'default',
  'url',
  'closestTitle',
  'unevaluatedProperties',
  'unevaluatedItems',
]);

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

interface SchemaStoreSchema {
  name: string;
  description: string;
  versions?: SchemaVersions;
}

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
   * Registers an external schema
   */
  registerExternalSchema(
    config: SchemaConfiguration | string,
    filePatterns?: string[],
    unresolvedSchemaContent?: JSONSchema
  ): SchemaHandle;

  /**
   * Looks up the appropriate schema for the given URI
   */
  getSchemaForResource(resource: string, document?: JSONDocument): PromiseLike<ResolvedSchema | undefined>;

  /**
   * Looks up schema URIs for the given URI
   */
  getSchemaURIsForResource(resource: string, document?: JSONDocument): string[];

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

export class FilePatternAssociation {
  private readonly isMatch: (fileName: string) => boolean;

  constructor(
    pattern: string[],
    private readonly folderUri: string | undefined,
    public readonly uris: string[]
  ) {
    try {
      // strip leading / and add **/ prefix
      const processedPatterns = pattern
        .map((p) => {
          let patternString = p;
          if (patternString[0] === PATH_SEP) {
            patternString = patternString.substring(1);
          }
          return '**/' + patternString;
        })
        .filter((p) => p.length > 0);

      this.isMatch = picomatch(processedPatterns, {
        bash: true,
        noglobstar: false,
      });

      if (folderUri) {
        folderUri = normalizeResourceForMatching(folderUri);
        if (!folderUri.endsWith(PATH_SEP)) {
          folderUri = folderUri + PATH_SEP;
        }
        this.folderUri = folderUri;
      }
    } catch {
      this.isMatch = () => false;
      this.uris = [];
    }
  }

  public matchesPattern(fileName: string): boolean {
    if (this.folderUri && !fileName.startsWith(this.folderUri)) {
      return false;
    }
    return this.isMatch(fileName);
  }

  public getURIs(): string[] {
    return this.uris;
  }
}

export type SchemaDependencies = { [uri: string]: boolean };

export interface SchemaHandleService {
  readonly promise: PromiseConstructor;
  loadSchema(url: string): PromiseLike<UnresolvedSchema>;
  resolveSchemaContent(
    schemaToResolve: UnresolvedSchema,
    schemaURL: string,
    dependencies: SchemaDependencies
  ): PromiseLike<ResolvedSchema>;
}

export class SchemaHandle implements ISchemaHandle {
  public readonly uri: string;
  public dependencies: SchemaDependencies;
  public anchors: Map<string, JSONSchema> | undefined;
  private resolvedSchema: PromiseLike<ResolvedSchema> | undefined;
  private unresolvedSchema: PromiseLike<UnresolvedSchema> | undefined;
  private readonly service: SchemaHandleService;

  constructor(service: SchemaHandleService, uri: string, unresolvedSchemaContent?: JSONSchema) {
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
      this.resolvedSchema = this.getUnresolvedSchema().then((unresolved) =>
        this.service.resolveSchemaContent(unresolved, this.uri, this.dependencies)
      );
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

function toDiagnostic(message: string, code: ErrorCode, relatedURL?: string): SchemaDiagnostic {
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

export class YAMLSchemaService implements IJSONSchemaService {
  private contributionSchemas: { [id: string]: SchemaHandle };
  private contributionAssociations: FilePatternAssociation[];
  private schemasById: { [id: string]: SchemaHandle };
  private filePatternAssociations: FilePatternAssociation[];
  private registeredSchemasIds: { [id: string]: boolean };
  private contextService: WorkspaceContextService | undefined;
  private callOnDispose: (() => void)[];
  private requestService: SchemaRequestService | undefined;
  private promiseConstructor: PromiseConstructor;
  private cachedSchemaForResource: { resource: string; resolvedSchema: PromiseLike<ResolvedSchema | undefined> } | undefined;
  private customSchemaProvider: CustomSchemaProvider | undefined;
  private yamlSettings: SettingsState;
  public schemaPriorityMapping: Map<string, Set<SchemaPriority>>;

  private schemaUriToNameAndDescription = new Map<string, SchemaStoreSchema>();

  constructor(
    requestService: SchemaRequestService,
    contextService?: WorkspaceContextService,
    promiseConstructor?: PromiseConstructor,
    yamlSettings?: SettingsState
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
    this.customSchemaProvider = undefined;
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
      if (schemaUri === EMPTY_SCHEMA_URL || schemaUris.has(schemaUri)) {
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

  private collectSchemaNodes(push: (node: JSONSchema) => void, ...values: unknown[]): void {
    const collect = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const entry of value) {
          collect(entry);
        }
        return;
      }
      push(value as JSONSchema);
    };
    for (const value of values) {
      collect(value);
    }
  }

  private schemaMapValues(map?: JSONSchemaMap): JSONSchemaRef[] | undefined {
    if (!map || typeof map !== 'object') return undefined;
    return Object.values(map);
  }

  private resolveSchemaRef(resource: string, schemaRef: string): string {
    if (!schemaRef.startsWith('file:') && !schemaRef.startsWith('http')) {
      // If path contains a fragment and it is left intact, "#" will be
      // considered part of the filename and converted to "%23" by
      // path.resolve() -> take it out and add back after path.resolve
      let appendix = '';
      if (schemaRef.indexOf('#') > 0) {
        const segments = schemaRef.split('#', 2);
        schemaRef = segments[0];
        appendix = segments[1];
      }
      if (!path.isAbsolute(schemaRef)) {
        const resUri = URI.parse(resource);
        schemaRef = URI.file(path.resolve(path.parse(resUri.fsPath).dir, schemaRef)).toString();
      } else {
        schemaRef = URI.file(schemaRef).toString();
      }
      if (appendix.length > 0) {
        schemaRef += '#' + appendix;
      }
    }
    return schemaRef;
  }

  private resolveModelineSchema(resource: string, doc: JSONDocument): string | undefined {
    const schemaFromModeline = getSchemaFromModeline(doc);
    if (schemaFromModeline !== undefined) {
      if (schemaFromModeline.trim().toLowerCase() === 'none') {
        return 'none';
      }
      return this.resolveSchemaRef(resource, schemaFromModeline);
    }
  }

  private resolveDollarSchema(resource: string, doc: JSONDocument): string | undefined {
    const dollarSchema = getDollarSchema(doc);
    if (dollarSchema !== undefined) {
      return this.resolveSchemaRef(resource, dollarSchema);
    }
  }

  private async getSchemaIdsForResource(resource: string, doc: JSONDocument): Promise<string[]> {
    const modelineSchema = this.resolveModelineSchema(resource, doc);
    if (modelineSchema) {
      if (modelineSchema === 'none') {
        return [];
      }
      return [modelineSchema];
    }

    if (this.customSchemaProvider) {
      try {
        const schemaUri = await this.customSchemaProvider(resource);
        if (Array.isArray(schemaUri)) {
          if (schemaUri.length > 0) {
            return schemaUri;
          }
        } else if (schemaUri) {
          return [schemaUri];
        }
      } catch {
        // Fall back to configured schemas
      }
    }

    const seen: { [schemaId: string]: boolean } = Object.create(null);
    const schemas: string[] = [];
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

    return schemas.length > 0 ? this.highestPrioritySchemas(schemas) : [];
  }

  public async getSchemaDescriptionsForResource(resource: string, doc: JSONDocument): Promise<JSONSchemaDescription[]> {
    const schemaIds = await this.getSchemaIdsForResource(resource, doc);
    const result: JSONSchemaDescription[] = [];

    for (const schemaId of schemaIds) {
      if (schemaId === EMPTY_SCHEMA_URL) {
        continue;
      }

      const metadata = this.schemaUriToNameAndDescription.get(schemaId);
      let schema: JSONSchema | undefined;
      if (!metadata) {
        try {
          const unresolvedSchema = await this.loadSchema(schemaId);
          if (unresolvedSchema.schema && typeof unresolvedSchema.schema === 'object') {
            schema = unresolvedSchema.schema;
          }
        } catch {
          // Keep the schema URI visible even when its content cannot be loaded.
        }
      }

      result.push({
        uri: schemaId,
        name: metadata?.name ?? schema?.title,
        description: metadata?.description ?? schema?.description,
        versions: metadata?.versions ?? schema?.versions,
      });
    }

    return result;
  }

  async resolveSchemaContent(
    schemaToResolve: UnresolvedSchema,
    schemaURL: string,
    dependencies: SchemaDependencies
  ): Promise<ResolvedSchema> {
    const resolveErrors: SchemaDiagnostic[] = schemaToResolve.errors.slice(0);
    const loc = toDisplayString(schemaURL);

    const raw: unknown = schemaToResolve.schema;
    if (raw === null || Array.isArray(raw) || (typeof raw !== 'object' && typeof raw !== 'boolean')) {
      const got = raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;
      resolveErrors.push(
        toDiagnostic(
          l10n.t("Schema '{0}' is not valid: {1}", loc, `expected a JSON Schema object or boolean, got "${got}".`),
          ErrorCode.SchemaResolveError,
          schemaURL
        )
      );
      return new ResolvedSchema({}, resolveErrors);
    }

    const _setSourceUri = (node: JSONSchema, sourceUri: string | undefined): void => {
      if (!node || typeof node !== 'object' || !sourceUri) return;
      node._sourceUri = sourceUri;
    };

    const _cloneSchema = (
      value: JSONSchema,
      seen: Map<object, unknown>,
      stopCondition?: (val: unknown, seenSize: number) => unknown | undefined
    ): unknown => {
      // primitives and null
      if (value === null || typeof value !== 'object') return value;

      if (stopCondition) {
        const replacement = stopCondition(value, seen.size);
        if (replacement !== undefined) return replacement;
      }

      // already cloned
      if (seen.has(value)) return seen.get(value);

      // clone arrays
      if (Array.isArray(value)) {
        const arr = [];
        seen.set(value, arr);
        for (const item of value) {
          arr.push(_cloneSchema(item, seen, stopCondition));
        }
        return arr;
      }

      // clone objects
      const result: JSONSchema = {};
      seen.set(value, result);
      for (const prop in value) {
        result[prop] = _cloneSchema(value[prop], seen, stopCondition);
      }
      _setSourceUri(result, value._sourceUri);
      return result;
    };

    /**
     * ----------------------------
     * Meta-validate a schema node against its dialect's meta-schema
     * ----------------------------
     */
    const _loadSchema = this.loadSchema.bind(this);
    const ajvErrorLocale = this.yamlSettings?.locale;
    async function _metaValidateSchemaNode(node: JSONSchema, hasNestedSchema: boolean): Promise<void> {
      if (!node || typeof node !== 'object') return;
      const schemaDraft = await pickSchemaDraft(node.$schema, _loadSchema);
      if (schemaDraft) {
        node._schemaDraft = schemaDraft;
      }

      const validator = pickMetaValidator(schemaDraft);
      if (!validator) return;

      let toValidate = node;
      if (hasNestedSchema) {
        // clone for meta-validation: stop at dialect boundaries abd replace with {}
        const stopAtDialectBoundary = (val: JSONSchema, seenSize: number): JSONSchema | undefined => {
          if (seenSize !== 0 && val && typeof val === 'object' && val.$schema) return {};
          return undefined;
        };
        toValidate = _cloneSchema(node, new Map(), stopAtDialectBoundary) as JSONSchema;
      }

      let valid = false;
      try {
        valid = validator(toValidate);
      } catch (e) {
        // AJV overflows on recursive/cyclic schemas; attempt to degrade gracefully
        console.warn(l10n.t("Schema '{0}' could not be fully validated: {1}", loc, e.message));
        return;
      }
      if (!valid) {
        localizeAjvErrors(validator.errors, ajvErrorLocale);
        const errs: string[] = [];
        for (const err of validator.errors as DefinedError[]) {
          errs.push(`${err.instancePath} : ${err.message}`);
        }
        resolveErrors.push(
          toDiagnostic(
            l10n.t("Schema '{0}' is not valid: {1}", loc, `\n${errs.join('\n')}`),
            ErrorCode.SchemaResolveError,
            schemaURL
          )
        );
      }
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
     * - fragments: map of plain-name anchors to their schema nodes + dynamic flag
     */
    type FragmentEntry = { node: JSONSchema; dynamic?: boolean };
    type PlainNameFragmentMap = Map<string, FragmentEntry>;
    type ResourceIndex = { root?: JSONSchema; fragments: PlainNameFragmentMap };
    const resourceIndexByUri = new Map<string, ResourceIndex>();

    const _getResourceIndex = (resourceUri: string): ResourceIndex => {
      let entry = resourceIndexByUri.get(resourceUri);
      if (!entry) {
        entry = { fragments: new Map<string, FragmentEntry>() };
        resourceIndexByUri.set(resourceUri, entry);
      }
      return entry;
    };

    /**
     * Adds a resource's dynamic anchors to the inherited scope from parent resources
     *
     * Draft 2020-12: For $dynamicRef resolution, when schema A references schema B,
     * B's dynamic anchors are added to A's scope. This builds a chain where $dynamicRef
     * looks for the outermost (first) matching anchor.
     */
    const _addResourceDynamicAnchors = (
      scope: Map<string, JSONSchema[]> | undefined,
      resourceUri: string | undefined
    ): Map<string, JSONSchema[]> | undefined => {
      const entry = resourceIndexByUri.get(resourceUri);
      if (!entry || entry.fragments.size === 0) return scope;

      let result = scope;
      for (const [name, entryItem] of entry.fragments) {
        if (!entryItem.dynamic) continue;

        const current = result?.get(name) ?? [];
        if (current.some((existing) => existing._baseUri === resourceUri)) continue;

        // clone map on first modification
        if (result === scope) result = scope ? new Map(scope) : new Map<string, JSONSchema[]>();
        result.set(name, current.concat(entryItem.node));
      }
      return result;
    };

    // resolve relative URI against base URI
    // e.g. resolve "./foo.json" against "http://example.com/bar.json" => "http://example.com/foo.json"
    const _resolveAgainstBase = (baseUri: string, ref: string): string => {
      if (this.contextService) return this.contextService.resolveRelativePath(ref, baseUri);
      return normalizeId(ref);
    };

    const _indexSchemaResources = async (root: JSONSchema, initialBaseUri: string): Promise<void> => {
      type WorkItem = { node: JSONSchema; baseUri: string; sourceUri: string };
      const preOrderStack: WorkItem[] = [{ node: root, baseUri: initialBaseUri, sourceUri: initialBaseUri }];
      const postOrderStack: JSONSchema[] = [];
      const childListByNode = new WeakMap<JSONSchema, JSONSchema[]>();

      const seen = new Set<JSONSchema>();
      while (preOrderStack.length) {
        const current = preOrderStack.pop();
        if (!current) continue;

        const node = current.node;
        if (!node || typeof node !== 'object' || seen.has(node)) continue;
        seen.add(node);

        let baseUri = current.baseUri;
        _setSourceUri(node, current.sourceUri);
        const id = node.$id || node.id;
        if (id) {
          const resolvedBaseUri = _resolveAgainstBase(baseUri, id);
          node._baseUri = resolvedBaseUri;
          const hashIndex = resolvedBaseUri.indexOf('#');
          if (hashIndex !== -1 && hashIndex < resolvedBaseUri.length - 1) {
            // Draft-07 and earlier: $id with fragment defines a plain-name anchor scoped to the resolved base
            const frag = resolvedBaseUri.slice(hashIndex + 1);
            _getResourceIndex(baseUri).fragments.set(frag, { node });
          } else {
            // $id without fragment creates a new embedded resource scope
            baseUri = resolvedBaseUri;
            const entry = _getResourceIndex(resolvedBaseUri);
            if (!entry.root) {
              entry.root = node;
            }
          }
        }
        // Draft 2019-09+: $anchor keyword
        if (node.$anchor) {
          _getResourceIndex(baseUri).fragments.set(node.$anchor, { node });
        }
        // Draft 2020-12+: $dynamicAnchor keyword
        if (node.$dynamicAnchor) {
          node._baseUri = baseUri;
          _getResourceIndex(baseUri).fragments.set(node.$dynamicAnchor, { node, dynamic: true });
        }

        const children: JSONSchema[] = [];
        childListByNode.set(node, children);

        // collect all child schemas
        this.collectSchemaNodes(
          (entry) => {
            children.push(entry);
            preOrderStack.push({ node: entry, baseUri, sourceUri: current.sourceUri });
          },
          node.not,
          node.if,
          node.then,
          node.else,
          node.contains,
          node.propertyNames,
          node.additionalProperties as JSONSchema,
          node.items,
          node.additionalItems,
          node.prefixItems,
          this.schemaMapValues(node.properties),
          this.schemaMapValues(node.patternProperties),
          this.schemaMapValues(node.definitions),
          this.schemaMapValues(node.$defs),
          this.schemaMapValues(node.dependentSchemas),
          this.schemaMapValues(node.dependencies as JSONSchemaMap),
          node.allOf,
          node.anyOf,
          node.oneOf,
          node.schemaSequence
        );
        postOrderStack.push(node);
      }

      const hasNestedSchema = new WeakMap<JSONSchema, boolean>();
      while (postOrderStack.length) {
        const node = postOrderStack.pop();
        let hasNested = false;
        for (const child of childListByNode.get(node)) {
          if (child.$schema || hasNestedSchema.get(child)) {
            hasNested = true;
            break;
          }
        }
        hasNestedSchema.set(node, hasNested);

        if (node === root || node.$schema) await _metaValidateSchemaNode(node, hasNested);
      }
    };

    let schema = raw as JSONSchema;
    const schemaBaseURL = schemaToResolve.uri ?? schemaURL;
    await _indexSchemaResources(schema, schemaBaseURL);

    const _findSection = (schemaRoot: JSONSchema, refPath: string, sourceURI: string): JSONSchema => {
      if (!refPath) {
        return schemaRoot;
      }

      // JSON pointer style
      if (refPath[0] === PATH_SEP) {
        let current = schemaRoot;
        const parts = refPath.substring(1).split(PATH_SEP);
        for (const part of parts) {
          // in JSON Pointer: ~ must be escaped as ~0, / must be escaped as ~1
          current = current?.[part.replace(/~1/g, PATH_SEP).replace(/~0/g, '~')];
          if (current === null) return undefined;
        }
        return current as JSONSchema;
      }

      // plain-name fragment ($anchor or $id#fragment) -> lookup in collected fragments
      return _getResourceIndex(sourceURI).fragments.get(refPath).node;
    };

    const _merge = (target: JSONSchema, sourceRoot: JSONSchema, sourceURI: string, refPath: string, clone = false): void => {
      const section = _findSection(sourceRoot, refPath, sourceURI);
      if (typeof section === 'boolean') {
        if (!section) target.not = {};
        return;
      }
      if (typeof section === 'object' && section) {
        const source = clone ? (_cloneSchema(section, new Map()) as JSONSchema) : section;
        for (const key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key) && !Object.prototype.hasOwnProperty.call(target, key)) {
            target[key] = source[key];
          }
        }
        _setSourceUri(target, source._sourceUri);
        return;
      } else {
        resolveErrors.push(
          toDiagnostic(
            l10n.t("$ref '{0}' in '{1}' cannot be resolved.", refPath, sourceURI),
            ErrorCode.SchemaResolveError,
            sourceURI
          )
        );
      }
    };

    const _resolveRefUri = (parentSchemaURL: string, refUri: string): string => {
      const resolvedAgainstParent = _resolveAgainstBase(parentSchemaURL, refUri);
      if (!refUri.startsWith(PATH_SEP)) return resolvedAgainstParent;
      const parentResource = resourceIndexByUri.get(parentSchemaURL)?.root;
      const parentResourceId = parentResource?.$id || parentResource?.id;
      if (!parentResourceId) return resolvedAgainstParent;
      const resolvedParentId = _resolveAgainstBase(parentSchemaURL, parentResourceId);
      if (!resolvedParentId.startsWith('http://') && !resolvedParentId.startsWith('https://')) return resolvedAgainstParent;

      return _resolveAgainstBase(resolvedParentId, refUri);
    };

    const _resolveLocalSiblingFromRemoteUri = (parentSchemaURL: string, resolvedRefUri: string): string | undefined => {
      try {
        const parentUri = URI.parse(parentSchemaURL);
        const targetUri = URI.parse(resolvedRefUri);
        if (parentUri.scheme !== 'file') return undefined;
        if (targetUri.scheme !== 'http' && targetUri.scheme !== 'https') return undefined;

        const localFileName = path.posix.basename(targetUri.path);
        if (!localFileName) return undefined;
        const localDir = path.posix.dirname(parentUri.path);
        const localPath = path.posix.join(localDir, localFileName);
        return parentUri.with({ path: localPath, query: targetUri.query, fragment: targetUri.fragment }).toString();
      } catch {
        return undefined;
      }
    };

    const resolveExternalLink = (
      node: JSONSchema,
      uri: string,
      linkPath: string,
      parentSchemaURL: string,
      parentSchemaSourceUri: string,
      parentSchemaDependencies: SchemaDependencies,
      resolutionStack: Set<string>,
      recursiveAnchorBase: string,
      inheritedDynamicScope: Map<string, JSONSchema[]>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> => {
      const _attachResolvedSchema = (
        node: JSONSchema,
        schemaRoot: JSONSchema,
        schemaUri: string,
        linkPath: string,
        parentSchemaDependencies: SchemaDependencies,
        resolveRefDependencies: SchemaDependencies,
        resolutionStack: Set<string>,
        recursiveAnchorBase: string,
        inheritedDynamicScope: Map<string, JSONSchema[]>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ): Promise<any> => {
        parentSchemaDependencies[schemaUri] = true;
        _merge(node, schemaRoot, schemaUri, linkPath, !!inheritedDynamicScope || !!recursiveAnchorBase);
        if (!recursiveAnchorBase || !node._baseUri) node._baseUri = schemaUri;
        node.url = schemaUri;

        const nextStack = new Set(resolutionStack);
        nextStack.add(schemaUri);
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return resolveRefs(
          node,
          schemaRoot,
          schemaUri,
          resolveRefDependencies,
          nextStack,
          recursiveAnchorBase,
          inheritedDynamicScope
        );
      };

      const _resolveByUri = async (targetUris: string[], index = 0): Promise<unknown> => {
        const targetUri = targetUris[index];

        const embeddedSchema = resourceIndexByUri.get(targetUri)?.root;
        if (embeddedSchema) {
          return _attachResolvedSchema(
            node,
            embeddedSchema,
            targetUri,
            linkPath,
            parentSchemaDependencies,
            parentSchemaDependencies,
            resolutionStack,
            recursiveAnchorBase,
            inheritedDynamicScope
          );
        }

        const referencedHandle = this.getOrAddSchemaHandle(targetUri);
        const unresolvedSchema = await Promise.resolve(referencedHandle.getUnresolvedSchema());
        if (
          unresolvedSchema.errors?.some((error) => error.message.toLowerCase().includes('unable to load schema from')) &&
          index + 1 < targetUris.length
        ) {
          return _resolveByUri(targetUris, index + 1);
        }
        if (unresolvedSchema.errors.length) {
          const schemaError = unresolvedSchema.errors[0];
          const loc = linkPath ? targetUri + '#' + linkPath : targetUri;
          resolveErrors.push(
            toDiagnostic(l10n.t("Problems loading reference '{0}': {1}", loc, schemaError.message), schemaError.code, targetUri)
          );
        }
        // index resources for the newly loaded schema
        await _indexSchemaResources(unresolvedSchema.schema, targetUri);
        return await _attachResolvedSchema(
          node,
          unresolvedSchema.schema,
          targetUri,
          linkPath,
          parentSchemaDependencies,
          referencedHandle.dependencies,
          resolutionStack,
          recursiveAnchorBase,
          inheritedDynamicScope
        );
      };

      const resolvedUri = _resolveRefUri(parentSchemaURL, uri);
      const embeddedTarget = resourceIndexByUri.get(resolvedUri)?.root;
      const localSiblingUri = embeddedTarget ? undefined : _resolveLocalSiblingFromRemoteUri(parentSchemaSourceUri, resolvedUri);
      const targetUris = localSiblingUri && localSiblingUri !== resolvedUri ? [localSiblingUri, resolvedUri] : [resolvedUri];
      return _resolveByUri(targetUris);
    };

    const resolveRefs = async (
      node: JSONSchema,
      parentSchema: JSONSchema,
      parentSchemaURL: string,
      parentSchemaDependencies: SchemaDependencies,
      resolutionStack: Set<string>,
      recursiveAnchorBase?: string,
      inheritedDynamicScope?: Map<string, JSONSchema[]>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> => {
      if (!node || typeof node !== 'object') {
        return null;
      }

      // track nodes with their base URL for $id resolution
      type WalkItem = {
        node: JSONSchema;
        baseUri?: string;
        sourceUri?: string;
        schemaDraft?: SchemaDraft;
        recursiveAnchorBase?: string;
        inheritedDynamicScope?: Map<string, JSONSchema[]>;
        siblingRefCycleKeys?: Set<string>;
      };
      const toWalk: WalkItem[] = [
        {
          node,
          baseUri: parentSchemaURL,
          sourceUri: node._sourceUri ?? parentSchemaURL,
          recursiveAnchorBase,
          inheritedDynamicScope,
        },
      ];
      const seen = new WeakSet<JSONSchema>(); // prevents re-walking the same schema object graph

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const openPromises: Promise<any>[] = [];

      // handle $ref with siblings based on dialect
      const _handleRef = (
        next: JSONSchema,
        nodeBaseUri: string,
        nodeSourceUri: string,
        nodeSchemaDraft: SchemaDraft,
        recursiveAnchorBase?: string,
        inheritedDynamicScope?: Map<string, JSONSchema[]>,
        siblingRefCycleKeys?: Set<string>
      ): void => {
        const currentDynamicScope = _addResourceDynamicAnchors(inheritedDynamicScope, nodeBaseUri);

        this.collectSchemaNodes(
          (entry) =>
            toWalk.push({
              node: entry,
              baseUri: nodeBaseUri,
              sourceUri: nodeSourceUri,
              recursiveAnchorBase,
              inheritedDynamicScope: currentDynamicScope,
            }),
          this.schemaMapValues(next.definitions || next.$defs)
        );

        // checks if a node with $ref has other constraint keywords
        const _hasRefSiblings = (node: JSONSchema): boolean => {
          for (const k of Object.keys(node)) {
            if (REF_SIBLING_NONCONSTRAINT_KEYS.has(k)) continue;
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
        const _rewriteRefWithSiblingsToAllOf = (node: JSONSchema): void => {
          const siblings: JSONSchema = {};
          for (const k of Object.keys(node)) {
            if (!REF_SIBLING_NONCONSTRAINT_KEYS.has(k)) {
              siblings[k] = node[k];
              delete node[k];
            }
          }

          const refValue = node.$dynamicRef ?? node.$recursiveRef ?? node.$ref;
          if (typeof refValue !== 'string') return;
          node.allOf = [
            { [node.$dynamicRef ? '$dynamicRef' : node.$recursiveRef ? '$recursiveRef' : '$ref']: refValue } as JSONSchema,
            siblings,
          ];
          delete node.$dynamicRef;
          delete node.$recursiveRef;
          delete node.$ref;
        };

        const _stripRefSiblings = (node: JSONSchema): void => {
          for (const k of Object.keys(node)) {
            if (!REF_SIBLING_NONCONSTRAINT_KEYS.has(k)) delete node[k];
          }
        };

        const seenRefs = new Set<string>();

        const _mergeIfResourceAlreadyInResolutionStack = (ref: string, resolvedResource: string, frag: string): boolean => {
          if (!resolutionStack.has(resolvedResource)) return false;
          if (!seenRefs.has(ref)) {
            const source = resourceIndexByUri.get(resolvedResource)?.root;
            if (source && typeof source === 'object') {
              _merge(next, source, resolvedResource, frag, !!recursiveAnchorBase);
            }
            seenRefs.add(ref);
          }
          return true;
        };

        while (next.$dynamicRef || next.$recursiveRef || next.$ref) {
          const isDynamicRef = typeof next.$dynamicRef === 'string';
          const isRecursiveRef = !isDynamicRef && typeof next.$recursiveRef === 'string';
          const rawRef = next.$dynamicRef ?? next.$recursiveRef ?? next.$ref;
          if (typeof rawRef !== 'string') break;
          next._$ref = rawRef;

          // parse ref into base URI and fragment
          const ref = decodeURIComponent(rawRef);
          const segments = ref.split('#', 2);
          const baseUri = segments[0];
          const frag = segments.length > 1 ? segments[1] : '';
          const resolvedRefKey = `${baseUri ? _resolveAgainstBase(nodeBaseUri, baseUri) : nodeBaseUri}#${frag}`;

          if (_hasRefSiblings(next)) {
            // Draft-07 and earlier: ignore siblings
            if (nodeSchemaDraft === SchemaDraft.v4 || nodeSchemaDraft === SchemaDraft.v7) {
              _stripRefSiblings(next);
            } else {
              if (siblingRefCycleKeys?.has(resolvedRefKey)) break;

              // Draft-2019+: support sibling keywords
              _rewriteRefWithSiblingsToAllOf(next);
              if (Array.isArray(next.allOf)) {
                for (let i = 0; i < next.allOf.length; i++) {
                  const entry = next.allOf[i];
                  if (entry && typeof entry === 'object') {
                    let nextSiblingRefCycleKeys: Set<string> | undefined;
                    if (i === 0) {
                      nextSiblingRefCycleKeys = new Set(siblingRefCycleKeys);
                      nextSiblingRefCycleKeys.add(resolvedRefKey);
                    }
                    toWalk.push({
                      node: entry as JSONSchema,
                      baseUri: nodeBaseUri,
                      sourceUri: nodeSourceUri,
                      recursiveAnchorBase,
                      inheritedDynamicScope: currentDynamicScope,
                      siblingRefCycleKeys: nextSiblingRefCycleKeys,
                    });
                  }
                }
              }
              return;
            }
          }

          delete next.$dynamicRef;
          delete next.$recursiveRef;
          delete next.$ref;

          // Draft-2019+: $recursiveRef
          if (isRecursiveRef && (ref === '#' || ref === '')) {
            const targetRoot = resourceIndexByUri.get(nodeBaseUri)?.root;
            const recursiveBase = targetRoot?.$recursiveAnchor && recursiveAnchorBase ? recursiveAnchorBase : nodeBaseUri;

            if (recursiveBase.length > 0) {
              if (resolutionStack?.has(recursiveBase) || recursiveBase === nodeBaseUri) {
                const sourceRoot = resourceIndexByUri.get(recursiveBase)?.root ?? parentSchema;
                if (!seenRefs.has(ref)) {
                  _merge(next, sourceRoot, recursiveBase, '', false);
                  seenRefs.add(ref);
                }
                continue;
              }
              openPromises.push(
                resolveExternalLink(
                  next,
                  recursiveBase,
                  '',
                  nodeBaseUri,
                  nodeSourceUri,
                  parentSchemaDependencies,
                  resolutionStack,
                  recursiveAnchorBase,
                  currentDynamicScope
                )
              );
              return;
            }
            continue;
          }

          // Draft-2020+: $dynamicRef
          else if (isDynamicRef) {
            const targetResource = baseUri.length > 0 ? _resolveAgainstBase(nodeBaseUri, baseUri) : nodeBaseUri;
            const targetFragments = resourceIndexByUri.get(targetResource)?.fragments;
            const targetHasDynamicAnchor = frag.length > 0 && targetFragments?.get(frag)?.dynamic;
            const dynamicTarget = targetHasDynamicAnchor ? currentDynamicScope?.get(frag)?.[0] : undefined;
            const resolveResource = dynamicTarget ? dynamicTarget._baseUri : targetResource;

            if (dynamicTarget && (resolveResource === nodeBaseUri || resolutionStack.has(resolveResource))) {
              if (!seenRefs.has(ref)) {
                _merge(next, dynamicTarget, resolveResource, '', false);
                seenRefs.add(ref);
              }
              continue;
            }

            if (baseUri.length > 0 || targetHasDynamicAnchor) {
              if (_mergeIfResourceAlreadyInResolutionStack(ref, resolveResource, frag)) continue;
              openPromises.push(
                resolveExternalLink(
                  next,
                  resolveResource,
                  frag,
                  nodeBaseUri,
                  nodeSourceUri,
                  parentSchemaDependencies,
                  resolutionStack,
                  recursiveAnchorBase,
                  currentDynamicScope
                )
              );
              return;
            }
          }
          // normal $ref with external baseUri
          else if (baseUri.length > 0) {
            const resolvedBaseUri = _resolveAgainstBase(nodeBaseUri, baseUri);
            if (_mergeIfResourceAlreadyInResolutionStack(ref, resolvedBaseUri, frag)) continue;
            // resolve relative to this node's base URL
            openPromises.push(
              resolveExternalLink(
                next,
                baseUri,
                frag,
                nodeBaseUri,
                nodeSourceUri,
                parentSchemaDependencies,
                resolutionStack,
                recursiveAnchorBase,
                currentDynamicScope
              )
            );
            return;
          }

          // local $ref or $dynamicRef
          if (!seenRefs.has(ref)) {
            _merge(next, parentSchema, nodeBaseUri, frag, isDynamicRef && !!currentDynamicScope);
            seenRefs.add(ref);
          }
        }

        // recursively process children
        this.collectSchemaNodes(
          (entry) =>
            toWalk.push({
              node: entry,
              baseUri: next._baseUri || nodeBaseUri,
              sourceUri: next._sourceUri || nodeSourceUri,
              schemaDraft: nodeSchemaDraft,
              recursiveAnchorBase,
              inheritedDynamicScope: currentDynamicScope,
            }),
          next.not,
          next.if,
          next.then,
          next.else,
          next.contains,
          next.propertyNames,
          next.additionalProperties as JSONSchema,
          next.items,
          next.additionalItems,
          next.prefixItems,
          this.schemaMapValues(next.properties),
          this.schemaMapValues(next.patternProperties),
          this.schemaMapValues(next.dependentSchemas),
          this.schemaMapValues(next.dependencies as JSONSchemaMap),
          next.allOf,
          next.anyOf,
          next.oneOf,
          next.schemaSequence
        );
      };

      // handle file path with fragments
      if (parentSchemaURL.indexOf('#') > 0) {
        const segments = parentSchemaURL.split('#', 2);
        if (segments[0].length > 0 && segments[1].length > 0) {
          const newSchema = {};
          await resolveExternalLink(
            newSchema,
            segments[0],
            segments[1],
            parentSchemaURL,
            schema._sourceUri ?? parentSchemaURL,
            parentSchemaDependencies,
            resolutionStack,
            recursiveAnchorBase,
            inheritedDynamicScope
          );
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
        const nodeBaseUri = next._baseUri || item.baseUri;
        const nodeSourceUri = next._sourceUri || nodeBaseUri;
        const nodeSchemaDraft = next._schemaDraft || item.schemaDraft;
        const nodeRecursiveAnchorBase = item.recursiveAnchorBase ?? (next.$recursiveAnchor ? nodeBaseUri : undefined);
        if (seen.has(next)) continue;
        seen.add(next);
        _handleRef(
          next,
          nodeBaseUri,
          nodeSourceUri,
          nodeSchemaDraft,
          nodeRecursiveAnchorBase,
          item.inheritedDynamicScope,
          item.siblingRefCycleKeys
        );
      }
      return Promise.all(openPromises);
    };

    const resolutionStack = new Set<string>(); // prevents $ref/$recursiveRef/$dynamicRef loops across schema URIs
    const rootResource = schema._baseUri || schemaURL;
    if (rootResource) resolutionStack.add(rootResource);
    await resolveRefs(schema, schema, schemaURL, dependencies, resolutionStack);
    return new ResolvedSchema(schema, resolveErrors);
  }

  public async getSchemaForResource(resource: string, doc: JSONDocument): Promise<ResolvedSchema> {
    const resolveSchemaForResource = async (schemas: string[]): Promise<ResolvedSchema> => {
      const schemaHandle = this.createCombinedSchema(resource, schemas);
      const schema = await Promise.resolve(schemaHandle.getResolvedSchema());
      return this.finalizeResolvedSchema(schema, schemaHandle.uri, doc, false);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolveSchema = async (): Promise<any> => {
      const seen: { [schemaId: string]: boolean } = Object.create(null);
      const schemas: string[] = [];
      let k8sAllSchema: ResolvedSchema = undefined;
      let k8sSchemaUrl: string | undefined = undefined;

      for (const entry of this.filePatternAssociations) {
        if (entry.matchesPattern(resource)) {
          for (const schemaId of entry.getURIs()) {
            if (!seen[schemaId]) {
              if (this.yamlSettings?.kubernetesCRDStoreEnabled && isKubernetes(schemaId)) {
                if (!k8sAllSchema) {
                  k8sSchemaUrl = schemaId;
                  k8sAllSchema = await this.getResolvedSchema(schemaId);
                }
                const kubeSchema = autoDetectKubernetesSchema(
                  doc,
                  k8sAllSchema,
                  k8sSchemaUrl ?? schemaId,
                  this.yamlSettings.kubernetesCRDStoreUrl ?? CRD_CATALOG_URL
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
    const modelineSchema = this.resolveModelineSchema(resource, doc);
    if (modelineSchema) {
      if (modelineSchema === 'none') {
        return Promise.resolve(null);
      }
      return resolveSchemaForResource([modelineSchema]);
    }
    const dollarSchema = this.resolveDollarSchema(resource, doc);
    if (dollarSchema) {
      return resolveSchemaForResource([dollarSchema]);
    }
    if (this.customSchemaProvider) {
      try {
        const schemaUri = await this.customSchemaProvider(resource);
        if (Array.isArray(schemaUri)) {
          if (schemaUri.length === 0) {
            return resolveSchema();
          }
          const schemas = await Promise.all(schemaUri.map((uri) => this.resolveCustomSchema(uri, doc)));
          const errors = schemas.flatMap((schemaObj) => schemaObj.errors ?? []);
          const warnings = schemas.flatMap((schemaObj) => schemaObj.warnings ?? []);
          const schemaDraft = schemas.find((schemaObj) => schemaObj.schemaDraft)?.schemaDraft;
          return new ResolvedSchema(
            {
              allOf: schemas.map((schemaObj) => schemaObj.schema),
            },
            errors,
            warnings,
            schemaDraft
          );
        }
        if (!schemaUri) {
          return resolveSchema();
        }
        return this.resolveCustomSchema(schemaUri, doc);
      } catch {
        return resolveSchema();
      }
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
          return new ResolvedSchema(selectedSchema, schema.errors, schema.warnings, schema.schemaDraft);
        }
        return new ResolvedSchema(selectedSchema, [], [], schema.schemaDraft);
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

  private async resolveCustomSchema(schemaUri: string, doc?: JSONDocument): Promise<ResolvedSchema> {
    const unresolvedSchema = await this.loadSchema(schemaUri);
    const schema = await this.resolveSchemaContent(unresolvedSchema, schemaUri, {});
    return this.finalizeResolvedSchema(schema, schemaUri, doc, true);
  }

  /**
   * Save a schema with schema ID and schema content.
   * Overrides previous schemas set for that schema ID.
   */
  public async saveSchema(schemaId: string, schemaContent: JSONSchema): Promise<void> {
    const id = normalizeId(schemaId);
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
    const id = normalizeId(schemaId);
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
    const splitPathway = paths.split(PATH_SEP);
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
    if (Array.isArray(object) && isNaN(token)) {
      throw new Error('Expected a number after the array object');
    } else if (typeof object === 'object' && typeof token !== 'string') {
      throw new Error('Expected a string after the object');
    }
  }

  public get promise(): PromiseConstructor {
    return this.promiseConstructor;
  }

  public dispose(): void {
    while (this.callOnDispose.length > 0) {
      this.callOnDispose.pop()!();
    }
  }

  private addSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): SchemaHandle {
    const schemaHandle = new SchemaHandle(this, id, unresolvedSchemaContent);
    this.schemasById[id] = schemaHandle;
    return schemaHandle;
  }

  private getOrAddSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): SchemaHandle {
    return this.schemasById[id] || this.addSchemaHandle(id, unresolvedSchemaContent);
  }

  private addFilePatternAssociation(pattern: string[], folderUri: string | undefined, uris: string[]): FilePatternAssociation {
    const association = new FilePatternAssociation(pattern, folderUri, uris);
    this.filePatternAssociations.push(association);
    return association;
  }

  private createCombinedSchema(resource: string, schemaIds: string[]): SchemaHandle {
    if (schemaIds.length === 1) {
      return this.getOrAddSchemaHandle(schemaIds[0]);
    }
    const combinedSchemaId = 'schemaservice://combinedSchema/' + encodeURIComponent(resource);
    const combinedSchema: JSONSchema = {
      allOf: schemaIds.map((schemaId) => ({ $ref: schemaId })),
    };
    return this.addSchemaHandle(combinedSchemaId, combinedSchema);
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
    if (document) {
      const modelineSchema = this.resolveModelineSchema(resource, document);
      if (modelineSchema) {
        return modelineSchema === 'none' ? [] : [modelineSchema];
      }
      const dollarSchema = this.resolveDollarSchema(resource, document);
      if (dollarSchema) {
        return [dollarSchema];
      }
    }
    return this.getAssociatedSchemas(resource);
  }

  private async loadJSONSchema(url: string): Promise<UnresolvedSchema> {
    if (!this.requestService) {
      const errorMessage = l10n.t("Unable to load schema from '{0}'. No schema request service available", toDisplayString(url));
      return new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, ErrorCode.SchemaResolveError, url)]);
    }
    try {
      let content = await this.requestService(url);
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
            l10n.t("Unable to parse content from '{0}': Parse error at offset {1}.", toDisplayString(url), jsonErrors[0].offset),
            ErrorCode.SchemaResolveError,
            url
          )
        );
      }
      return new UnresolvedSchema(schemaContent, errors);
    } catch (error) {
      let message = typeof error.message === 'string' ? error.message : error.toString();
      const { code } = error;
      const errorSplit = message.split('Error: ');
      if (errorSplit.length > 1) {
        // more concise error message, URL and context are attached by caller anyways
        message = errorSplit[1];
      }
      if (message.endsWith('.')) {
        message = message.slice(0, -1);
      }
      const errorCode = ErrorCode.SchemaResolveError + (typeof code === 'number' && code < 0x10000 ? code : 0);
      const errorMessage = l10n.t("Unable to load schema from '{0}': {1}.", toDisplayString(url), message);
      return new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, errorCode, url)]);
    }
  }

  async loadSchema(schemaUri: string): Promise<UnresolvedSchema> {
    const requestService = this.requestService;
    const unresolvedJsonSchema = await this.loadJSONSchema(schemaUri);
    // If json-language-server failed to parse the schema, attempt to parse it as YAML instead.
    // If the YAML file starts with %YAML 1.x or contains a comment with a number the schema will
    // contain a number instead of being undefined, so we need to check for that too.
    if (
      unresolvedJsonSchema.errors &&
      (unresolvedJsonSchema.schema === undefined || typeof unresolvedJsonSchema.schema === 'number')
    ) {
      try {
        const content = await requestService(schemaUri);
        if (!content) {
          const errorMessage = l10n.t(
            "Unable to load schema from '{0}': No content. {1}",
            toDisplayString(schemaUri),
            unresolvedJsonSchema.errors.map((error) => error.message).join(', ')
          );
          return new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, ErrorCode.SchemaResolveError, schemaUri)]);
        }
        try {
          const schemaContent = parse(content);
          return new UnresolvedSchema(schemaContent, []);
        } catch (yamlError) {
          const errorMessage = l10n.t("Unable to parse content from '{0}': {1}.", toDisplayString(schemaUri), yamlError);
          return new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, ErrorCode.SchemaResolveError, schemaUri)]);
        }
      } catch (error) {
        let errorMessage = error.toString();
        const errorSplit = error.toString().split('Error: ');
        if (errorSplit.length > 1) {
          // more concise error message, URL and context are attached by caller anyways
          errorMessage = errorSplit[1];
        }
        return new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, ErrorCode.SchemaResolveError, schemaUri)]);
      }
    }
    unresolvedJsonSchema.uri = schemaUri;
    if (this.schemaUriToNameAndDescription.has(schemaUri)) {
      const { name, description, versions } = this.schemaUriToNameAndDescription.get(schemaUri);
      unresolvedJsonSchema.schema.title = name ?? unresolvedJsonSchema.schema.title;
      unresolvedJsonSchema.schema.description = description ?? unresolvedJsonSchema.schema.description;
      unresolvedJsonSchema.schema.versions = versions ?? unresolvedJsonSchema.schema.versions;
    } else if (unresolvedJsonSchema.errors && unresolvedJsonSchema.errors.length > 0) {
      const schemaError = unresolvedJsonSchema.errors[0];
      let errorMessage = schemaError.message;
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
      return new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, schemaError.code, schemaUri)]);
    }
    return unresolvedJsonSchema;
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
    const config: SchemaConfiguration = { uri: uri, fileMatch: filePatterns, schema: unresolvedSchema };
    const id = normalizeId(config.uri);
    this.registeredSchemasIds[id] = true;

    if (config.fileMatch && config.fileMatch.length) {
      this.addFilePatternAssociation(config.fileMatch, config.folderUri, [id]);
    }
    return config.schema ? this.addSchemaHandle(id, config.schema) : this.getOrAddSchemaHandle(id);
  }

  clearExternalSchemas(): void {
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

  setSchemaContributions(schemaContributions: ISchemaContributions): void {
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

  getRegisteredSchemaIds(filter?: (scheme: string) => boolean): string[] {
    return Object.keys(this.registeredSchemasIds).filter((id) => {
      const scheme = URI.parse(id).scheme;
      return scheme !== 'schemaservice' && (!filter || filter(scheme));
    });
  }

  getResolvedSchema(schemaId: string): Promise<ResolvedSchema | undefined> {
    const id = normalizeId(schemaId);
    const schemaHandle = this.schemasById[id];
    if (schemaHandle) {
      return Promise.resolve(schemaHandle.getResolvedSchema());
    }
    return Promise.resolve(undefined);
  }

  onResourceChange(uri: string): boolean {
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

function normalizeResourceForMatching(resource: string): string {
  // remove queries and fragments, normalize drive capitalization
  try {
    return URI.parse(resource).with({ fragment: null, query: null }).toString(true);
  } catch {
    return resource;
  }
}

function getLineAndColumnFromOffset(text: string, offset: number): { line: number; column: number } {
  const lines = text.slice(0, offset).split(/\r?\n/);
  const line = lines.length; // 1-based line number
  const column = lines[lines.length - 1].length + 1; // 1-based column number
  return { line, column };
}

const jsonSchemaHttpPrefix = `http://json-schema.org/`;
const jsonSchemaHttpsPrefix = `https://json-schema.org/`;

// Copied from vscode-json-languageservice@6.0.0-next.1
// Source: https://github.com/microsoft/vscode-json-languageservice/blob/810471bbb462bb6b87351c2232e209a3bb4062ca/src/parser/jsonParser.ts
function normalizeId(id: string): string {
  // use the https prefix for the old json-schema.org meta schemas
  // See https://github.com/microsoft/vscode/issues/195189
  if (id.startsWith(jsonSchemaHttpPrefix)) {
    id = jsonSchemaHttpsPrefix + id.substring(jsonSchemaHttpPrefix.length);
  }
  // remove trailing '#', normalize drive capitalization
  try {
    return URI.parse(id).toString(true);
  } catch {
    return id;
  }
}

function normalizeSchemaDraftUri(uri: string | AnySchemaObject | undefined): string {
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
  return normalizeId(s).replace(/\/+$/g, '');
}

function knownSchemaDraftFromUri(schemaUri?: string): SchemaDraft | undefined {
  if (schemaUri === normalizeSchemaDraftUri(ajv4.defaultMeta())) return SchemaDraft.v4;
  if (schemaUri === normalizeSchemaDraftUri(ajv7.defaultMeta())) return SchemaDraft.v7;
  if (schemaUri === normalizeSchemaDraftUri(ajv2019.defaultMeta())) return SchemaDraft.v2019_09;
  if (schemaUri === normalizeSchemaDraftUri(ajv2020.defaultMeta())) return SchemaDraft.v2020_12;
  return undefined;
}

function getAjvLocalizer(locale?: string): Localize | undefined {
  if (!locale) return undefined;

  const lowerLocale = locale.trim().toLowerCase();
  const aliasedLocale = AJV_LOCALE_ALIASES.get(lowerLocale);

  return ajvLocalizers[locale] || ajvLocalizers[lowerLocale] || (aliasedLocale ? ajvLocalizers[aliasedLocale] : undefined);
}

function localizeAjvErrors(errors: ErrorObject[] | null | undefined, locale?: string): void {
  const localizer = getAjvLocalizer(locale) || ajvLocalizers.default.en;
  localizer(errors);
}

function getDefaultMetaSchemaValidator(ajv: {
  defaultMeta(): string | AnySchemaObject | undefined;
  getSchema(keyRef: string): ValidateFunction | undefined;
}): ValidateFunction {
  const defaultMeta = ajv.defaultMeta() as string;
  const validator = ajv.getSchema(defaultMeta);
  if (validator) {
    return validator;
  }
  throw new Error(`Unable to resolve default JSON meta-schema validator`);
}

async function pickSchemaDraft(
  $schema: string | undefined,
  loadSchema?: (uri: string) => Promise<UnresolvedSchema>
): Promise<SchemaDraft> {
  if (!$schema) return undefined;
  const s = normalizeSchemaDraftUri($schema || '');

  const schemaDraft = knownSchemaDraftFromUri(s);
  if (schemaDraft) return schemaDraft;

  // cache custom dialect result
  if (schemaDraftCache.has(s)) {
    return schemaDraftCache.get(s);
  }
  const inflight = schemaDraftInFlight.get(s);
  if (inflight) {
    return inflight;
  }

  if (!loadSchema) return undefined;

  // resolve custom dialect: load the dialect meta-schema doc and infer base dialect from its $schema
  const promise = (async () => {
    const meta = await loadSchema(s);
    if (meta.errors?.length) return undefined;
    const metaSchema = meta.schema;
    if (!metaSchema || typeof metaSchema !== 'object') return undefined;
    const metaSchemaDraft = knownSchemaDraftFromUri(metaSchema.$schema);
    if (metaSchemaDraft) return metaSchemaDraft;
    return undefined;
  })();

  schemaDraftInFlight.set(s, promise);
  try {
    const result = await promise;
    schemaDraftCache.set(s, result);
    return result;
  } finally {
    schemaDraftInFlight.delete(s);
  }
}

function pickMetaValidator(schemaDraft: SchemaDraft): ValidateFunction | undefined {
  switch (schemaDraft) {
    case SchemaDraft.v4:
      return schema04Validator;
    case SchemaDraft.v7:
      return schema07Validator;
    case SchemaDraft.v2019_09:
      return schema2019Validator;
    case SchemaDraft.v2020_12:
      return schema2020Validator;
    default:
      // don't meta-validate unknown schema URI
      return undefined;
  }
}
