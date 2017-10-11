'use strict';

import { JSONSchema } from 'vscode-json-languageservice/lib/jsonSchema';
import { ASTNode, ErrorCode, BooleanASTNode, NullASTNode, ArrayASTNode, NumberASTNode, ObjectASTNode, PropertyASTNode, StringASTNode, IApplicableSchema, JSONDocument } from './jsonParser';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import * as Yaml from 'yaml-ast-parser'
import { Kind } from 'yaml-ast-parser'

import { getLineStartPositions, getPosition } from '../utils/documentPositionCalculator'

export class SingleYAMLDocument extends JSONDocument {
	private lines;
    public root;
	public _errors;
	public _warnings;

	constructor(lines: number[]) {
		super(null, []);
		this.lines = lines;
        this.root = null;
		this._errors = [];
		this._warnings = [];
	}

	public getSchemas(schema, doc, node) {
		let matchingSchemas = [];
		doc.validate(schema, matchingSchemas, node.start);
		return matchingSchemas;
	}

	// TODO: This is complicated, messy and probably buggy
	// It should be re-written.
	// To get the correct behavior, it probably needs to be aware of
	// the type of the nodes it is processing since there are no delimiters
	// like in JSON. (ie. so it correctly returns 'object' vs 'property')
	// public getNodeFromOffsetEndInclusive(offset: number): ASTNode {
	// 	if (!this.root) {
	// 		return;
	// 	}
	// 	if (offset < this.root.start || offset > this.root.end) {
	// 		// We somehow are completely outside the document
	// 		// This is unexpected
	// 		console.log("Attempting to resolve node outside of document")
	// 		return null;
	// 	}

	// 	const children = this.root.getChildNodes()

	// 	function* sliding2(nodes: ASTNode[]) {
	// 		var i = 0;
	// 		while (i < nodes.length) {
	// 			yield [nodes[i], (i === nodes.length) ? null : nodes[i + 1]]
	// 			i++;
	// 		}
	// 	}

	// 	const onLaterLine = (offset: number, node: ASTNode) => {
	// 		const { line: actualLine } = getPosition(offset, this.lines)
	// 		const { line: nodeEndLine } = getPosition(node.end, this.lines)

	// 		return actualLine > nodeEndLine;
	// 	}

	// 	let findNode = (nodes: ASTNode[]): ASTNode => {
	// 		if (nodes.length === 0) {
	// 			return null;
	// 		}

	// 		var gen = sliding2(nodes);

	// 		let result: IteratorResult<ASTNode[]> = { done: false, value: undefined }

	// 		for (let [first, second] of gen) {
	// 			const end = (second) ? second.start : first.parent.end
	// 			if (offset >= first.start && offset <= end) {
	// 				const children = first.getChildNodes();

	// 				const foundChild = findNode(children)

	// 				if (foundChild) {
	// 					if (foundChild['isKey'] && foundChild.end < offset) {
	// 						return foundChild.parent;
	// 					}

	// 					//if (foundChild.type === "null") {
	// 					//	return null;
	// 					//}
	// 				}

	// 				if (!foundChild && onLaterLine(offset, first)) {
	// 					return this.getNodeByIndent(this.lines, offset, this.root)
	// 				}

	// 				return foundChild || first;
	// 			}
	// 		}

	// 		return null;
	// 	}

	// 	return findNode(children) || this.root;
	// }

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
			const type = Yaml.determineScalarType(instance)

			// The name is set either by the sequence or the mapping case.
			const name = null;
			const value = instance.value;

			switch (type) {
				case Yaml.ScalarType.null: {
					return new NullASTNode(parent, name, instance.startPosition, instance.endPosition);
				}
				case Yaml.ScalarType.bool: {
					return new BooleanASTNode(parent, name, Yaml.parseYamlBoolean(value), node.startPosition, node.endPosition)
				}
				case Yaml.ScalarType.int: {
					const result = new NumberASTNode(parent, name, node.startPosition, node.endPosition);
					result.value = Yaml.parseYamlInteger(value);
					result.isInteger = true;
					return result;
				}
				case Yaml.ScalarType.float: {
					const result = new NumberASTNode(parent, name, node.startPosition, node.endPosition);
					result.value = Yaml.parseYamlFloat(value);
					result.isInteger = false;
					return result;
				}
				case Yaml.ScalarType.string: {
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

function convertError(e: Yaml.YAMLException) {
	// Subtract 2 because \n\0 is added by the parser (see loader.ts/loadDocuments)
	const bufferLength = e.mark.buffer.length - 2;

	// TODO determine correct positioning.
	return { message: `${e.message}`, location: { start: Math.min(e.mark.position, bufferLength - 1), end: bufferLength, code: ErrorCode.Undefined } }
}

function createJSONDocument(yamlDoc: Yaml.YAMLNode, startPositions: number[]){
	let _doc = new SingleYAMLDocument(startPositions);
	_doc.root = recursivelyBuildAst(null, yamlDoc)

	if (!_doc.root) {
		// TODO: When this is true, consider not pushing the other errors.
		_doc._errors.push({ message: localize('Invalid symbol', 'Expected a YAML object, array or literal'), code: ErrorCode.Undefined, location: { start: yamlDoc.startPosition, end: yamlDoc.endPosition } });
	}

	const duplicateKeyReason = 'duplicate key'

	const errors = yamlDoc.errors.filter(e => e.reason !== duplicateKeyReason && !e.isWarning).map(e => convertError(e))
	const warnings = yamlDoc.errors.filter(e => e.reason === duplicateKeyReason || e.isWarning).map(e => convertError(e))

	errors.forEach(e => _doc._errors.push(e));
	warnings.forEach(e => _doc._warnings.push(e));

	return _doc;
}

export class YAMLDocument {
	public documents: JSONDocument[]
	private _errors;
	private _warnings;

	constructor(documents: JSONDocument[]){
		this.documents = documents;
	}

	public getNodeFromOffset(offset: number): ASTNode {
		// Depends on the documents being sorted
		for (let element of this.documents) {
			if (offset <= element.root.end) {
				return element.getNodeFromOffset(offset)
			}
		}

		return undefined;
	}

	public validate(schema: JSONSchema, matchingSchemas: IApplicableSchema[] = null, offset: number = -1): void {
		this.documents.forEach(doc => {
			doc.validate(schema);
		});
	}

}

export function parse(text: string): YAMLDocument {

	const startPositions = getLineStartPositions(text)
	// This is documented to return a YAMLNode even though the
	// typing only returns a YAMLDocument
	const yamlDocs = []
	Yaml.loadAll(text, doc => yamlDocs.push(doc), {})

	return new YAMLDocument(yamlDocs.map(doc => createJSONDocument(doc, startPositions)));
}