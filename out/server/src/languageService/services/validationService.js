"use strict";
const astServices_1 = require("../utils/astServices");
const yaml_ast_parser_1 = require("yaml-ast-parser");
const main_1 = require("vscode-languageserver-types/lib/main");
const errorHandler_1 = require("../utils/errorHandler");
const searchService_1 = require("./searchService");
class schemaValidator {
    constructor(schema, document) {
        this.schema = schema;
        this.errorHandler = new errorHandler_1.ErrorHandler(document);
        this.validationEnabled = true;
    }
    configure(raw) {
        if (raw) {
            this.validationEnabled = raw.validate;
        }
    }
    traverseBackToLocation(node) {
        let rootNode = node;
        let nodesToSearch = [];
        if (!rootNode.mappings) {
            rootNode.mappings = [];
        }
        let rootNodeNameList = this.rootNodesNameListOfSchema();
        rootNode.mappings.forEach(element => {
            if (rootNodeNameList.indexOf(element.key.value) >= 0) {
                nodesToSearch.push([element]);
            }
            else {
                this.errorHandler.addErrorResult(element, "Node \'" + element.key.value + "\' is not found", main_1.DiagnosticSeverity.Error);
            }
        });
        while (nodesToSearch.length > 0) {
            let currentNodePath = nodesToSearch.pop();
            let currentNode = currentNodePath[currentNodePath.length - 1];
            let currentNodeInSchema = this.searchSchema(rootNode, currentNode);
            let parentNodeSearch = null;
            let parentNodeType = null;
            //When a parent node exists we need to check if the child types are invalid
            if (currentNodePath.length >= 2) {
                parentNodeSearch = this.searchSchema(rootNode, currentNodePath[currentNodePath.length - 2]);
                //Error: Check if this is the right child type of parent
                if (this.isInvalidParentType(parentNodeSearch, currentNodePath[currentNodePath.length - 2].value, currentNode.key.value)) {
                    this.errorHandler.addErrorResult(currentNode, "Node \'" + currentNode.key.value + "\' has an invalid type. Valid type(s) of key node are: " + this.collectTypesForParent(parentNodeSearch, currentNode.key.value).toString(), main_1.DiagnosticSeverity.Error);
                }
            }
            if (!(currentNodeInSchema.length > 0)) {
                this.errorHandler.addErrorResult(currentNode.key, "Node \'" + currentNode.key.value + "\' is not found", main_1.DiagnosticSeverity.Error);
            }
            //Error: If type is mapping then we need to check the scalar type
            if (currentNode.kind === yaml_ast_parser_1.Kind.MAPPING && currentNode.value !== null && this.isInvalidType(currentNode, currentNodeInSchema)) {
                this.errorHandler.addErrorResult(currentNode.value, "Node \'" + currentNode.key.value + "\' has an invalid type. Valid type(s) are: " + this.collectTypes(currentNodeInSchema).toString(), main_1.DiagnosticSeverity.Error);
            }
            let childrenNodes = astServices_1.generateChildren(currentNode.value);
            childrenNodes.forEach(child => {
                //We are getting back a bunch of nodes which all have a key and we adding them
                let newNodePath = currentNodePath.concat(child);
                let searchThroughSchema = this.searchSchema(rootNode, child);
                let isValidInSchema = searchThroughSchema.length > 0;
                if (!isValidInSchema) {
                    if (this.hasAdditionalProperties(currentNodeInSchema)) {
                        this.errorHandler.addErrorResult(child, "\'" + child.key.value + "\' is an additional property of " + currentNode.key.value, main_1.DiagnosticSeverity.Warning);
                    }
                    else {
                        this.errorHandler.addErrorResult(child, "\'" + child.key.value + "\' is not a valid child node of " + currentNode.key.value, main_1.DiagnosticSeverity.Error);
                    }
                }
                else {
                    nodesToSearch.push(newNodePath);
                }
            });
        }
    }
    searchSchema(rootNode, nodeToVerify) {
        let parentNodeList = astServices_1.generateParents(nodeToVerify);
        return new searchService_1.searchService(this.schema).traverseKubernetesSchema(parentNodeList, rootNode, false, function (children, nodesToSearch, rootNodes) {
            if (children.length > 0) {
                return children;
            }
            else if (nodesToSearch.length > 0) {
                return nodesToSearch;
            }
            else if (rootNodes.length > 0) {
                return rootNodes;
            }
            return [];
        });
    }
    collectTypes(searchSchema) {
        if (searchSchema.length === 0) {
            return [];
        }
        let typeNodes = searchSchema.map(function (node) {
            if (node.type) {
                return node.type;
            }
            else {
                if (node.value && node.value.valueObject) {
                    return typeof node.value.valueObject;
                }
                else if (node.value && node.value.value) {
                    return typeof node.value.value;
                }
                return "object";
            }
        });
        return Array.from(new Set(typeNodes));
    }
    collectTypesForParent(searchSchema, currentNode) {
        if (searchSchema.length === 0) {
            return [];
        }
        let typeNodes = [];
        for (let node in searchSchema) {
            let item = searchSchema[node];
            if (item.type) {
                let itemList = [];
                if (item.properties) {
                    itemList = Object.keys(item.properties);
                }
                if (item.items && item.items.properties) {
                    itemList = Object.keys(item.items.properties);
                }
                if (itemList.indexOf(currentNode) !== -1) {
                    typeNodes.push(item.type);
                }
            }
            else {
                if (item.value && item.value.valueObject) {
                    typeNodes.push(typeof item.value.valueObject);
                }
                else if (item.value && item.value.value) {
                    typeNodes.push(typeof item.value.value);
                }
                else {
                    typeNodes.push("object");
                }
            }
        }
        return Array.from(new Set(typeNodes));
    }
    isInvalidParentType(rootNodeSchema, parentNode, currentNode) {
        let parentNodeTypes = rootNodeSchema.map(node => node.type);
        let validNodeCount = 0;
        for (let index in parentNodeTypes) {
            let parentNodeType = parentNodeTypes[index];
            let rootNodeItem = rootNodeSchema[index];
            let itemsList = [];
            //When its an object
            if (rootNodeItem.properties) {
                itemsList = Object.keys(rootNodeItem.properties) || [];
                return this.testForParentType(parentNodeType, itemsList, currentNode, parentNode);
            }
            //When its an array
            if (rootNodeItem.items && rootNodeItem.items.properties) {
                itemsList = Object.keys(rootNodeItem.items.properties) || [];
                return this.testForParentType(parentNodeType, itemsList, currentNode, parentNode);
            }
        }
        return true;
    }
    testForParentType(parentNodeType, itemsList, currentNode, parentNode) {
        if (itemsList.indexOf(currentNode) !== -1) {
            if (parentNodeType === 'array') {
                return parentNode.kind !== yaml_ast_parser_1.Kind.SEQ;
            }
            else if (parentNodeType === undefined) {
                return parentNode.kind !== yaml_ast_parser_1.Kind.MAP;
            }
            else if (parentNodeType === "object") {
                return parentNode.kind !== yaml_ast_parser_1.Kind.MAP;
            }
        }
        return false;
    }
    isInvalidType(node, searchSchema) {
        if (node.value.mapping || node.value.items) {
            return false;
        }
        let nodeToTest = node.value.valueObject !== undefined ? node.value.valueObject : node.value.value;
        let nodeTypes = this.collectTypes(searchSchema);
        if (nodeToTest === undefined) {
            return false;
        }
        if (searchSchema[0].format === "int-or-string" && (typeof nodeToTest === "string" || typeof nodeToTest === "number")) {
            return false;
        }
        if (typeof nodeToTest === "number") {
            return nodeTypes.indexOf("integer") === -1;
        }
        return nodeTypes.indexOf(typeof nodeToTest) === -1;
    }
    hasAdditionalProperties(searchSchema) {
        for (let node in searchSchema) {
            if (searchSchema[node].hasOwnProperty("additionalProperties") ||
                searchSchema[node]["items"] &&
                    searchSchema[node]["items"].hasOwnProperty("additionalProperties")) {
                return true;
            }
        }
        return false;
    }
    rootNodesNameListOfSchema() {
        let rootNodeNameList = [];
        for (let node in this.schema.properties) {
            if (this.schema.properties[node]["javaType"]) {
                //We are dealing with kubenetes schema
                for (let prop in this.schema.properties[node].properties) {
                    rootNodeNameList.push(prop);
                }
            }
            else {
                //Kedge and normal schemas
                rootNodeNameList.push(node);
            }
        }
        return Array.from(new Set(rootNodeNameList)); //Remove duplicates
    }
    getErrorResults() {
        return this.errorHandler.getErrorResultsList();
    }
}
exports.schemaValidator = schemaValidator;
//# sourceMappingURL=validationService.js.map