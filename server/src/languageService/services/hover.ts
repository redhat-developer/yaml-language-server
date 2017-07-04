import { CompletionItem, CompletionItemKind, CompletionList, Hover, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';
import { YAMLDocument, YAMLNode, Kind } from 'yaml-ast-parser';
import { Thenable } from '../yamlLanguageService';
import { findNode } from '../utils/astServices';
import {IJSONSchemaService}  from './jsonSchemaService';
import {YAMLSChemaValidator} from './schemaValidator';
import {traverse, generateParents} from '../utils/astServices';
import {AutoCompleter} from './autoCompleter';
import {snippetAutocompletor} from '../../SnippetSupport/snippet';
import { hoverService } from "./hoverService";
export class hoverCompleter {

    private schemaService;

    constructor(schema){
        this.schemaService = schema;
    }
    
    public doHover(document: TextDocument, position: Position, doc: YAMLDocument){

        return this.schemaService.getSchemaForResource(document.uri).then(schema =>{
        
            let autoComplete = new hoverService(schema.schema);

            let offset = document.offsetAt(position);
            let node = findNode(<YAMLNode>doc, offset);
            let parentNodes = generateParents(node);

            //If node is an uncompleted root node then it can't be a parent of itself
            if(node && !node.value){
                parentNodes = parentNodes.slice(1);
            }

            let hoverNode =  autoComplete.buildAutocompletionFromKuberProperties(parentNodes, node)[0];
            if(hoverNode){
                let startPos = node.startPosition;
                let endPos = node.endPosition;
                if(node.kind === Kind.SCALAR){
                    startPos = node.parent.key.startPosition ? node.parent.key.startPosition : startPos;
                    endPos = node.parent.key.endPosition ? node.parent.key.endPosition : endPos;
                }
                let hoverRange = Range.create(document.positionAt(startPos), document.positionAt(endPos));
                let hoverItem : Hover = {
                    contents: hoverNode.description,
                    range: hoverRange
                };

                return hoverItem;
            }

            return null;       

        });
    
    }

}