/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as SchemaService from './jsonSchemaService';
import {JSONWorkerContribution} from '../jsonContributions';
import {PromiseConstructor, ASTNode} from 'vscode-json-languageservice';

import { Hover, TextDocument, Position } from 'vscode-languageserver-types';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { LanguageSettings } from '../yamlLanguageService';
import { LanguageService as JSONLanguageService } from 'vscode-json-languageservice';

export class YAMLHover {

	private schemaService: SchemaService.IJSONSchemaService;
	private contributions: JSONWorkerContribution[];
	private promise: PromiseConstructor;
	private shouldHover: boolean;

	constructor(schemaService: SchemaService.IJSONSchemaService, contributions: JSONWorkerContribution[] = [], promiseConstructor: PromiseConstructor) {
		this.schemaService = schemaService;
		this.contributions = contributions;
		this.promise = promiseConstructor || Promise;
		this.shouldHover = true;
	}

	public configure(languageSettings: LanguageSettings){
		if(languageSettings){
			this.shouldHover = languageSettings.hover;
		}
	}

	public doHover(jsonLanguageService: JSONLanguageService, document: TextDocument, position: Position, doc): Thenable<Hover> {

		if(!this.shouldHover || !document){
			return this.promise.resolve(void 0);
		}

		let offset = document.offsetAt(position);
		let currentDoc = matchOffsetToDocument(offset, doc);
		if(currentDoc === null){
			return this.promise.resolve(void 0);
		}

		currentDoc.getNodeFromOffset = function(offset: number) {
			let collector = [];
			let findNode = (node: ASTNode): ASTNode => {
				if (offset >= node.offset && offset <= node.length) {
					let children = node.children;
					for (let i = 0; i < children.length && children[i].offset <= offset; i++) {
						let item = findNode(children[i]);
						if (item) {
							collector.push(item);
						}
					}
					return node;
				}
				return null;
			};
			let foundNode = findNode(currentDoc.root);
			let currMinDist = Number.MAX_VALUE;
			let currMinNode = null;
			for(let possibleNode in collector){
				let currNode = collector[possibleNode];
				let minDist = (currNode.end - offset) + (offset - currNode.start);
				if(minDist < currMinDist){
					currMinNode = currNode;
					currMinDist = minDist;
				}
			}
			return currMinNode || foundNode;
		}
		
		return jsonLanguageService.doHover(document, position, currentDoc);
	}
}
