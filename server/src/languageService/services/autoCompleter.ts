import {SchemaToMappingTransformer} from "../schemaToMappingTransformer"
import {TextDocument} from 'vscode-languageserver-types';
import {JSONSchema} from "../jsonSchema";
import {YAMLDocument, YAMLNode} from 'yaml-ast-parser';
let AutoComplete = require('triesearch');

export class AutoCompleter {

    private document: TextDocument;
    private autoCompleter;
    private kuberSchema: JSONSchema; 

    constructor(document: TextDocument, schema:JSONSchema){
        this.document = document;
        this.autoCompleter = new AutoComplete();
        this.kuberSchema = new SchemaToMappingTransformer(schema)["mappingKuberSchema"];
    }

    public search(searchItem: String): Array<String>{
        return this.autoCompleter.search(searchItem);
    }

    public initData(data:Array<String>): void {
        this.purge();
        this.autoCompleter.initialize(data);
    }

    public purge(): void{
        this.autoCompleter.words = 0;
        this.autoCompleter.prefixes = 0;
        this.autoCompleter.value = "";
        this.autoCompleter.children = [];
    }

    public generateResults(node){
        let getParentNodeKey = this.getParentKey(node);
        if(node.parent === null || getParentNodeKey === null || getParentNodeKey.key === undefined || getParentNodeKey.key === null){
            return [];
        }
        let results = this.kuberSchema[getParentNodeKey.key.value].map(x => x.children).reduce((a, b) => a.concat(b)).filter((value, index, self) => self.indexOf(value) === index);
        this.initData(results);
    }

    private getParentKey(node: YAMLNode){
        let parentNodeKey = node.parent;
        while(parentNodeKey != null && parentNodeKey.key === undefined){
            parentNodeKey = parentNodeKey.parent;
        }
        return parentNodeKey;
    }



}