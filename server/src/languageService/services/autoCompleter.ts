import {SchemaToMappingTransformer} from "../schemaToMappingTransformer"
import {TextDocument} from 'vscode-languageserver-types';
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
        this.kuberSchema = new SchemaToMappingTransformer(this.schema)["mappingKuberSchema"];
    }

    public search(searchItem: String): Array<String>{
        return this.autoCompleter.search(searchItem).map(x => x.value);
    }

    public searchAll(): Array<String>{
        return Object.keys(this.kuberSchema);
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
            this.initData(this.searchAll());
        }
    }

    public getKuberResults(node){
        return this.kuberSchema[node.key.value].map(x => x.children).reduce((a, b) => a.concat(b)).filter((value, index, self) => self.indexOf(value) === index);
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



}