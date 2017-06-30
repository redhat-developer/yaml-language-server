'use strict';

import { JSONDocument, ASTNode, ErrorCode, BooleanASTNode, NullASTNode, ArrayASTNode, NumberASTNode, ObjectASTNode, PropertyASTNode, StringASTNode } from './jsonParser';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import * as Yaml from 'yaml-ast-parser'
import { Kind } from 'yaml-ast-parser'

import { getLineStartPositions, getPosition } from './documentPositionCalculator'

export class YAMLDocument extends JSONDocument {
	private lines;

	constructor(lines: number[]) {
		super({disallowComments: false, ignoreDanglingComma: true});
		this.lines = lines;
	}

	// TODO: This is complicated, messy and probably buggy
	// It should be re-written.
	// To get the correct behavior, it probably needs to be aware of
	// the type of the nodes it is processing since there are no delimiters
	// like in JSON. (ie. so it correctly returns 'object' vs 'property')
	public getNodeFromOffsetEndInclusive(offset: number): ASTNode {
		if (!this.root) {
			return;
		}
		if (offset < this.root.start || offset > this.root.end) {
			// We somehow are completely outside the document
			// This is unexpected
			console.log("Attempting to resolve node outside of document")
			return null;
		}

		const children = this.root.getChildNodes()

		function* sliding2(nodes: ASTNode[]) {
			var i = 0;
			while (i < nodes.length) {
				yield [nodes[i], (i === nodes.length) ? null : nodes[i + 1]]
				i++;
			}
		}

		const onLaterLine = (offset: number, node: ASTNode) => {
			const { line: actualLine } = getPosition(offset, this.lines)
			const { line: nodeEndLine } = getPosition(node.end, this.lines)

			return actualLine > nodeEndLine;
		}

		let findNode = (nodes: ASTNode[]): ASTNode => {
			if (nodes.length === 0) {
				return null;
			}

			var gen = sliding2(nodes);

			let result: IteratorResult<ASTNode[]> = { done: false, value: undefined }

			for (let [first, second] of gen) {
				const end = (second) ? second.start : first.parent.end
				if (offset >= first.start && offset < end) {
					const children = first.getChildNodes();

					const foundChild = findNode(children)

					if (foundChild) {
						if (foundChild['isKey'] && foundChild.end < offset) {
							return foundChild.parent;
						}

						if (foundChild.type === "null") {
							return null;
						}
					}

					if (!foundChild && onLaterLine(offset, first)) {
						return this.getNodeByIndent(this.lines, offset, this.root)
					}

					return foundChild || first;
				}
			}

			return null;
		}

		return findNode(children) || this.root;
	}

	public getNodeFromOffset(offset: number): ASTNode {
		return this.getNodeFromOffsetEndInclusive(offset);
	}

	private getNodeByIndent = (lines: number[], offset: number, node: ASTNode) => {

		const { line, column: indent } = getPosition(offset, this.lines)

		const children = node.getChildNodes()

		function findNode(children) {
			for (var idx = 0; idx < children.length; idx++) {
				var child = children[idx];

				const { line: childLine, column: childCol } = getPosition(child.start, lines);

				if (childCol > indent) {
					return null;
				}

				const newChildren = child.getChildNodes()
				const foundNode = findNode(newChildren)

				if (foundNode) {
					return foundNode;
				}

				// We have the right indentation, need to return based on line
				if (childLine == line) {
					return child;
				}
				if (childLine > line) {
					// Get previous
					(idx - 1) >= 0 ? children[idx - 1] : child;
				}
				// Else continue loop to try next element
			}

			// Special case, we found the correct
			return children[children.length - 1]
		}

		return findNode(children) || node
	}
}


function recursivelyBuildAst(parent: ASTNode, node: Yaml.YAMLNode): ASTNode {

	if (!node) {
		return;
	}

	switch (node.kind) {
		case Yaml.Kind.MAP: {
			const instance = <Yaml.YamlMap>node;

			const result = new ObjectASTNode(parent, null, node.startPosition, node.endPosition)
			result.addProperty

			for (const mapping of instance.mappings) {
				result.addProperty(<PropertyASTNode>recursivelyBuildAst(result, mapping))
			}

			return result;
		}
		case Yaml.Kind.MAPPING: {
			const instance = <Yaml.YAMLMapping>node;
			const key = instance.key;

			// Technically, this is an arbitrary node in YAML
			// I doubt we would get a better string representation by parsing it
			const keyNode = new StringASTNode(null, null, true, key.startPosition, key.endPosition);
			keyNode.value = key.value;

			const result = new PropertyASTNode(parent, keyNode)
			result.end = instance.endPosition

			const valueNode = (instance.value) ? recursivelyBuildAst(result, instance.value) : new NullASTNode(parent, key.value, instance.endPosition, instance.endPosition)
			valueNode.location = key.value

			result.setValue(valueNode)

			return result;
		}
		case Yaml.Kind.SEQ: {
			const instance = <Yaml.YAMLSequence>node;

			const result = new ArrayASTNode(parent, null, instance.startPosition, instance.endPosition);

			let count = 0;
			for (const item of instance.items) {
				if (item === null && count === instance.items.length - 1) {
					break;
				}

				// Be aware of https://github.com/nodeca/js-yaml/issues/321
				// Cannot simply work around it here because we need to know if we are in Flow or Block
				var itemNode = (item === null) ? new NullASTNode(parent, null, instance.endPosition, instance.endPosition) : recursivelyBuildAst(result, item);

				itemNode.location = count++;
				result.addItem(itemNode);
			}

			return result;
		}
		case Yaml.Kind.SCALAR: {
			const instance = <Yaml.YAMLScalar>node;

			const type = determineScalarType(instance)

			// The name is set either by the sequence or the mapping case.
			const name = null;
			const value = instance.value;

			switch (type) {
				case ScalarType.null: {
					return new NullASTNode(parent, name, instance.startPosition, instance.endPosition);
				}
				case ScalarType.bool: {
					return new BooleanASTNode(parent, name, parseYamlBoolean(value), node.startPosition, node.endPosition)
				}
				case ScalarType.int: {
					const result = new NumberASTNode(parent, name, node.startPosition, node.endPosition);
					result.value = parseYamlInteger(value);
					result.isInteger = true;
					return result;
				}
				case ScalarType.float: {
					const result = new NumberASTNode(parent, name, node.startPosition, node.endPosition);
					result.value = parseYamlFloat(value);
					result.isInteger = false;
					return result;
				}
				case ScalarType.string: {
					const result = new StringASTNode(parent, name, false, node.startPosition, node.endPosition);
					result.value = node.value;
					return result;
				}
			}

			break;
		}
		case Yaml.Kind.ANCHOR_REF: {
			const instance = (<Yaml.YAMLAnchorReference>node).value

			return recursivelyBuildAst(parent, instance) ||
				new NullASTNode(parent, null, node.startPosition, node.endPosition);
		}
		case Yaml.Kind.INCLUDE_REF: {
			// Issue Warning
			console.log("Unsupported feature, node kind: " + node.kind);
			break;
		}
	}
}

export function parseYamlBoolean(input: string): boolean {
	if (["true", "True", "TRUE"].lastIndexOf(input) >= 0) {
		return true;
	}
	else if (["false", "False", "FALSE"].lastIndexOf(input) >= 0) {
		return false;
	}
	throw `Invalid boolean "${input}"`
}

function safeParseYamlInteger(input: string): number {
	// Use startsWith when es6 methods becomes available
	if (input.lastIndexOf('0o', 0) === 0) {
		return parseInt(input.substring(2), 8)
	}

	return parseInt(input);
}

export function parseYamlInteger(input: string): number {
	const result = safeParseYamlInteger(input)

	if (isNaN(result)) {
		throw `Invalid integer "${input}"`
	}

	return result;
}

export function parseYamlFloat(input: string): number {

	if ([".nan", ".NaN", ".NAN"].lastIndexOf(input) >= 0) {
		return NaN;
	}

	const infinity = /^([-+])?(?:\.inf|\.Inf|\.INF)$/
	const match = infinity.exec(input)
	if (match) {
		return (match[1] === '-') ? -Infinity : Infinity;
	}

	const result = parseFloat(input)

	if (!isNaN(result)) {
		return result;
	}

	throw `Invalid float "${input}"`
}

export enum ScalarType {
	null, bool, int, float, string
}

export function determineScalarType(node: Yaml.YAMLScalar): ScalarType {
	if (node === undefined) {
		return ScalarType.null;
	}

	if (node.doubleQuoted || !node.plainScalar || node['singleQuoted']) {
		return ScalarType.string
	}

	const value = node.value;

	if (["null", "Null", "NULL", "~", ''].indexOf(value) >= 0) {
		return ScalarType.null;
	}

	if (value === null || value === undefined) {
		return ScalarType.null;
	}

	if (["true", "True", "TRUE", "false", "False", "FALSE"].indexOf(value) >= 0) {
		return ScalarType.bool;
	}

	const base10 = /^[-+]?[0-9]+$/
	const base8 = /^0o[0-7]+$/
	const base16 = /^0x[0-9a-fA-F]+$/

	if (base10.test(value) || base8.test(value) || base16.test(value)) {
		return ScalarType.int;
	}

	const float = /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/
	const infinity = /^[-+]?(\.inf|\.Inf|\.INF)$/
	if (float.test(value) || infinity.test(value) || [".nan", ".NaN", ".NAN"].indexOf(value) >= 0) {
		return ScalarType.float;
	}

	return ScalarType.string;
}

function convertError(e: Yaml.YAMLException) {
	// Subtract 2 because \n\0 is added by the parser (see loader.ts/loadDocuments)
	const bufferLength = e.mark.buffer.length - 2;

	// TODO determine correct positioning.
	return { message: `${e.message}`, location: { start: Math.min(e.mark.position, bufferLength - 1), end: bufferLength, code: ErrorCode.Undefined } }
}

export function parse(text: string): JSONDocument {

	const startPositions = getLineStartPositions(text)
	let _doc = new YAMLDocument(startPositions);
	// This is documented to return a YAMLNode even though the
	// typing only returns a YAMLDocument
	const yamlDoc = <Yaml.YAMLNode>Yaml.safeLoad(text, {})

	_doc.root = recursivelyBuildAst(null, yamlDoc)

	if (!_doc.root) {
		// TODO: When this is true, consider not pushing the other errors.
		_doc.errors.push({ message: localize('Invalid symbol', 'Expected a YAML object, array or literal'), code: ErrorCode.Undefined, location: { start: yamlDoc.startPosition, end: yamlDoc.endPosition } });
	}

	const duplicateKeyReason = 'duplicate key'

	const errors = yamlDoc.errors.filter(e => e.reason !== duplicateKeyReason).map(e => convertError(e))
	const warnings = yamlDoc.errors.filter(e => e.reason === duplicateKeyReason).map(e => convertError(e))

	errors.forEach(e => _doc.errors.push(e));
	warnings.forEach(e => _doc.warnings.push(e));

	return _doc;
}