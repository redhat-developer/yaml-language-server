"use strict";
const yaml_ast_parser_1 = require("yaml-ast-parser");
function traverse(node, visitor) {
    if (!node || !visitor)
        return;
    switch (node.kind) {
        case yaml_ast_parser_1.Kind.SCALAR:
            let scalar = node;
            if (visitor.visit(scalar)) {
            }
            break;
        case yaml_ast_parser_1.Kind.SEQ:
            let seq = node;
            if (visitor.visit(seq)) {
                seq.items.forEach(item => {
                    traverse(item, visitor);
                });
            }
            break;
        case yaml_ast_parser_1.Kind.MAPPING:
            let mapping = node;
            if (visitor.visit(mapping)) {
                traverse(mapping.value, visitor);
            }
            break;
        case yaml_ast_parser_1.Kind.MAP:
            let map = node;
            if (visitor.visit(map)) {
                map.mappings.forEach(mapping => {
                    traverse(mapping, visitor);
                });
            }
            break;
        case yaml_ast_parser_1.Kind.ANCHOR_REF:
            let anchor = node;
            if (visitor.visit(anchor)) {
                traverse(anchor.value, visitor);
            }
            break;
    }
}
exports.traverse = traverse;
class ASTVisitor {
    visit(node) {
        return true;
    }
    ;
    traverseBackToLocation(node) {
    }
}
exports.ASTVisitor = ASTVisitor;
function findNode(node, offset) {
    let lastNode;
    class Finder extends ASTVisitor {
        visit(node) {
            if (node.endPosition >= offset && node.startPosition <= offset) {
                lastNode = node;
                return true;
            }
            return false;
        }
    }
    traverse(node, new Finder());
    return lastNode;
}
exports.findNode = findNode;
function generateChildren(node) {
    if (!node)
        return [];
    switch (node.kind) {
        case yaml_ast_parser_1.Kind.SCALAR:
            return [];
        case yaml_ast_parser_1.Kind.MAPPING:
            return node;
        case yaml_ast_parser_1.Kind.MAP:
            let yamlMappingNodeList = [];
            node.mappings.forEach(node => {
                let gen = generateChildren(node);
                yamlMappingNodeList.push(gen);
            });
            return [].concat([], yamlMappingNodeList);
        case yaml_ast_parser_1.Kind.SEQ:
            let yamlSeqNodeList = [];
            node.items.forEach(node => {
                let gen = generateChildren(node);
                gen.forEach(element => {
                    yamlSeqNodeList.push(element);
                });
            });
            return [].concat([], yamlSeqNodeList);
    }
}
exports.generateChildren = generateChildren;
function generateParents(node) {
    if (!node)
        return [];
    switch (node.kind) {
        case yaml_ast_parser_1.Kind.SCALAR:
            let scalarNode = node;
            if (scalarNode.parent === null) {
                return [];
            }
            else {
                return this.generateParents(scalarNode.parent);
            }
        case yaml_ast_parser_1.Kind.MAPPING:
            let mappingNode = node;
            if (mappingNode.parent === null) {
                return [];
            }
            else {
                return [mappingNode.key].concat(this.generateParents(mappingNode.parent));
            }
        case yaml_ast_parser_1.Kind.MAP:
            let mapNode = node;
            if (mapNode.parent === null) {
                return [];
            }
            else {
                return this.generateParents(mapNode.parent);
            }
        case yaml_ast_parser_1.Kind.SEQ:
            let seqNode = node;
            if (seqNode.parent === null) {
                return [];
            }
            else {
                return this.generateParents(seqNode.parent);
            }
    }
}
exports.generateParents = generateParents;
//# sourceMappingURL=astServices.js.map