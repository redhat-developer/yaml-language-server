import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';
import { YAMLDocument, YAMLNode } from 'yaml-ast-parser';
import { Thenable } from '../yamlLanguageService';
import {IJSONSchemaService}  from '../services/jsonSchemaService';
import {schemaValidator} from '../services/validationService';

export class validationProvider {
  private schemaService: IJSONSchemaService;
  constructor(schemaService : IJSONSchemaService){
    this.schemaService = schemaService;
  }

  public doValidation(document: TextDocument, doc: YAMLDocument): Thenable<CompletionList> {
    let result: CompletionList = {
      items: [],
      isIncomplete: false
    };

    return this.schemaService.getSchemaForResource(document.uri).then(schema =>{
      if(schema && schema.schema){
        let validator = new schemaValidator(schema.schema, document);
        validator.traverseBackToLocation(<YAMLNode>doc);
        result.items = validator.getErrorResults();
      }

      return result;
    });
  }

}