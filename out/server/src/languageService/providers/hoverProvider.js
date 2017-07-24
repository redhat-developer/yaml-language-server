"use strict";
const vscode_languageserver_types_1 = require("vscode-languageserver-types");
const yaml_ast_parser_1 = require("yaml-ast-parser");
const astServices_1 = require("../utils/astServices");
const astServices_2 = require("../utils/astServices");
const searchService_1 = require("../services/searchService");
const arrUtils_1 = require("../utils/arrUtils");
class hoverProvider {
    constructor(schema) {
        this.schemaService = schema;
    }
    doHover(document, position, doc) {
        return this.schemaService.getSchemaForResource(document.uri).then(schema => {
            if (schema && schema.schema) {
                let searchServiceTraverser = new searchService_1.searchService(schema.schema);
                let offset = document.offsetAt(position);
                let node = astServices_1.findNode(doc, offset);
                let parentNodes = astServices_2.generateParents(node);
                //If node is an uncompleted root node then it can't be a parent of itself
                if (node && !node.value) {
                    parentNodes = parentNodes.slice(1);
                }
                return searchServiceTraverser.traverseKubernetesSchema(parentNodes, node, false, function (possibleChildren) {
                    let possibleChildrenNoDuplicates = arrUtils_1.removeDuplicates(possibleChildren, "description");
                    let hoverNode = possibleChildrenNoDuplicates[0];
                    if (hoverNode) {
                        let startPos = node.startPosition;
                        let endPos = node.endPosition;
                        //Use the keys start position when you are hovering over a scalar item
                        if (node.kind === yaml_ast_parser_1.Kind.SCALAR) {
                            startPos = node.parent.key.startPosition ? node.parent.key.startPosition : startPos;
                        }
                        let hoverRange = vscode_languageserver_types_1.Range.create(document.positionAt(startPos), document.positionAt(endPos));
                        let hoverItem = {
                            contents: hoverNode.description,
                            range: hoverRange
                        };
                        return hoverItem;
                    }
                    return null;
                });
            }
            return null;
        });
    }
}
exports.hoverProvider = hoverProvider;
//# sourceMappingURL=hoverProvider.js.map