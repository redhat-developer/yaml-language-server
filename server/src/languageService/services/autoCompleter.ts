import {SchemaToMappingTransformer} from "../schemaToMappingTransformer"
import {TextDocument, CompletionList} from 'vscode-languageserver-types';
import {JSONSchema} from "../jsonSchema";
import {YAMLDocument, YAMLNode} from 'yaml-ast-parser';

let AutoComplete = require('triesearch');

export class AutoCompleter {

    private autoCompleter;
    private schema: JSONSchema;
    private kuberSchema; 

    constructor(schema:JSONSchema){
        this.schema = schema;
        this.autoCompleter = new AutoComplete();
        this.kuberSchema = new SchemaToMappingTransformer(this.schema).getSchema();
    }

    public search(searchItem: String): Array<String>{
        return this.autoCompleter.search(searchItem).map(x => ({
            label: x.value.toString()
        }));
    }

    public searchAll() {
        return Object.keys(this.kuberSchema).map(x => ({
            label: x.toString()
        }));
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
        let getParentNodeValue = this.getParentVal(node);
        if(getParentNodeValue !== ""){
            let results = this.kuberSchema[getParentNodeValue].map(x => x.children).reduce((a, b) => a.concat(b)).filter((value, index, self) => self.indexOf(value) === index);
            this.initData(results);
        }else{
            this.initData(Object.keys(this.kuberSchema));
        }
    }

    private getParentVal(node: YAMLNode){
        let parentNodeKey = node.parent;
        while(parentNodeKey != null && parentNodeKey.key === undefined){
            parentNodeKey = parentNodeKey.parent;
        }

        if(parentNodeKey === null && node.mappings){
            parentNodeKey = node.mappings[0];
        }

        if(parentNodeKey === null || parentNodeKey.key === undefined || parentNodeKey.key === null){
            return "";
        }

        return parentNodeKey.key.value;
    }

    public generateScalarAutocompletion(nodeValue: String){
        let results = this.kuberSchema[nodeValue.toString()].map(x => x.default).filter((value, index, self) => self.indexOf(value) === index && value !== undefined);
        return results.map(x => ({
            label: x.toString()
        }));
    }

}