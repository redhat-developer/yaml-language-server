/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Json from 'jsonc-parser';
import {JSONSchema, JSONSchemaMap} from '../jsonSchema';
import URI from 'vscode-uri';
import * as Strings from '../utils/strings';
import {SchemaRequestService, WorkspaceContextService, PromiseConstructor, Thenable} from '../yamlLanguageService';


import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

/**
 * getParseErrorMessage has been removed from jsonc-parser since 1.0.0
 *
 * see https://github.com/Microsoft/node-jsonc-parser/blob/42ec16f9c91582d4267a0c48199cdac283c90fc9/CHANGELOG.md
 * 1.0.0
 *  remove nls dependency (remove getParseErrorMessage)
 */
function getParseErrorMessage(errorCode: Json.ParseErrorCode): string {
	switch (errorCode) {
		case Json.ParseErrorCode.InvalidSymbol: return localize('error.invalidSymbol', 'Invalid symbol');
		case Json.ParseErrorCode.InvalidNumberFormat: return localize('error.invalidNumberFormat', 'Invalid number format');
		case Json.ParseErrorCode.PropertyNameExpected: return localize('error.propertyNameExpected', 'Property name expected');
		case Json.ParseErrorCode.ValueExpected: return localize('error.valueExpected', 'Value expected');
		case Json.ParseErrorCode.ColonExpected: return localize('error.colonExpected', 'Colon expected');
		case Json.ParseErrorCode.CommaExpected: return localize('error.commaExpected', 'Comma expected');
		case Json.ParseErrorCode.CloseBraceExpected: return localize('error.closeBraceExpected', 'Closing brace expected');
		case Json.ParseErrorCode.CloseBracketExpected: return localize('error.closeBracketExpected', 'Closing bracket expected');
		case Json.ParseErrorCode.EndOfFileExpected: return localize('error.endOfFileExpected', 'End of file expected');
		default: return '';
	}
}

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
	getSchemaForResource(resource: string): Thenable<ResolvedSchema>;

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

export declare type CustomSchemaProvider = (uri: string) => Thenable<string>;

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


export class FilePatternAssociation {

	private schemas: string[];
	private combinedSchemaId: string;
	private patternRegExp: RegExp;
	private combinedSchema: ISchemaHandle;

	constructor(pattern: string) {
		this.combinedSchemaId = 'schemaservice://combinedSchema/' + encodeURIComponent(pattern);
		try {
			this.patternRegExp = Strings.convertSimple2RegExp(pattern);
		} catch (e) {
			// invalid pattern
			this.patternRegExp = null;
		}
		this.schemas = [];
		this.combinedSchema = null;
	}

	public addSchema(id: string) {
		this.schemas.push(id);
		this.combinedSchema = null;
	}

	public matchesPattern(fileName: string): boolean {
		return this.patternRegExp && this.patternRegExp.test(fileName);
	}

	public getCombinedSchema(service: JSONSchemaService): ISchemaHandle {
		if (!this.combinedSchema) {
			this.combinedSchema = service.createCombinedSchema(this.combinedSchemaId, this.schemas);
		}
		return this.combinedSchema;
	}
}

class SchemaHandle implements ISchemaHandle {

	public url: string;

	private resolvedSchema: Thenable<ResolvedSchema>;
	private unresolvedSchema: Thenable<UnresolvedSchema>;
	private service: JSONSchemaService;

	constructor(service: JSONSchemaService, url: string, unresolvedSchemaContent?: JSONSchema) {
		this.service = service;
		this.url = url;
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
				return this.service.resolveSchemaContent(unresolved, this.url);
			});
		}
		return this.resolvedSchema;
	}

	public clearSchema(): void {
		this.resolvedSchema = null;
		this.unresolvedSchema = null;
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
		return this.getSectionRecursive(path, this.schema);
	}

	private getSectionRecursive(path: string[], schema: JSONSchema): JSONSchema {
		if (!schema || path.length === 0) {
			return schema;
		}
		let next = path.shift();

		if (schema.properties && schema.properties[next]) {
			return this.getSectionRecursive(path, schema.properties[next]);
		} else if (schema.patternProperties) {
			Object.keys(schema.patternProperties).forEach((pattern) => {
				let regex = new RegExp(pattern);
				if (regex.test(next)) {
					return this.getSectionRecursive(path, schema.patternProperties[pattern]);
				}
			});
		} else if (schema.additionalProperties) {
			return this.getSectionRecursive(path, schema.additionalProperties);
		} else if (next.match('[0-9]+')) {
			if (schema.items) {
				return this.getSectionRecursive(path, schema.items);
			} else if (Array.isArray(schema.items)) {
				try {
					let index = parseInt(next, 10);
					if (schema.items[index]) {
						return this.getSectionRecursive(path, schema.items[index]);
					}
					return null;
				}
				catch (e) {
					return null;
				}
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
	private customSchemaProvider: CustomSchemaProvider | undefined;

	constructor(requestService: SchemaRequestService, contextService?: WorkspaceContextService, promiseConstructor?: PromiseConstructor) {
		this.contextService = contextService;
		this.requestService = requestService;
		this.promiseConstructor = promiseConstructor || Promise;
		this.callOnDispose = [];
		this.customSchemaProvider = undefined;
		this.contributionSchemas = {};
		this.contributionAssociations = {};
		this.schemasById = {};
		this.filePatternAssociations = [];
		this.filePatternAssociationById = {};
		this.registeredSchemasIds = {};
	}

	registerCustomSchemaProvider(customSchemaProvider: CustomSchemaProvider) {
		this.customSchemaProvider = customSchemaProvider;
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
		uri = this.normalizeId(uri);
		let schemaFile = this.schemasById[uri];
		if (schemaFile) {
			schemaFile.clearSchema();
			return true;
		}
		return false;
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
				associations.forEach(schemaId => {
					let id = this.normalizeId(schemaId);
					fpa.addSchema(id);
				});
			}
		}
	}

	private addSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): SchemaHandle {
		let schemaHandle = new SchemaHandle(this, id, unresolvedSchemaContent);
		this.schemasById[id] = schemaHandle;
		return schemaHandle;
	}

	private getOrAddSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): ISchemaHandle {
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
			filePatterns.forEach(pattern => {
				this.getOrAddFilePatternAssociation(pattern).addSchema(id);
			});
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

			this.contributionAssociations[pattern].forEach(schemaId => {
				let id = this.normalizeId(schemaId);
				fpa.addSchema(id);
			});
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
				let jsonErrors = [];
				schemaContent = Json.parse(content, jsonErrors);
				let errors = jsonErrors.length ? [localize('json.schema.invalidFormat', 'Unable to parse content from \'{0}\': {1}.', toDisplayString(url), getParseErrorMessage(jsonErrors[0]))] : [];
				return new UnresolvedSchema(schemaContent, errors);
			},
			(error: any) => {
				let errorMessage = localize('json.schema.unabletoload', 'Unable to load schema from \'{0}\': {1}', toDisplayString(url), error.toString());
				return new UnresolvedSchema(<JSONSchema>{}, [errorMessage]);
			}
		);
	}

	public resolveSchemaContent(schemaToResolve: UnresolvedSchema, schemaURL: string): Thenable<ResolvedSchema> {

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

		let resolveLink = (node: any, linkedSchema: JSONSchema, linkPath: string): void => {
			let section = findSection(linkedSchema, linkPath);
			if (section) {
				for (let key in section) {
					if (section.hasOwnProperty(key) && !node.hasOwnProperty(key)) {
						node[key] = section[key];
					}
				}
			} else {
				resolveErrors.push(localize('json.schema.invalidref', '$ref \'{0}\' in {1} can not be resolved.', linkPath, linkedSchema.id));
			}
			delete node.$ref;
		};

		let resolveExternalLink = (node: any, uri: string, linkPath: string, parentSchemaURL: string): Thenable<any> => {
			if (contextService && !/^\w+:\/\/.*/.test(uri)) {
				uri = contextService.resolveRelativePath(uri, parentSchemaURL);
			}
			uri = this.normalizeId(uri);
			return this.getOrAddSchemaHandle(uri).getUnresolvedSchema().then(unresolvedSchema => {
				if (unresolvedSchema.errors.length) {
					let loc = linkPath ? uri + '#' + linkPath : uri;
					resolveErrors.push(localize('json.schema.problemloadingref', 'Problems loading reference \'{0}\': {1}', loc, unresolvedSchema.errors[0]));
				}
				resolveLink(node, unresolvedSchema.schema, linkPath);
				return resolveRefs(node, unresolvedSchema.schema, uri);
			});
		};

		let resolveRefs = (node: JSONSchema, parentSchema: JSONSchema, parentSchemaURL: string): Thenable<any> => {
			if (!node) {
				return Promise.resolve(null);
			}

			let toWalk: JSONSchema[] = [node];
			let seen: JSONSchema[] = [];

			let openPromises: Thenable<any>[] = [];

			let collectEntries = (...entries: JSONSchema[]) => {
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
							toWalk.push(entry);
						}
					}
				}
			};
			let collectArrayEntries = (...arrays: JSONSchema[][]) => {
				for (let array of arrays) {
					if (Array.isArray(array)) {
						toWalk.push.apply(toWalk, array);
					}
				}
			};
			while (toWalk.length) {
				let next = toWalk.pop();
				if (seen.indexOf(next) >= 0) {
					continue;
				}
				seen.push(next);
				if (next.$ref) {
					let segments = next.$ref.split('#', 2);
					if (segments[0].length > 0) {
						openPromises.push(resolveExternalLink(next, segments[0], segments[1], parentSchemaURL));
						continue;
					} else {
						resolveLink(next, parentSchema, segments[1]);
					}
				}
				collectEntries(next.items, next.additionalProperties, next.not);
				collectMapEntries(next.definitions, next.properties, next.patternProperties, <JSONSchemaMap>next.dependencies);
				collectArrayEntries(next.anyOf, next.allOf, next.oneOf, <JSONSchema[]>next.items, next.schemaSequence);
			}
			return this.promise.all(openPromises);
		};

		return resolveRefs(schema, schema, schemaURL).then(_ => new ResolvedSchema(schema, resolveErrors));
	}

	public getSchemaForResource(resource: string ): Thenable<ResolvedSchema> {
		const resolveSchema = () => {
			// check for matching file names, last to first
			for (let i = this.filePatternAssociations.length - 1; i >= 0; i--) {
				let entry = this.filePatternAssociations[i];
				if (entry.matchesPattern(resource)) {
					return entry.getCombinedSchema(this).getResolvedSchema();
				}
			}
			return this.promise.resolve(null);
		};
		if (this.customSchemaProvider) {
			return this.customSchemaProvider(resource).then(schemaUri => {
				return this.loadSchema(schemaUri).then(unsolvedSchema => this.resolveSchemaContent(unsolvedSchema, schemaUri));
			}).then(schema => schema, err => {
				return resolveSchema();
			});
		} else {
			return resolveSchema();
		}
	}

	public createCombinedSchema(combinedSchemaId: string, schemaIds: string[]): ISchemaHandle {
		if (schemaIds.length === 1) {
			return this.getOrAddSchemaHandle(schemaIds[0]);
		} else {
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
