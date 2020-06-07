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

import { getLineStartPositions } from '../utils/documentPositionCalculator';
import { YAMLDocError, convertError, customTagsToAdditionalOptions } from '../utils/parseUtils';
import { parseYamlBoolean } from './scalar-type';
import { ASTNode } from '../jsonASTTypes';
import { ErrorCode } from 'vscode-json-languageservice';
import { emit } from 'process';

function recursivelyBuildAst(parent: ASTNode, node: Yaml.YAMLNode): ASTNode {

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

/**
 * `yaml-ast-parser-custom-tags` parses the AST and
 * returns ASTNodes, which are then converted into
 * these extended JSONDocuments.
 * 
 * These documents are collected into a final YAMLDocument
 * and passed to the `parseYAML` caller.
 */
export class SingleYAMLDocument extends JSONDocument {
    private lines: number[];
    public root: ASTNode;
    public errors: YAMLDocError[];
    public warnings: YAMLDocError[];
    public isKubernetes: boolean;
    public currentDocIndex: number;

    constructor(lines: number[]) {
        super(null, []);
        this.lines = lines;
        this.root = null;
        this.errors = [];
        this.warnings = [];
    }

    public getSchemas(schema, doc, node) {
        const matchingSchemas = [];
        doc.validate(schema, matchingSchemas, node.start);
        return matchingSchemas;
    }

}

/**
 * Create the JSON object for a single diagnostic??
 * Doc == Diagnostic??
 */
function createJSONDocument(yamlDoc: Yaml.YAMLNode, startPositions: number[], text: string): SingleYAMLDocument {
    const _doc = new SingleYAMLDocument(startPositions);
    _doc.root = recursivelyBuildAst(null, yamlDoc);

    if (!_doc.root) {
        // TODO: When this is true, consider not pushing the other errors.
        _doc.errors.push({
            message: localize('Invalid symbol', 'Expected a YAML object, array or literal'),
            //@ts-ignore
            code: ErrorCode.Undefined,
            location: { start: yamlDoc.startPosition, end: yamlDoc.endPosition }
        });
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

    // ! IT LOOKS LIKE WE'RE CONVERTING EVERYTHING EXCEPT DUPLICATE KEY ERRORS
    const errors = yamlDoc.errors.filter(e => e.reason !== duplicateKeyReason && !e.isWarning).map(e => convertError(e));
    const warnings = yamlDoc.errors.filter(e => (e.reason === duplicateKeyReason && isDuplicateAndNotMergeKey(e, text)) || e.isWarning).map(e => convertError(e));

    errors.forEach(e => {return _doc.errors.push(e);});
    warnings.forEach(e => {return _doc.warnings.push(e);});

    return _doc;
}

/**
 * Contains the SingleYAMLDocuments, to be passed
 * to the `parseYAML` caller.
 */
export class YAMLDocument {
    public documents: SingleYAMLDocument[];
    private errors: YAMLDocError[];
    private warnings: YAMLDocError[];

    constructor (documents: SingleYAMLDocument[]) {
        this.documents = documents;
        this.errors = [];
        this.warnings = [];
    }

}

export function parse(text: string, customTags = []): YAMLDocument {
    const additionalOptions = customTagsToAdditionalOptions(customTags);

    // Parse the AST using `yaml-ast-parser-custom-tags`
    const yamlNodes: Yaml.YAMLNode[] = [];
    Yaml.loadAll(text, doc => yamlNodes.push(doc), additionalOptions);

    // Generate the SingleYAMLDocs from the AST nodes
    const startPositions = getLineStartPositions(text);
    const yamlDocs: SingleYAMLDocument[] = yamlNodes.map(doc => createJSONDocument(doc, startPositions, text));

    // Consolidate the SingleYAMLDocs
    return new YAMLDocument(yamlDocs);
}
