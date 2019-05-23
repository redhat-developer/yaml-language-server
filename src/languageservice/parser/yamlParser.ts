/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vscode-nls';

import { JSONDocument, LanguageService, ASTNode, Diagnostic, Range } from 'vscode-json-languageservice';

import * as Yaml from 'yaml-ast-parser-custom-tags'
import { Schema, Type } from 'js-yaml';

import { getLineStartPositions, getPosition } from '../utils/documentPositionCalculator'
import { parseYamlBoolean } from './scalar-type';
import { filterInvalidCustomTags } from '../utils/arrUtils';
import { StringASTNodeImpl, ObjectASTNodeImpl, PropertyASTNodeImpl, ArrayASTNodeImpl, NullASTNodeImpl, BooleanASTNodeImpl, NumberASTNodeImpl } from './jsonParser2';

export class SingleYAMLDocument {
	public root;
	public errors;
	public warnings;
	public jsonDoc: JSONDocument;

	constructor() {
		this.root = null;
		this.errors = [];
		this.warnings = [];
	}
}


function recursivelyBuildAst(parent: ASTNode, node: Yaml.YAMLNode): ASTNode {

	if (!node) {
		return;
	}

	switch (node.kind) {
		case Yaml.Kind.MAP: {
			const instance = <Yaml.YamlMap>node;

			const result = new ObjectASTNodeImpl(parent, node.startPosition);
			result.length = node.endPosition - node.startPosition;

			for (const mapping of instance.mappings) {
				result.properties.push(<PropertyASTNodeImpl>recursivelyBuildAst(result, mapping))
			}

			return result;
		}
		case Yaml.Kind.MAPPING: {
			const instance = <Yaml.YAMLMapping>node;
			const key = instance.key;

			// Technically, this is an arbitrary node in YAML
			// I doubt we would get a better string representation by parsing it
			const keyNode = new StringASTNodeImpl(null, key.startPosition, key.endPosition - key.startPosition);
			keyNode.value = key.value;

			const result = new PropertyASTNodeImpl(<ObjectASTNodeImpl>parent, key.endPosition);
			result.keyNode = keyNode;
			// result.end = instance.endPosition

			const valueNode = (instance.value) ? recursivelyBuildAst(result, instance.value) : new NullASTNodeImpl(parent, instance.endPosition);
			// valueNode.location = key.value


			result.valueNode = valueNode;
			// result.setValue(valueNode)

			// TODO: Fix this whole section
			return result;
		}
		case Yaml.Kind.SEQ: {
			const instance = <Yaml.YAMLSequence>node;

			const result = new ArrayASTNodeImpl(parent, instance.startPosition);

			let count = 0;
			for (const item of instance.items) {
				if (item === null && count === instance.items.length - 1) {
					break;
				}

				// Be aware of https://github.com/nodeca/js-yaml/issues/321
				// Cannot simply work around it here because we need to know if we are in Flow or Block
				var itemNode = (item === null) ? new NullASTNodeImpl(parent, instance.endPosition) : recursivelyBuildAst(result, item);

				// TODO find what this is
				// itemNode.location = count++;
				result.items.push(itemNode);
			}

			return result;
		}
		case Yaml.Kind.SCALAR: {
			const instance = <Yaml.YAMLScalar>node;
			const type = Yaml.determineScalarType(instance)

			// The name is set either by the sequence or the mapping case.
			const value = instance.value;

			//This is a patch for redirecting values with these strings to be boolean nodes because its not supported in the parser.
			let possibleBooleanValues = ['y', 'Y', 'yes', 'Yes', 'YES', 'n', 'N', 'no', 'No', 'NO', 'on', 'On', 'ON', 'off', 'Off', 'OFF'];
			if (instance.plainScalar && possibleBooleanValues.indexOf(value.toString()) !== -1) {
				return new BooleanASTNodeImpl(parent, parseYamlBoolean(value), node.startPosition);
			}

			switch (type) {
				case Yaml.ScalarType.null: {
					return new StringASTNodeImpl(parent, instance.startPosition, instance.endPosition - instance.startPosition);
				}
				case Yaml.ScalarType.bool: {
					return new BooleanASTNodeImpl(parent, Yaml.parseYamlBoolean(value), node.startPosition);
				}
				case Yaml.ScalarType.int: {
					const result = new NumberASTNodeImpl(parent, node.startPosition);
					result.value = Yaml.parseYamlInteger(value);
					result.isInteger = true;
					return result;
				}
				case Yaml.ScalarType.float: {
					const result = new NumberASTNodeImpl(parent, node.startPosition);
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
			const instance = (<Yaml.YAMLAnchorReference>node).value

			return recursivelyBuildAst(parent, instance) ||
				new NullASTNodeImpl(parent, node.startPosition);
		}
		case Yaml.Kind.INCLUDE_REF: {
			const result = new StringASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
			result.value = node.value;
			return result;
		}
	}
}

function convertError(e: Yaml.YAMLException) {
	const r = Range.create(e.mark.position, 0, e.mark.position, e.mark.column);
	return { message: `${e.reason}`, range: r }
}

function createJSONDocument(jsonLanguageService: LanguageService, yamlDoc: Yaml.YAMLNode, startPositions: number[], text: string): SingleYAMLDocument {
	let newYAMLDocument = new SingleYAMLDocument();

	const root = recursivelyBuildAst(null, yamlDoc);

	if (!root) {
		// TODO: When this is true, consider not pushing the other errors.
		newYAMLDocument.errors.push({ message: 'Expected a YAML object, array or literal', code: 0, location: { start: yamlDoc.startPosition, end: yamlDoc.endPosition } });
	}

	const fixedErrs = fixedErrors(yamlDoc.errors, text);
	let _doc = jsonLanguageService.newJSONDocument(root, fixedErrs);

	newYAMLDocument.jsonDoc = _doc;
	newYAMLDocument.root = root;

	return newYAMLDocument;
}

function fixedErrors(errors: Yaml.YAMLException[], text: string) {
	const errArr = [];
	for (const e of errors) {
		if (e.reason !== duplicateKeyReason || (e.reason === duplicateKeyReason && !isDuplicateMergeOrAnchor(e, text))) {
			errArr.push(convertError(e));
		}
	}
	return errArr;
}

const duplicateKeyReason = 'duplicate key'
function isDuplicateMergeOrAnchor(error: Yaml.YAMLException, yamlText: string) {
	let errorConverted = convertError(error);
	let errorStart = errorConverted.range.start.character;
	let errorEnd = errorConverted.range.end.character;
	if (error.reason === duplicateKeyReason && yamlText.substring(errorStart, errorEnd).startsWith("<<")) {
		return false;
	}
	return true;
}

export class YAMLDocument {
	public documents: SingleYAMLDocument[]

	constructor(documents: SingleYAMLDocument[]) {
		this.documents = documents;
	}
}

export function parse(jsonLanguageService: LanguageService, text: string, customTags = []): YAMLDocument {

	const startPositions = getLineStartPositions(text)
	// This is documented to return a YAMLNode even though the
	// typing only returns a YAMLDocument
	const yamlDocs = [];

	const filteredTags = filterInvalidCustomTags(customTags);

	let schemaWithAdditionalTags = Schema.create(filteredTags.map((tag) => {
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

	let additionalOptions: Yaml.LoadOptions = {
		schema: schemaWithAdditionalTags
	}

	Yaml.loadAll(text, doc => yamlDocs.push(doc), additionalOptions);

	return new YAMLDocument(yamlDocs.map(doc => createJSONDocument(jsonLanguageService, doc, [], text)));
}