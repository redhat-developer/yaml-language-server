import { ASTNode, NullASTNode, BooleanASTNode, ArrayASTNode, NumberASTNode, StringASTNode, PropertyASTNode, ObjectASTNode } from "vscode-json-languageservice";

export abstract class ASTNodeImpl {

	public readonly abstract type: 'object' | 'property' | 'array' | 'number' | 'boolean' | 'null' | 'string';

	public offset: number;
	public length: number;
	public readonly parent: ASTNode;

	constructor(parent: ASTNode, offset: number, length?: number) {
		this.offset = offset;
		this.length = length;
		this.parent = parent;
	}

	public get children(): ASTNode[] {
		return [];
	}

	public toString(): string {
		return 'type: ' + this.type + ' (' + this.offset + '/' + this.length + ')' + (this.parent ? ' parent: {' + this.parent.toString() + '}' : '');
	}
}

export class NullASTNodeImpl extends ASTNodeImpl implements NullASTNode {

	public type: 'null' = 'null';
	public value: null = null;
	constructor(parent: ASTNode, offset: number) {
		super(parent, offset);
	}
}

export class BooleanASTNodeImpl extends ASTNodeImpl implements BooleanASTNode {

	public type: 'boolean' = 'boolean';
	public value: boolean;

	constructor(parent: ASTNode, boolValue: boolean, offset: number) {
		super(parent, offset);
		this.value = boolValue;
	}
}

export class ArrayASTNodeImpl extends ASTNodeImpl implements ArrayASTNode {

	public type: 'array' = 'array';
	public items: ASTNode[];

	constructor(parent: ASTNode, offset: number) {
		super(parent, offset);
		this.items = [];
	}

	public get children(): ASTNode[] {
		return this.items;
	}
}

export class NumberASTNodeImpl extends ASTNodeImpl implements NumberASTNode {

	public type: 'number' = 'number';
	public isInteger: boolean;
	public value: number;

	constructor(parent: ASTNode, offset: number) {
		super(parent, offset);
		this.isInteger = true;
		this.value = Number.NaN;
	}
}

export class StringASTNodeImpl extends ASTNodeImpl implements StringASTNode {
	public type: 'string' = 'string';
	public value: string;

	constructor(parent: ASTNode, offset: number, length?: number) {
		super(parent, offset, length);
		this.value = '';
	}
}

export class PropertyASTNodeImpl extends ASTNodeImpl implements PropertyASTNode {
	public type: 'property' = 'property';
	public keyNode: StringASTNode;
	public valueNode: ASTNode;
	public colonOffset: number;

	constructor(parent: ObjectASTNode, offset: number) {
		super(parent, offset);
		this.colonOffset = -1;
	}

	public get children(): ASTNode[] {
		return this.valueNode ? [this.keyNode, this.valueNode] : [this.keyNode];
	}
}

export class ObjectASTNodeImpl extends ASTNodeImpl implements ObjectASTNode {
	public type: 'object' = 'object';
	public properties: PropertyASTNode[];

	constructor(parent: ASTNode, offset: number) {
		super(parent, offset);

		this.properties = [];
	}

	public get children(): ASTNode[] {
		return this.properties;
	}

}
