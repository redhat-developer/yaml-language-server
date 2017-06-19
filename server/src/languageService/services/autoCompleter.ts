import {SchemaToMappingTransformer} from "../schemaToMappingTransformer"
import {TextDocument, CompletionList} from 'vscode-languageserver-types';
import {JSONSchema} from "../jsonSchema";
import {YAMLDocument, YAMLNode, Kind} from 'yaml-ast-parser';

let AutoComplete = require('triesearch');

export class AutoCompleter {

    private kuberSchema; 

    constructor(schema:JSONSchema){
        this.kuberSchema = new SchemaToMappingTransformer(schema).getSchema();
    }

    public searchAll() {
        let allSchemaKeys = Object.keys(this.kuberSchema["rootNodes"]);
        return this.arrToCompletionList(allSchemaKeys);
    }

    public generateRegularAutocompletion(node) {
        let nodeToSearch = "";
        
        if(node.kind === Kind.MAPPING && node.value === null){
            nodeToSearch = this.getParentVal(node);
        }else{
            nodeToSearch = node.key.value;
        }

        if(nodeToSearch === ""){
            return this.search(node.key.value, Object.keys(this.kuberSchema["rootNodes"]));    
        }else{
            
            let nodeChildren = this.kuberSchema["childrenNodes"][nodeToSearch];
            if(nodeChildren){
                let nodeChildrenArray = nodeChildren.map(node => node.children);
                let flattenNodeChildrenArray = [].concat.apply([], nodeChildrenArray);
                let uniqueChildrenArray = flattenNodeChildrenArray.filter((value, index, self) => self.indexOf(value) === index);
                if(nodeToSearch !== node.key.value){
                    return this.search(node.key.value, uniqueChildrenArray);
                }else{
                    return this.arrToCompletionList(uniqueChildrenArray);
                }
            }
            
            return [];

        }

    }

    public generateScalarAutocompletion(nodeValue: string) {
        let defaultScalarValues = this.kuberSchema["childrenNodes"][nodeValue];
        if(defaultScalarValues){
            let defaultScalarValuesMap = defaultScalarValues.map(node => node.default);
            let defaultScalarValuesUnique = defaultScalarValuesMap.filter((value, index, self) => self.indexOf(value) === index && value !== undefined);
            return this.arrToCompletionList(defaultScalarValuesUnique);
        }
        return [];
    }

    private search(searchItem: String, data: Array<String>){
        let auto = new AutoComplete();
        auto.initialize(data);
        return auto.search(searchItem).map(searchResult => ({
            label: searchResult.value.toString()
        }));
    }

    private arrToCompletionList(arr){
        return arr.map(x => ({
            label: x.toString()
        }));
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