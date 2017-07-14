import { CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit, InsertTextFormat } from 'vscode-languageserver-types';
import { YAMLDocument, YAMLNode } from 'yaml-ast-parser';
import { Thenable } from '../yamlLanguageService';
import { findNode } from '../utils/astServices';
import {IJSONSchemaService}  from '../services/jsonSchemaService';
import {schemaValidator} from '../services/validationService';
import {traverse} from '../utils/astServices';

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
      let validator = new schemaValidator(schema.schema, document);
      validator.traverseBackToLocation(<YAMLNode>doc);
      result.items = validator.getErrorResults();
      return result;
    });
  }

}
