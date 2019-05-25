/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Json from 'jsonc-parser';
import { JSONSchema, JSONSchemaMap, JSONSchemaRef } from '../jsonSchema2';
import URI from 'vscode-uri';
import * as Strings from '../utils/strings';
import * as Parser from '../parser/jsonParser2';
import { SchemaRequestService, WorkspaceContextService, PromiseConstructor, Thenable } from '../jsonLanguageTypes';


import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export interface IJSONSchemaService {

	/**
	 * Registers a schema file in the current workspace to be applicable to files that match the pattern
	 */
	registerExternalSchema(uri: string, filePatterns?: string[], unresolvedSchema?: JSONSchema): ISchemaHandle;

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
	getSchemaForResource(resource: string, document: Parser.JSONDocument): Thenable<ResolvedSchema>;

	/**
	 * Returns all registered schema ids
	 */
	getRegisteredSchemaIds(filter?: (scheme) => boolean): string[];
}

export interface ISchemaAssociations {
	[pattern: string]: string[];
}

export interface ISchemaContributions {
	schemas?: { [id: string]: JSONSchema };
	schemaAssociations?: ISchemaAssociations;
}

export interface ISchemaHandle {
	/**
	 * The schema id
	 */
	url: string;

	/**
	 * The schema from the file, with potential $ref references
	 */
	getUnresolvedSchema(): Thenable<UnresolvedSchema>;

	/**
	 * The schema from the file, with references resolved
	 */
	getResolvedSchema(): Thenable<ResolvedSchema>;
}


class FilePatternAssociation {

	private schemas: string[];
	private patternRegExp: RegExp;

	constructor(pattern: string) {
		try {
			this.patternRegExp = new RegExp(Strings.convertSimple2RegExpPattern(pattern) + '$');
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

type SchemaDependencies = { [uri: string]: true };

class SchemaHandle implements ISchemaHandle {

	public url: string;
	public dependencies: SchemaDependencies;

	private resolvedSchema: Thenable<ResolvedSchema>;
	private unresolvedSchema: Thenable<UnresolvedSchema>;
	private service: JSONSchemaService;

	constructor(service: JSONSchemaService, url: string, unresolvedSchemaContent?: JSONSchema) {
		this.service = service;
		this.url = url;
		this.dependencies = {};
		if (unresolvedSchemaContent) {
			this.unresolvedSchema = this.service.promise.resolve(new UnresolvedSchema(unresolvedSchemaContent));
		}
	}

	public getUnresolvedSchema(): Thenable<UnresolvedSchema> {
		if (!this.unresolvedSchema) {
			this.unresolvedSchema = this.service.loadSchema(this.url);
		}
		return this.unresolvedSchema;
	}

	public getResolvedSchema(): Thenable<ResolvedSchema> {
		if (!this.resolvedSchema) {
			this.resolvedSchema = this.getUnresolvedSchema().then(unresolved => {
				return this.service.resolveSchemaContent(unresolved, this.url, this.dependencies);
			});
		}
		return this.resolvedSchema;
	}

	public clearSchema() {
		this.resolvedSchema = null;
		this.unresolvedSchema = null;
		this.dependencies = {};
	}
}


export class UnresolvedSchema {
	public schema: JSONSchema;
	public errors: string[];

	constructor(schema: JSONSchema, errors: string[] = []) {
		this.schema = schema;
		this.errors = errors;
	}
}

export class ResolvedSchema {
	public schema: JSONSchema;
	public errors: string[];

	constructor(schema: JSONSchema, errors: string[] = []) {
		this.schema = schema;
		this.errors = errors;
	}

	public getSection(path: string[]): JSONSchema {
		return Parser.asSchema(this.getSectionRecursive(path, this.schema));
	}

	private getSectionRecursive(path: string[], schema: JSONSchemaRef): JSONSchemaRef {
		if (!schema || typeof schema === 'boolean' || path.length === 0) {
			return schema;
		}
		let next = path.shift();

		if (schema.properties && typeof schema.properties[next]) {
			return this.getSectionRecursive(path, schema.properties[next]);
		} else if (schema.patternProperties) {
			for (const pattern of Object.keys(schema.patternProperties)) {
				let regex = new RegExp(pattern);
				if (regex.test(next)) {
					return this.getSectionRecursive(path, schema.patternProperties[pattern]);
				}
			}
		} else if (typeof schema.additionalProperties === 'object') {
			return this.getSectionRecursive(path, schema.additionalProperties);
		} else if (next.match('[0-9]+')) {
			if (Array.isArray(schema.items)) {
				let index = parseInt(next, 10);
				if (!isNaN(index) && schema.items[index]) {
					return this.getSectionRecursive(path, schema.items[index]);
				}
			} else if (schema.items) {
				return this.getSectionRecursive(path, schema.items);
			}
		}

		return null;
	}
}

export class JSONSchemaService implements IJSONSchemaService {

	private contributionSchemas: { [id: string]: SchemaHandle };
	private contributionAssociations: { [id: string]: string[] };

	private schemasById: { [id: string]: SchemaHandle };
	private filePatternAssociations: FilePatternAssociation[];
	private filePatternAssociationById: { [id: string]: FilePatternAssociation };
	private registeredSchemasIds: { [id: string]: boolean };

	private contextService: WorkspaceContextService;
	private callOnDispose: Function[];
	private requestService: SchemaRequestService;
	private promiseConstructor: PromiseConstructor;

	constructor(requestService: SchemaRequestService, contextService?: WorkspaceContextService, promiseConstructor?: PromiseConstructor) {
		this.contextService = contextService;
		this.requestService = requestService;
		this.promiseConstructor = promiseConstructor || Promise;
		this.callOnDispose = [];

		this.contributionSchemas = {};
		this.contributionAssociations = {};
		this.schemasById = {};
		this.filePatternAssociations = [];
		this.filePatternAssociationById = {};
		this.registeredSchemasIds = {};
	}

	public getRegisteredSchemaIds(filter?: (scheme) => boolean): string[] {
		return Object.keys(this.registeredSchemasIds).filter(id => {
			let scheme = URI.parse(id).scheme;
			return scheme !== 'schemaservice' && (!filter || filter(scheme));
		});
	}

	public get promise() {
		return this.promiseConstructor;
	}

	public dispose(): void {
		while (this.callOnDispose.length > 0) {
			this.callOnDispose.pop()();
		}
	}

	public onResourceChange(uri: string): boolean {
		let hasChanges = false;
		uri = this.normalizeId(uri);

		let toWalk = [uri];
		let all: (SchemaHandle | undefined)[] = Object.keys(this.schemasById).map(key => this.schemasById[key]);

		while (toWalk.length) {
			const curr = toWalk.pop();
			for (let i = 0; i < all.length; i++) {
				const handle = all[i];
				if (handle && (handle.url === curr || handle.dependencies[curr])) {
					if (handle.url !== curr) {
						toWalk.push(handle.url);
					}
					handle.clearSchema();
					all[i] = undefined;
					hasChanges = true;
				}
			}
		}
		return hasChanges;
	}

	private normalizeId(id: string) {
		// remove trailing '#', normalize drive capitalization
		return URI.parse(id).toString();
	}

	public setSchemaContributions(schemaContributions: ISchemaContributions): void {
		if (schemaContributions.schemas) {
			let schemas = schemaContributions.schemas;
			for (let id in schemas) {
				let normalizedId = this.normalizeId(id);
				this.contributionSchemas[normalizedId] = this.addSchemaHandle(normalizedId, schemas[id]);
			}
		}
		if (schemaContributions.schemaAssociations) {
			let schemaAssociations = schemaContributions.schemaAssociations;
			for (let pattern in schemaAssociations) {
				let associations = schemaAssociations[pattern];
				this.contributionAssociations[pattern] = associations;

				var fpa = this.getOrAddFilePatternAssociation(pattern);
				for (const schemaId of associations) {
					let id = this.normalizeId(schemaId);
					fpa.addSchema(id);
				}
			}
		}
	}

	private addSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): SchemaHandle {
		let schemaHandle = new SchemaHandle(this, id, unresolvedSchemaContent);
		this.schemasById[id] = schemaHandle;
		return schemaHandle;
	}

	private getOrAddSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): SchemaHandle {
		return this.schemasById[id] || this.addSchemaHandle(id, unresolvedSchemaContent);
	}

	private getOrAddFilePatternAssociation(pattern: string) {
		let fpa = this.filePatternAssociationById[pattern];
		if (!fpa) {
			fpa = new FilePatternAssociation(pattern);
			this.filePatternAssociationById[pattern] = fpa;
			this.filePatternAssociations.push(fpa);
		}
		return fpa;
	}

	public registerExternalSchema(uri: string, filePatterns: string[] = null, unresolvedSchemaContent?: JSONSchema): ISchemaHandle {
		let id = this.normalizeId(uri);
		this.registeredSchemasIds[id] = true;

		if (filePatterns) {
			for (const pattern of filePatterns) {
				this.getOrAddFilePatternAssociation(pattern).addSchema(id);
			}
		}
		return unresolvedSchemaContent ? this.addSchemaHandle(id, unresolvedSchemaContent) : this.getOrAddSchemaHandle(id);
	}

	public clearExternalSchemas(): void {
		this.schemasById = {};
		this.filePatternAssociations = [];
		this.filePatternAssociationById = {};
		this.registeredSchemasIds = {};

		for (let id in this.contributionSchemas) {
			this.schemasById[id] = this.contributionSchemas[id];
			this.registeredSchemasIds[id] = true;
		}
		for (let pattern in this.contributionAssociations) {
			var fpa = this.getOrAddFilePatternAssociation(pattern);
			for (const schemaId of this.contributionAssociations[pattern]) {
				let id = this.normalizeId(schemaId);
				fpa.addSchema(id);
			}
		}
	}

	public getResolvedSchema(schemaId: string): Thenable<ResolvedSchema> {
		let id = this.normalizeId(schemaId);
		let schemaHandle = this.schemasById[id];
		if (schemaHandle) {
			return schemaHandle.getResolvedSchema();
		}
		return this.promise.resolve(null);
	}

	public loadSchema(url: string): Thenable<UnresolvedSchema> {
		if (!this.requestService) {
			let errorMessage = localize('json.schema.norequestservice', 'Unable to load schema from \'{0}\'. No schema request service available', toDisplayString(url));
			return this.promise.resolve(new UnresolvedSchema(<JSONSchema>{}, [errorMessage]));
		}
		return this.requestService(url).then(
			content => {
				if (!content) {
					let errorMessage = localize('json.schema.nocontent', 'Unable to load schema from \'{0}\': No content.', toDisplayString(url));
					return new UnresolvedSchema(<JSONSchema>{}, [errorMessage]);
				}

				let schemaContent: JSONSchema = {};
				let jsonErrors: Json.ParseError[] = [];
				schemaContent = Json.parse(content, jsonErrors);
				let errors = jsonErrors.length ? [localize('json.schema.invalidFormat', 'Unable to parse content from \'{0}\': Parse error at offset {1}.', toDisplayString(url), jsonErrors[0].offset)] : [];
				return new UnresolvedSchema(schemaContent, errors);
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
		);
	}

	public resolveSchemaContent(schemaToResolve: UnresolvedSchema, schemaURL: string, dependencies: SchemaDependencies): Thenable<ResolvedSchema> {

		let resolveErrors: string[] = schemaToResolve.errors.slice(0);
		let schema = schemaToResolve.schema;
		let contextService = this.contextService;

		let findSection = (schema: JSONSchema, path: string): any => {
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

		let merge = (target: JSONSchema, sourceRoot: JSONSchema, sourceURI: string, path: string): void => {
			let section = findSection(sourceRoot, path);
			if (section) {
				for (let key in section) {
					if (section.hasOwnProperty(key) && !target.hasOwnProperty(key)) {
						target[key] = section[key];
					}
				}
			} else {
				resolveErrors.push(localize('json.schema.invalidref', '$ref \'{0}\' in \'{1}\' can not be resolved.', path, sourceURI));
			}
		};

		let resolveExternalLink = (node: JSONSchema, uri: string, linkPath: string, parentSchemaURL: string, parentSchemaDependencies: SchemaDependencies): Thenable<any> => {
			if (contextService && !/^\w+:\/\/.*/.test(uri)) {
				uri = contextService.resolveRelativePath(uri, parentSchemaURL);
			}
			uri = this.normalizeId(uri);
			const referencedHandle = this.getOrAddSchemaHandle(uri);
			return referencedHandle.getUnresolvedSchema().then(unresolvedSchema => {
				parentSchemaDependencies[uri] = true;
				if (unresolvedSchema.errors.length) {
					let loc = linkPath ? uri + '#' + linkPath : uri;
					resolveErrors.push(localize('json.schema.problemloadingref', 'Problems loading reference \'{0}\': {1}', loc, unresolvedSchema.errors[0]));
				}
				merge(node, unresolvedSchema.schema, uri, linkPath);
				return resolveRefs(node, unresolvedSchema.schema, uri, referencedHandle.dependencies);
			});
		};

		let resolveRefs = (node: JSONSchema, parentSchema: JSONSchema, parentSchemaURL: string, parentSchemaDependencies: SchemaDependencies): Thenable<any> => {
			if (!node || typeof node !== 'object') {
				return Promise.resolve(null);
			}

			let toWalk: JSONSchema[] = [node];
			let seen: JSONSchema[] = [];

			let openPromises: Thenable<any>[] = [];

			let collectEntries = (...entries: JSONSchemaRef[]) => {
				for (let entry of entries) {
					if (typeof entry === 'object') {
						toWalk.push(entry);
					}
				}
			};
			let collectMapEntries = (...maps: JSONSchemaMap[]) => {
				for (let map of maps) {
					if (typeof map === 'object') {
						for (let key in map) {
							let entry = map[key];
							if (typeof entry === 'object') {
								toWalk.push(entry);
							}
						}
					}
				}
			};
			let collectArrayEntries = (...arrays: JSONSchemaRef[][]) => {
				for (let array of arrays) {
					if (Array.isArray(array)) {
						for (let entry of array) {
							if (typeof entry === 'object') {
								toWalk.push(entry);
							}
						}
					}
				}
			};
			let handleRef = (next: JSONSchema) => {
				let seenRefs = [];
				while (next.$ref) {
					const ref = next.$ref;
					let segments = ref.split('#', 2);
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

				collectEntries(<JSONSchema>next.items, <JSONSchema>next.additionalProperties, next.not, next.contains, next.propertyNames, next.if, next.then, next.else);
				collectMapEntries(next.definitions, next.properties, next.patternProperties, <JSONSchemaMap>next.dependencies);
				collectArrayEntries(next.anyOf, next.allOf, next.oneOf, <JSONSchema[]>next.items);
			};

			while (toWalk.length) {
				let next = toWalk.pop();
				if (seen.indexOf(next) >= 0) {
					continue;
				}
				seen.push(next);
				handleRef(next);
			}
			return this.promise.all(openPromises);
		};

		return resolveRefs(schema, schema, schemaURL, dependencies).then(_ => new ResolvedSchema(schema, resolveErrors));
	}

	public getSchemaForResource(resource: string, document: Parser.JSONDocument): Thenable<ResolvedSchema> {

		// first use $schema if present
		if (document && document.root && document.root.type === 'object') {
			let schemaProperties = document.root.properties.filter(p => (p.keyNode.value === '$schema') && p.valueNode && p.valueNode.type === 'string');
			if (schemaProperties.length > 0) {
				let schemeId = <string>Parser.getNodeValue(schemaProperties[0].valueNode);
				if (schemeId && Strings.startsWith(schemeId, '.') && this.contextService) {
					schemeId = this.contextService.resolveRelativePath(schemeId, resource);
				}
				if (schemeId) {
					let id = this.normalizeId(schemeId);
					return this.getOrAddSchemaHandle(id).getResolvedSchema();
				}
			}
		}

		let seen: { [schemaId: string]: boolean } = Object.create(null);
		let schemas: string[] = [];
		for (let entry of this.filePatternAssociations) {
			if (entry.matchesPattern(resource)) {
				for (let schemaId of entry.getSchemas()) {
					if (!seen[schemaId]) {
						schemas.push(schemaId);
						seen[schemaId] = true;
					}
				}
			}
		}
		if (schemas.length > 0) {
			return this.createCombinedSchema(resource, schemas).getResolvedSchema();
		}

		return this.promise.resolve(null);
	}

	private createCombinedSchema(resource: string, schemaIds: string[]): ISchemaHandle {
		if (schemaIds.length === 1) {
			return this.getOrAddSchemaHandle(schemaIds[0]);
		} else {
			let combinedSchemaId = 'schemaservice://combinedSchema/' + encodeURIComponent(resource);
			let combinedSchema: JSONSchema = {
				allOf: schemaIds.map(schemaId => ({ $ref: schemaId }))
			};
			return this.addSchemaHandle(combinedSchemaId, combinedSchema);
		}
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