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
        let allRootNodeValues = Object.keys(this.kuberSchema["rootNodes"]);
        return this.arrayToCompletionList(allRootNodeValues);
    }

    public getRegularAutocompletionList(node) {
        
        if(!node || !node.key || (!node.value && !(node.kind === Kind.MAPPING))) return [];

        let nameOfNodeToSearch = this.getCompletionNodeValue(node);

        //The node is a root node
        if(nameOfNodeToSearch === ""){
            return this.search(node.key.value, Object.keys(this.kuberSchema["rootNodes"]));    
        }else{
            return this.getChildrenNodeAutocompletionList(node, nameOfNodeToSearch);
        }
    }
    
    public getCompletionNodeValue(node){
        if(node.kind === Kind.MAPPING && node.value === null){
            return this.getParentVal(node);
        }else{
            return node.key.value;
        }
    }

    public getChildrenNodeAutocompletionList(node, nameOfNodeToSearch){
        let nodeChildren = this.kuberSchema["childrenNodes"][nameOfNodeToSearch];
        if(nodeChildren){
            let nodeChildrenArray = nodeChildren.map(node => node.children);
            let flattenNodeChildrenArray = [].concat.apply([], nodeChildrenArray);
            let uniqueChildrenArray = flattenNodeChildrenArray.filter((value, index, self) => self.indexOf(value) === index);
            if(nameOfNodeToSearch !== node.key.value){
                return this.search(node.key.value, uniqueChildrenArray);
            }else{
                return this.arrayToCompletionList(uniqueChildrenArray);
            }
        }
        
        return [];
    }

    public getScalarAutocompletionList(nodeValue: string) {
        let defaultScalarValues = this.kuberSchema["childrenNodes"][nodeValue];
        if(defaultScalarValues){
            let defaultScalarValuesMap = defaultScalarValues.map(node => node.default);
            let defaultScalarValuesUnique = defaultScalarValuesMap.filter((value, index, self) => self.indexOf(value) === index && value !== undefined);
            return this.arrayToCompletionList(defaultScalarValuesUnique);
        }
        return [];
    }

    /*
     * Helper function that uses triesearch to get the values
     */
    private search(searchItem: String, data: Array<String>){
        let auto = new AutoComplete();
        auto.initialize(data);
        return auto.search(searchItem).map(searchResult => ({
            label: searchResult.value.toString()
        }));
    }

    /*
     * Helper for mapping arrays to CompletionList
     */
    private arrayToCompletionList(arr){
        return arr.map(x => ({
            label: x.toString()
        }));
    }

    /*
     * Helper function that traverses the AST looking for the parent node value
     */
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