

import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';
import { YAMLDocument, YAMLNode } from 'yaml-ast-parser';
import { Thenable } from '../yamlLanguageService';
import { findNode } from '../utils/astServices';
import {IJSONSchemaService}  from './jsonSchemaService';
import {YAMLSChemaValidator} from './schemaValidator';
import {traverse} from '../utils/astServices';

export class YamlCompletion {
  private schemaService: IJSONSchemaService;
  constructor(schemaService : IJSONSchemaService){
    this.schemaService = schemaService;
  }

  public doComplete(document: TextDocument, doc: YAMLDocument): Thenable<CompletionList> {
    let result: CompletionList = {
      items: [],
      isIncomplete: false
    };

    return this.schemaService.getSchemaForResource(document.uri).then(schema =>{
      //let validator = new YAMLSChemaValidator(schema.schema, document);
      //traverse(<YAMLNode>doc,validator);
      //result.items = validator.getErrorResults();
      return result;
    });
  }

}
