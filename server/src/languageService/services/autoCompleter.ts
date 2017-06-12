import {SchemaToMappingTransformer} from "../schemaToMappingTransformer"
import {TextDocument, CompletionList} from 'vscode-languageserver-types';
import {JSONSchema} from "../jsonSchema";
import {YAMLDocument, YAMLNode, Kind} from 'yaml-ast-parser';

let AutoComplete = require('triesearch');

export class AutoCompleter {

    private autoCompleter;
    private schema: JSONSchema;
    private kuberSchema; 
    private currentWords;

    constructor(schema:JSONSchema){
        this.schema = schema;
        this.autoCompleter = new AutoComplete();
        this.kuberSchema = new SchemaToMappingTransformer(this.schema).getSchema();
        this.currentWords = [];
    }

    public search(searchItem: String): Array<String>{
        let results = this.autoCompleter.search(searchItem).map(x => ({
            label: x.value.toString()
        }));
        return results;
    }

    public searchAll() {
        let results = Object.keys(this.kuberSchema);
        return this.arrToCompletionList(results);
    }

    public initData(data:Array<String>): void {
        this.purge();
        this.autoCompleter.initialize(data);
    }

    private purge(): void{
        this.autoCompleter.words = 0;
        this.autoCompleter.prefixes = 0;
        this.autoCompleter.value = "";
        this.autoCompleter.children = [];
    }

    public generateResults(node){
        let genVal = "";
        
        if(node.kind === Kind.MAPPING && node.value === null){
            genVal = this.getParentVal(node);
        }else{
            genVal = node.key.value;
        }

        if(genVal === ""){
            this.initData(Object.keys(this.kuberSchema));
            return this.search(node.key.value);    
        }else{
            
            let results = this.kuberSchema[genVal].map(x => x.children).reduce((a, b) => a.concat(b)).filter((value, index, self) => self.indexOf(value) === index);
            if(genVal !== node.key.value){
                this.initData(results);
                return this.search(node.key.value);
            }else{
                return this.arrToCompletionList(results);
            }
            
            

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
        return this.arrToCompletionList(results);
    }

    private arrToCompletionList(arr){
        return arr.map(x => ({
            label: x.toString()
        }));
    }

}