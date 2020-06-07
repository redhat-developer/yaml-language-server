/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { JSONDocument, NullASTNodeImpl, PropertyASTNodeImpl, StringASTNodeImpl, ObjectASTNodeImpl, NumberASTNodeImpl, ArrayASTNodeImpl, BooleanASTNodeImpl } from './jsonParser07';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import * as Yaml from 'yaml-ast-parser-custom-tags';
import { Schema, Type } from 'js-yaml';

import { getLineStartPositions } from '../utils/documentPositionCalculator';
import { parseYamlBoolean } from './scalar-type';
import { filterInvalidCustomTags } from '../utils/arrUtils';
import { ASTNode } from '../jsonASTTypes';
import { ErrorCode } from 'vscode-json-languageservice';
import { emit } from 'process';

interface YAMLDocError {
    message: string
    range: {
        start: {
            line: number
            character: number
        }
        end: {
            line: number
            character: number
        }
    }
    severity: number
}

export class SingleYAMLDocument extends JSONDocument {
    private lines;
    public root;
    public errors: YAMLDocError[];
    public warnings;
    public isKubernetes: boolean;
    public currentDocIndex: number;

    constructor (lines: number[]) {
        super(null, []);
        this.lines = lines;
        this.root = null;
        this.errors = [];
        this.warnings = [];
    }

    public getSchemas (schema, doc, node) {
        const matchingSchemas = [];
        doc.validate(schema, matchingSchemas, node.start);
        return matchingSchemas;
    }

}

function recursivelyBuildAst (parent: ASTNode, node: Yaml.YAMLNode): ASTNode {

    if (!node) {
        return;
    }

    switch (node.kind) {
        case Yaml.Kind.MAP: {
            const instance = <Yaml.YamlMap>node;

            const result = new ObjectASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);

            for (const mapping of instance.mappings) {
                result.properties.push(<PropertyASTNodeImpl>recursivelyBuildAst(result, mapping));
            }

            return result;
        }
        case Yaml.Kind.MAPPING: {
            const instance = <Yaml.YAMLMapping>node;
            const key = instance.key;

            const result = new PropertyASTNodeImpl(parent as ObjectASTNodeImpl, instance.startPosition, instance.endPosition - instance.startPosition);

            // Technically, this is an arbitrary node in YAML
            // I doubt we would get a better string representation by parsing it
            const keyNode = new StringASTNodeImpl(result, key.startPosition, key.endPosition - key.startPosition);
            keyNode.value = key.value;

            const valueNode = (instance.value) ? recursivelyBuildAst(result, instance.value) : new NullASTNodeImpl(parent, instance.endPosition, 0);
            valueNode.location = key.value;

            result.keyNode = keyNode;
            result.valueNode = valueNode;

            return result;
        }
        case Yaml.Kind.SEQ: {
            const instance = <Yaml.YAMLSequence>node;

            const result = new ArrayASTNodeImpl(parent, instance.startPosition, instance.endPosition - instance.startPosition);

            const count = 0;
            for (const item of instance.items) {
                if (item === null && count === instance.items.length - 1) {
                    break;
                }

                // Be aware of https://github.com/nodeca/js-yaml/issues/321
                // Cannot simply work around it here because we need to know if we are in Flow or Block
                const itemNode = (item === null) ? new NullASTNodeImpl(parent, instance.endPosition, 0) : recursivelyBuildAst(result, item);

                // itemNode.location = count++;
                result.children.push(itemNode);
            }

            return result;
        }
        case Yaml.Kind.SCALAR: {
            const instance = <Yaml.YAMLScalar>node;
            const type = Yaml.determineScalarType(instance);

            // The name is set either by the sequence or the mapping case.
            const value = instance.value;

            //This is a patch for redirecting values with these strings to be boolean nodes because its not supported in the parser.
            const possibleBooleanValues = ['y', 'Y', 'yes', 'Yes', 'YES', 'n', 'N', 'no', 'No', 'NO', 'on', 'On', 'ON', 'off', 'Off', 'OFF'];
            if (instance.plainScalar && possibleBooleanValues.indexOf(value.toString()) !== -1) {
                return new BooleanASTNodeImpl(parent, parseYamlBoolean(value), node.startPosition, node.endPosition - node.startPosition);
            }

            switch (type) {
                case Yaml.ScalarType.null: {
                    return new NullASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
                }
                case Yaml.ScalarType.bool: {
                    return new BooleanASTNodeImpl(parent, Yaml.parseYamlBoolean(value), node.startPosition, node.endPosition - node.startPosition);
                }
                case Yaml.ScalarType.int: {
                    const result = new NumberASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
                    result.value = Yaml.parseYamlInteger(value);
                    result.isInteger = true;
                    return result;
                }
                case Yaml.ScalarType.float: {
                    const result = new NumberASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
                    result.value = Yaml.parseYamlFloat(value);
                    result.isInteger = false;
                    return result;
                }
                case Yaml.ScalarType.string: {
                    const result = new StringASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
                    result.value = node.value;
                    return result;
                }
            }

            break;
        }
        case Yaml.Kind.ANCHOR_REF: {
            const instance = (<Yaml.YAMLAnchorReference>node).value;

            return recursivelyBuildAst(parent, instance) ||
                new NullASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
        }
        case Yaml.Kind.INCLUDE_REF: {
            const result = new StringASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
            result.value = node.value;
            return result;
        }
    }
}

function convertError(e: Yaml.YAMLException): YAMLDocError {
    const exception = {
        exception: e,
        string: e.toString(),
        mark: {
            mark: e.mark,
            string: e.mark.toString(),
            snippet: {
                snippet: e.mark.getSnippet(),
                length: e.mark.getSnippet().length
            }
        }
    };
    console.log(exception);

    const line = e.mark.line === 0 ? 0 : e.mark.line - 1;
    /**
     * I think this calculation is wrong???
     */
    const character = e.mark.position + e.mark.column === 0 ? 0 : e.mark.position + e.mark.column - 1;

    /**
     * Something funny going on here -- why would these
     * errors start and end at the same position?
     */
    return { message: `${e.reason}`, range: {
        start: {
            line,
            character
        },
        end: {
            line,
            character
        },
    },
    severity: 2
    };
}

function createJSONDocument (yamlDoc: Yaml.YAMLNode, startPositions: number[], text: string) {
    const _doc = new SingleYAMLDocument(startPositions);
    _doc.root = recursivelyBuildAst(null, yamlDoc);

    if (!_doc.root) {
        // TODO: When this is true, consider not pushing the other errors.
        _doc.errors.push({ message: localize('Invalid symbol', 'Expected a YAML object, array or literal'),
        //@ts-ignore
        code: ErrorCode.Undefined,
        location: { start: yamlDoc.startPosition, end: yamlDoc.endPosition } });
    }

    const duplicateKeyReason = 'duplicate key';

    //Patch ontop of yaml-ast-parser to disable duplicate key message on merge key
    const isDuplicateAndNotMergeKey = function (error: Yaml.YAMLException, yamlText: string) {
        const errorStart = error.mark.position;
        const errorEnd = error.mark.position + error.mark.column;
        if (error.reason === duplicateKeyReason && yamlText.substring(errorStart, errorEnd).startsWith('<<')) {
            return false;
        }
        return true;
    };
    // ! IT LOOKS LIKE WE'RE ONLY CONVERTING DUPLICATE KEY ERRORS?
    const errors = yamlDoc.errors.filter(e => e.reason !== duplicateKeyReason && !e.isWarning).map(e => convertError(e));
    const warnings = yamlDoc.errors.filter(e => (e.reason === duplicateKeyReason && isDuplicateAndNotMergeKey(e, text)) || e.isWarning).map(e => convertError(e));

    errors.forEach(e => {return _doc.errors.push(e);});
    warnings.forEach(e => {return _doc.warnings.push(e);});

    return _doc;
}

export class YAMLDocument {
    public documents: SingleYAMLDocument[];
    private errors;
    private warnings;

    constructor (documents: SingleYAMLDocument[]) {
        this.documents = documents;
        this.errors = [];
        this.warnings = [];
    }

}

export function parse (text: string, customTags = []): YAMLDocument {

    const startPositions = getLineStartPositions(text);
    // This is documented to return a YAMLNode even though the
    // typing only returns a YAMLDocument
    const yamlDocs = [];

    const filteredTags = filterInvalidCustomTags(customTags);

    const schemaWithAdditionalTags = Schema.create(filteredTags.map(tag => {
        const typeInfo = tag.split(' ');
        return new Type(typeInfo[0], { kind: (typeInfo[1] && typeInfo[1].toLowerCase()) || 'scalar' });
    }));

    /**
     * Collect the additional tags into a map of string to possible tag types
     */
    const tagWithAdditionalItems = new Map<string, string[]>();
    filteredTags.forEach(tag => {
        const typeInfo = tag.split(' ');
        const tagName = typeInfo[0];
        const tagType = (typeInfo[1] && typeInfo[1].toLowerCase()) || 'scalar';
        if (tagWithAdditionalItems.has(tagName)) {
            tagWithAdditionalItems.set(tagName, tagWithAdditionalItems.get(tagName).concat([tagType]));
        } else {
            tagWithAdditionalItems.set(tagName, [tagType]);
        }
    });

    tagWithAdditionalItems.forEach((additionalTagKinds, key) => {
        const newTagType = new Type(key, { kind: additionalTagKinds[0] || 'scalar' });
        newTagType.additionalKinds = additionalTagKinds;
        schemaWithAdditionalTags.compiledTypeMap[key] = newTagType;
    });

    const additionalOptions: Yaml.LoadOptions = {
        schema: schemaWithAdditionalTags
    };

    // What does this do?
    Yaml.loadAll(text, doc => yamlDocs.push(doc), additionalOptions);

    return new YAMLDocument(yamlDocs.map(doc => {return createJSONDocument(doc, startPositions, text);}));
}
