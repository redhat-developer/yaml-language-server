import { CompletionItem, CompletionItemKind, CompletionList, Hover, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';
import { YAMLDocument, YAMLNode, Kind } from 'yaml-ast-parser';
import { Thenable } from '../yamlLanguageService';
import { findNode } from '../utils/astServices';
import {IJSONSchemaService}  from '../services/jsonSchemaService';
import {traverse, generateParents} from '../utils/astServices';
import {snippetAutocompletor} from '../../SnippetSupport/snippet';
import { searchService } from "../services/searchService";
import { removeDuplicates } from "../utils/arrUtils";

export class hoverProvider {

    private schemaService;

    constructor(schema){
        this.schemaService = schema;
    }
    
    public doHover(document: TextDocument, position: Position, doc: YAMLDocument){

        return this.schemaService.getSchemaForResource(document.uri).then(schema =>{
        
            let searchServiceTraverser = new searchService(schema.schema);

            let offset = document.offsetAt(position);
            let node = findNode(<YAMLNode>doc, offset);
            let parentNodes = generateParents(node);

            //If node is an uncompleted root node then it can't be a parent of itself
            if(node && !node.value){
                parentNodes = parentNodes.slice(1);
            }

            return searchServiceTraverser.traverseKubernetesSchema(parentNodes, node, false, function(possibleChildren){
                let possibleChildrenNoDuplicates = removeDuplicates(possibleChildren, "description");
                let hoverNode = possibleChildrenNoDuplicates[0];
            
                if(hoverNode){
                    let startPos = node.startPosition;
                    let endPos = node.endPosition;

                    //Use the keys start position when you are hovering over a scalar item
                    if(node.kind === Kind.SCALAR){
                        startPos = node.parent.key.startPosition ? node.parent.key.startPosition : startPos;
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

        });
    
    }

}