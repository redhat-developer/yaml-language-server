import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';
import { YAMLDocument, YAMLNode, Kind } from 'yaml-ast-parser';
import { Thenable } from '../yamlLanguageService';
import { findNode } from '../utils/astServices';
import {IJSONSchemaService}  from './jsonSchemaService';
import {YAMLSChemaValidator} from './schemaValidator';
import {traverse, generateParents} from '../utils/astServices';
import {AutoCompleter} from './autoCompleter';
import {snippetAutocompletor} from '../../SnippetSupport/snippet';

export class YamlCompletion {
  private schemaService: IJSONSchemaService;
  constructor(schemaService : IJSONSchemaService){
    this.schemaService = schemaService;
  }

  public doComplete(document: TextDocument, position: Position, doc: YAMLDocument): Thenable<CompletionList> {
    let result: CompletionList = {
      items: [],
      isIncomplete: false
    };

    return this.schemaService.getSchemaForResource(document.uri).then(schema =>{
      let autoComplete = new AutoCompleter(schema.schema);

      let offset = document.offsetAt(position);
      let node = findNode(<YAMLNode>doc, offset);
      let parentNodes = generateParents(node);

      //If node is an uncompleted root node then it can't be a parent of itself
      if(node && !node.value){
        parentNodes = parentNodes.slice(1);
      }

      result.items = autoComplete.buildAutocompletionFromKuberProperties(parentNodes, node);
      
      if(!(node && (node.value && node.value.kind === Kind.SCALAR) || node.kind === Kind.SCALAR)){
        let snip = new snippitAutocompletor(document);
        snip.provideSnippitAutocompletor().forEach(compItem => {
            result.items.push(compItem);
        });
      }
      
      return result;
    });
  } 
  

}

