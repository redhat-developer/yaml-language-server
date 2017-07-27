"use strict";
const yaml_ast_parser_1 = require("yaml-ast-parser");
let AutoComplete = require('triesearch');
class searchService {
    constructor(schema) {
        this.schema = schema;
    }
    traverseKubernetesSchema(parentNodeList, node, returnEarlyForScalar, callback) {
        let parentNodeFirst = parentNodeList[0];
        let parentList = this.getParentNodes(parentNodeList);
        let nodesToSearch = [];
        let rootNodeList = [];
        for (let api_obj in this.schema.properties) {
            //For Kubernetes schema
            if (this.schema.properties[api_obj].hasOwnProperty("javaType")) {
                for (let prop in this.schema.properties[api_obj]["properties"]) {
                    if (prop === parentList[0]) {
                        nodesToSearch.push([this.schema.properties[api_obj]["properties"][prop]]);
                    }
                    rootNodeList.push(prop);
                }
            }
            else {
                //For Kedge and normal schemas
                if (api_obj === parentList[0]) {
                    nodesToSearch.push([this.schema.properties[api_obj]]);
                }
                rootNodeList.push(api_obj);
            }
        }
        if (parentNodeList.length === 0) {
            let rootNodes = Array.from(new Set(rootNodeList));
            return callback([], [], rootNodes);
        }
        //Return early when we found a scalar node at the root level i.e. key: value <- here
        if (returnEarlyForScalar && parentList.length === 1 && (node && (node.value && node.value.kind === yaml_ast_parser_1.Kind.SCALAR) || node.kind === yaml_ast_parser_1.Kind.SCALAR)) {
            return callback([], nodesToSearch, []);
        }
        let possibleChildren = [];
        while (nodesToSearch.length > 0) {
            let currNodePath = nodesToSearch.shift();
            let depth = currNodePath.length - 1;
            let currNode = currNodePath[depth];
            if (currNodePath.length === parentList.length) {
                possibleChildren.push(currNode);
            }
            //This is when its an array
            if (currNode["items"] && currNode["items"]["properties"]) {
                if (currNode["items"]["properties"][parentList[currNodePath.length]]) {
                    let newNodePath = currNodePath.concat(currNode["items"]["properties"][parentList[currNodePath.length]]);
                    nodesToSearch.push(newNodePath);
                }
            }
            //This means its an object
            if (currNode["properties"] && currNode["properties"][parentList[currNodePath.length]]) {
                let newNodePath = currNodePath.concat(currNode["properties"][parentList[currNodePath.length]]);
                nodesToSearch.push(newNodePath);
            }
        }
        return callback(possibleChildren, nodesToSearch, []);
    }
    getParentNodes(nodeList) {
        let parentNodeNameList = [];
        for (let nodeCount = nodeList.length - 1; nodeCount >= 0; nodeCount--) {
            parentNodeNameList.push(nodeList[nodeCount].value);
        }
        return parentNodeNameList;
    }
}
exports.searchService = searchService;
//# sourceMappingURL=searchService.js.map