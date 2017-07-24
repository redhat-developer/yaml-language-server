/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
const Json = require("jsonc-parser");
const vscode_uri_1 = require("vscode-uri");
const Strings = require("../utils/strings");
const nls = require("vscode-nls");
const localize = nls.loadMessageBundle();
class FilePatternAssociation {
    constructor(pattern) {
        this.combinedSchemaId = 'schemaservice://combinedSchema/' + encodeURIComponent(pattern);
        try {
            this.patternRegExp = new RegExp(Strings.convertSimple2RegExpPattern(pattern) + '$');
        }
        catch (e) {
            // invalid pattern
            this.patternRegExp = null;
        }
        this.schemas = [];
        this.combinedSchema = null;
    }
    addSchema(id) {
        this.schemas.push(id);
        this.combinedSchema = null;
    }
    matchesPattern(fileName) {
        return this.patternRegExp && this.patternRegExp.test(fileName);
    }
    getCombinedSchema(service) {
        if (!this.combinedSchema) {
            this.combinedSchema = service.createCombinedSchema(this.combinedSchemaId, this.schemas);
        }
        return this.combinedSchema;
    }
}
class SchemaHandle {
    constructor(service, url, unresolvedSchemaContent) {
        this.service = service;
        this.url = url;
        if (unresolvedSchemaContent) {
            this.unresolvedSchema = this.service.promise.resolve(new UnresolvedSchema(unresolvedSchemaContent));
        }
    }
    getUnresolvedSchema() {
        if (!this.unresolvedSchema) {
            this.unresolvedSchema = this.service.loadSchema(this.url);
        }
        return this.unresolvedSchema;
    }
    getResolvedSchema() {
        if (!this.resolvedSchema) {
            this.resolvedSchema = this.getUnresolvedSchema().then(unresolved => {
                return this.service.resolveSchemaContent(unresolved, this.url);
            });
        }
        return this.resolvedSchema;
    }
    clearSchema() {
        this.resolvedSchema = null;
        this.unresolvedSchema = null;
    }
}
class UnresolvedSchema {
    constructor(schema, errors = []) {
        this.schema = schema;
        this.errors = errors;
    }
}
exports.UnresolvedSchema = UnresolvedSchema;
class ResolvedSchema {
    constructor(schema, errors = []) {
        this.schema = schema;
        this.errors = errors;
    }
    getSection(path) {
        return this.getSectionRecursive(path, this.schema);
    }
    getSectionRecursive(path, schema) {
        if (!schema || path.length === 0) {
            return schema;
        }
        let next = path.shift();
        if (schema.properties && schema.properties[next]) {
            return this.getSectionRecursive(path, schema.properties[next]);
        }
        else if (schema.patternProperties) {
            Object.keys(schema.patternProperties).forEach((pattern) => {
                let regex = new RegExp(pattern);
                if (regex.test(next)) {
                    return this.getSectionRecursive(path, schema.patternProperties[pattern]);
                }
            });
        }
        else if (schema.additionalProperties) {
            return this.getSectionRecursive(path, schema.additionalProperties);
        }
        else if (next.match('[0-9]+')) {
            if (schema.items) {
                return this.getSectionRecursive(path, schema.items);
            }
            else if (Array.isArray(schema.items)) {
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
exports.ResolvedSchema = ResolvedSchema;
class JSONSchemaService {
    constructor(requestService, contextService, promiseConstructor) {
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
    getRegisteredSchemaIds(filter) {
        return Object.keys(this.registeredSchemasIds).filter(id => {
            let scheme = vscode_uri_1.default.parse(id).scheme;
            return scheme !== 'schemaservice' && (!filter || filter(scheme));
        });
    }
    get promise() {
        return this.promiseConstructor;
    }
    dispose() {
        while (this.callOnDispose.length > 0) {
            this.callOnDispose.pop()();
        }
    }
    onResourceChange(uri) {
        uri = this.normalizeId(uri);
        let schemaFile = this.schemasById[uri];
        if (schemaFile) {
            schemaFile.clearSchema();
            return true;
        }
        return false;
    }
    normalizeId(id) {
        // remove trailing '#', normalize drive capitalization
        return vscode_uri_1.default.parse(id).toString();
    }
    setSchemaContributions(schemaContributions) {
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
    addSchemaHandle(id, unresolvedSchemaContent) {
        let schemaHandle = new SchemaHandle(this, id, unresolvedSchemaContent);
        this.schemasById[id] = schemaHandle;
        return schemaHandle;
    }
    getOrAddSchemaHandle(id, unresolvedSchemaContent) {
        return this.schemasById[id] || this.addSchemaHandle(id, unresolvedSchemaContent);
    }
    getOrAddFilePatternAssociation(pattern) {
        let fpa = this.filePatternAssociationById[pattern];
        if (!fpa) {
            fpa = new FilePatternAssociation(pattern);
            this.filePatternAssociationById[pattern] = fpa;
            this.filePatternAssociations.push(fpa);
        }
        return fpa;
    }
    registerExternalSchema(uri, filePatterns = null, unresolvedSchemaContent) {
        let id = this.normalizeId(uri);
        this.registeredSchemasIds[id] = true;
        if (filePatterns) {
            filePatterns.forEach(pattern => {
                this.getOrAddFilePatternAssociation(pattern).addSchema(id);
            });
        }
        return unresolvedSchemaContent ? this.addSchemaHandle(id, unresolvedSchemaContent) : this.getOrAddSchemaHandle(id);
    }
    clearExternalSchemas() {
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
    getResolvedSchema(schemaId) {
        let id = this.normalizeId(schemaId);
        let schemaHandle = this.schemasById[id];
        if (schemaHandle) {
            return schemaHandle.getResolvedSchema();
        }
        return this.promise.resolve(null);
    }
    loadSchema(url) {
        if (!this.requestService) {
            let errorMessage = localize('json.schema.norequestservice', 'Unable to load schema from \'{0}\'. No schema request service available', toDisplayString(url));
            return this.promise.resolve(new UnresolvedSchema({}, [errorMessage]));
        }
        return this.requestService(url).then(content => {
            if (!content) {
                let errorMessage = localize('json.schema.nocontent', 'Unable to load schema from \'{0}\': No content.', toDisplayString(url));
                return new UnresolvedSchema({}, [errorMessage]);
            }
            let schemaContent = {};
            let jsonErrors = [];
            schemaContent = Json.parse(content, jsonErrors);
            let errors = jsonErrors.length ? [localize('json.schema.invalidFormat', 'Unable to parse content from \'{0}\': {1}.', toDisplayString(url), Json.getParseErrorMessage(jsonErrors[0]))] : [];
            return new UnresolvedSchema(schemaContent, errors);
        }, (error) => {
            let errorMessage = localize('json.schema.unabletoload', 'Unable to load schema from \'{0}\': {1}', toDisplayString(url), error.toString());
            return new UnresolvedSchema({}, [errorMessage]);
        });
    }
    resolveSchemaContent(schemaToResolve, schemaURL) {
        let resolveErrors = schemaToResolve.errors.slice(0);
        let schema = schemaToResolve.schema;
        let contextService = this.contextService;
        let findSection = (schema, path) => {
            if (!path) {
                return schema;
            }
            let current = schema;
            if (path[0] === '/') {
                path = path.substr(1);
            }
            path.split('/').some((part) => {
                current = current[part];
                return !current;
            });
            return current;
        };
        let resolveLink = (node, linkedSchema, linkPath) => {
            let section = findSection(linkedSchema, linkPath);
            if (section) {
                for (let key in section) {
                    if (section.hasOwnProperty(key) && !node.hasOwnProperty(key)) {
                        node[key] = section[key];
                    }
                }
            }
            else {
                resolveErrors.push(localize('json.schema.invalidref', '$ref \'{0}\' in {1} can not be resolved.', linkPath, linkedSchema.id));
            }
            delete node.$ref;
        };
        let resolveExternalLink = (node, uri, linkPath, parentSchemaURL) => {
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
        let resolveRefs = (node, parentSchema, parentSchemaURL) => {
            if (!node) {
                return Promise.resolve(null);
            }
            let toWalk = [node];
            let seen = [];
            let openPromises = [];
            let collectEntries = (...entries) => {
                for (let entry of entries) {
                    if (typeof entry === 'object') {
                        toWalk.push(entry);
                    }
                }
            };
            let collectMapEntries = (...maps) => {
                for (let map of maps) {
                    if (typeof map === 'object') {
                        for (let key in map) {
                            let entry = map[key];
                            toWalk.push(entry);
                        }
                    }
                }
            };
            let collectArrayEntries = (...arrays) => {
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
                    }
                    else {
                        resolveLink(next, parentSchema, segments[1]);
                    }
                }
                collectEntries(next.items, next.additionalProperties, next.not);
                collectMapEntries(next.definitions, next.properties, next.patternProperties, next.dependencies);
                collectArrayEntries(next.anyOf, next.allOf, next.oneOf, next.items);
            }
            return this.promise.all(openPromises);
        };
        return resolveRefs(schema, schema, schemaURL).then(_ => new ResolvedSchema(schema, resolveErrors));
    }
    getSchemaForResource(resource) {
        // check for matching file names, last to first
        for (let i = this.filePatternAssociations.length - 1; i >= 0; i--) {
            let entry = this.filePatternAssociations[i];
            if (entry.matchesPattern(resource)) {
                return entry.getCombinedSchema(this).getResolvedSchema();
            }
        }
        return this.promise.resolve(null);
    }
    createCombinedSchema(combinedSchemaId, schemaIds) {
        if (schemaIds.length === 1) {
            return this.getOrAddSchemaHandle(schemaIds[0]);
        }
        else {
            let combinedSchema = {
                allOf: schemaIds.map(schemaId => ({ $ref: schemaId }))
            };
            return this.addSchemaHandle(combinedSchemaId, combinedSchema);
        }
    }
}
exports.JSONSchemaService = JSONSchemaService;
function toDisplayString(url) {
    try {
        let uri = vscode_uri_1.default.parse(url);
        if (uri.scheme === 'file') {
            return uri.fsPath;
        }
    }
    catch (e) {
    }
    return url;
}
//# sourceMappingURL=jsonSchemaService.js.map