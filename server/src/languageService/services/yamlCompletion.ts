import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';
import { YAMLDocument, YAMLNode, Kind } from 'yaml-ast-parser';
import { Thenable } from '../yamlLanguageService';
import { findNode } from '../utils/astServices';
import {IJSONSchemaService}  from './jsonSchemaService';
import {YAMLSChemaValidator} from './schemaValidator';
import {traverse} from '../utils/astServices';
import {AutoCompleter} from './autoCompleter';

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

      //This one is for the root node
      if(node === undefined || (this.getTextRange(document, position).length === 0  && node.parent === null)){
    
        autoComplete.searchAll().map(x => result.items.push({
          label: x.toString()
        }));
      
      }else{
        
        if(this.getTextRange(document, position).length === 0){
          
          autoComplete.getKuberResults(node).map(x => result.items.push({
            label: x.toString()
          }));

        }else{
          
          autoComplete.generateResults(node);
          autoComplete.search(node.key.value).map(x => result.items.push({
            label: x.toString()
          }));
        }  
      }
      
      return result;
    });
  }
  
  private getTextRange(document, position){
    return document.getText().substring(document.getLineOffsets()[position.line], document.offsetAt(position));
  }

  private getTextRangeTrimmed(document, position){
    return this.getTextRange(document, position).trim();
  }

}

