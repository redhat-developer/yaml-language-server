/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Forked from vscode-json-languageservice@6.0.0-next.1
// Source: https://github.com/microsoft/vscode-json-languageservice/blob/810471bbb462bb6b87351c2232e209a3bb4062ca/src/services/jsonSchemaService.ts

import type { JSONSchema, JSONSchemaRef } from '../../jsonSchema';
import { URI } from 'vscode-uri';
import * as Strings from '../../utils/strings';
import type { JSONDocument } from '../../parser/jsonDocument';
import { isBoolean } from '../../utils/objects';
import type { PromiseConstructor, SchemaConfiguration, SchemaDraft, ErrorCode } from '../jsonLanguageTypes';
import { createRegex } from '../utils/glob';
import type { DiagnosticRelatedInformation } from 'vscode-languageserver-types';
import { Range } from 'vscode-languageserver-types';

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

const BANG = '!';
const PATH_SEP = '/';

interface IGlobWrapper {
  regexp: RegExp;
  include: boolean;
}

export class FilePatternAssociation {
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

function normalizeResourceForMatching(resource: string): string {
  // remove queries and fragments, normalize drive capitalization
  try {
    return URI.parse(resource).with({ fragment: null, query: null }).toString(true);
  } catch {
    return resource;
  }
}

function asSchema(schema: JSONSchemaRef | undefined): JSONSchema | undefined {
  if (isBoolean(schema)) {
    return schema ? {} : { not: {} };
  }
  return schema;
}
