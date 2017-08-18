"use strict";
const yaml_ast_parser_1 = require("yaml-ast-parser");
const astServices_1 = require("../utils/astServices");
const astServices_2 = require("../utils/astServices");
const searchService_1 = require("../services/searchService");
const arrUtils_1 = require("../utils/arrUtils");
var equal = require('deep-equal');
class autoCompletionProvider {
    constructor(schemaService) {
        this.schemaService = schemaService;
    }
    doComplete(document, position, doc) {
        let result = {
            items: [],
            isIncomplete: false
        };
        return this.schemaService.getSchemaForResource(document.uri).then(schema => {
            if (schema && schema.schema) {
                let kubeSearchService = new searchService_1.searchService(schema.schema);
                let offset = document.offsetAt(position);
                let node = astServices_1.findNode(doc, offset);
                let parentNodes = astServices_2.generateParents(node);
                let linePos = position.line;
                let lineOffset = arrUtils_1.getLineOffsets(document.getText());
                let start = lineOffset[linePos]; //Start of where the autocompletion is happening
                let end = 0; //End of where the autocompletion is happening
                if (lineOffset[linePos + 1]) {
                    end = lineOffset[linePos + 1];
                }
                else {
                    end = document.getText().length;
                }
                //If its a root node
                if (this.isRootNode(doc, node) && document.getText().substring(start, end).indexOf(":") === -1 || node && !node.value && document.getText().substring(start, end).indexOf(":") === -1) {
                    parentNodes = parentNodes.slice(1);
                }
                return kubeSearchService.traverseKubernetesSchema(parentNodes, node, true, (possibleChildren, nodesToSearch, rootNodes) => {
                    if (rootNodes.length !== 0) {
                        result.items = this.autoCompleteRootNodes(rootNodes);
                    }
                    else if (node && (node.value && node.value.kind === yaml_ast_parser_1.Kind.SCALAR) || node.kind === yaml_ast_parser_1.Kind.SCALAR) {
                        result.items = this.autoCompleteScalarResults(nodesToSearch);
                    }
                    else {
                        result.items = this.autoCompleteMappingResults(possibleChildren);
                    }
                    return result;
                });
            }
            return result;
        });
    }
    isRootNode(doc, node) {
        for (let element in doc.mappings) {
            if (equal(doc.mappings[element], node)) {
                return true;
            }
        }
        ;
        return false;
    }
    autoCompleteRootNodes(rootNodesArray) {
        return rootNodesArray.map(function (nodeName) {
            return { "label": nodeName };
        });
    }
    removeDuplicatesByNameAndDescription(arr) {
        let newArr = [];
        let canAdd = true;
        for (let ind = 0; ind < arr.length; ind++) {
            //For each object in current array if these aren't found then add them
            for (let objLoc = 0; objLoc < newArr.length; objLoc++) {
                if (newArr[objLoc].description === arr[ind].description && newArr[objLoc].name === arr[ind].name) {
                    canAdd = false;
                }
            }
            if (canAdd) {
                newArr.push(arr[ind]);
            }
            canAdd = true;
        }
        return newArr;
    }
    autoCompleteMappingResults(nodesToSearch) {
        if (nodesToSearch.length === 0) {
            return [];
        }
        if (!(nodesToSearch[0].hasOwnProperty("properties") || nodesToSearch[0].hasOwnProperty("items"))) {
            return this.autoCompleteScalarResults(nodesToSearch);
        }
        let mapNodes = nodesToSearch.map(function (node) {
            if (node.properties) {
                return node.properties;
            }
            else if (node["items"] && node["items"]["properties"]) {
                return node["items"]["properties"];
            }
        });
        mapNodes = mapNodes.filter(node => node !== undefined);
        let nodeArray = this.addNameToMappingNode(mapNodes);
        nodeArray = this.removeDuplicatesByNameAndDescription(nodeArray);
        return nodeArray.map(function (node) {
            if (node.description && node.description.length >= 1) {
                return {
                    label: node.name,
                    documentation: node.description
                };
            }
            else {
                return {
                    label: node.name
                };
            }
        });
    }
    addNameToMappingNode(mapNodes) {
        let nodeArray = [];
        mapNodes.forEach(element => {
            Object.keys(element).forEach(function (node) {
                element[node].name = node;
                nodeArray.push(element[node]);
            });
        });
        return nodeArray;
    }
    autoCompleteScalarResults(nodesToSearch) {
        if (nodesToSearch.length === 0) {
            return [];
        }
        let scalarSet = new Set();
        let nodeArray = [];
        nodesToSearch.forEach(element => {
            let ele = element.constructor === Array ? element[0] : element;
            let defaultValue = ele.default || undefined;
            if (defaultValue !== undefined && !scalarSet.has(defaultValue)) {
                nodeArray.push(ele);
            }
            scalarSet.add(defaultValue);
        });
        return nodeArray.map(function (node) {
            if (node.description && node.description.length >= 1) {
                return {
                    label: node.default,
                    documentation: node.description
                };
            }
            else {
                return {
                    label: node.default
                };
            }
        });
    }
}
exports.autoCompletionProvider = autoCompletionProvider;
//# sourceMappingURL=autoCompletionProvider.js.map