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

      if(node === undefined || node.kind === Kind.MAP){
    
        return autoComplete.searchAll();
      
      }else{
      
        if(node.kind === Kind.SCALAR){
    
          return autoComplete.generateScalarAutocompletion(node.parent.key.value);
      
        }else if(node.value != null && node.kind === Kind.MAPPING && node.value.kind === Kind.SCALAR){
      
          return autoComplete.generateScalarAutocompletion(node.key.value);
      
        }else{
      
          return autoComplete.generateRegularAutocompletion(node);
                
        }

      }    
    });
  } 
  

}

