import { TextDocument } from 'vscode-languageserver';
import { findNode, generateChildren, generateParents } from '../src/languageService/utils/astServices';
import { load as yamlLoader, YAMLDocument, YAMLException, YAMLNode, Kind } from 'yaml-ast-parser-beta';
var assert = require('assert');

suite("AST Services Tests", () => {

	describe('Server - AST', function(){
		
		describe('findNode', function(){
            //findNode(node:YAMLNode, offset: number)
			it('Node is null', () => {
                let node = findNode(null, 0);
                assert.equal(node, null);
			});

            it('Node is found - root node - key', () => {
                let docStr = "test:";
                let yamlDoc = yamlLoader(docStr,{});
                let node = findNode(<YAMLNode> yamlDoc, 0);
                assert.equal(node.key.value, "test");
            });

            it('Node is found - root node - value', () => {
                let docStr = "test: value";
                let yamlDoc = yamlLoader(docStr,{});
                let node = findNode(<YAMLNode> yamlDoc, 8);
                assert.equal(node.value, "value");
            });

            it('Node is found - child node - key', () => {
                let docStr = "test:\n  child_node:";
                let yamlDoc = yamlLoader(docStr,{});
                let node = findNode(<YAMLNode> yamlDoc, 14);
                assert.equal(node.key.value, "child_node");
            });   

            it('Node is found - child node - value', () => {
                let docStr = "test:\n  child_node: value";
                let yamlDoc = yamlLoader(docStr,{});
                let node = findNode(<YAMLNode> yamlDoc, 20);
                assert.equal(node.value, "value");
            });

            it('Node is found - multiple root nodes - key', () => {
                let docStr = "test:\nchild_node:";
                let yamlDoc = yamlLoader(docStr,{});
                let node = findNode(<YAMLNode> yamlDoc, 10);
                assert.equal(node.key.value, "child_node");
            });

            it('Node is found - multiple root nodes - value', () => {
                let docStr = "test:\nchild_node: value";
                let yamlDoc = yamlLoader(docStr,{});
                let node = findNode(<YAMLNode> yamlDoc, 20);
                assert.equal(node.value, "value");
            });

            it('Node is found - multiple child nodes - key', () => {
                let docStr = "test:\n  child_node: test\n  second_child_node:";
                let yamlDoc = yamlLoader(docStr,{});
                let node = findNode(<YAMLNode> yamlDoc, 40);
                assert.equal(node.key.value, "second_child_node");
            });

            it('Node is found - multiple child nodes - value', () => {
                let docStr = "test:\n  child_node: test\n  second_child_node: value";
                let yamlDoc = yamlLoader(docStr,{});
                let node = findNode(<YAMLNode> yamlDoc, 47);
                assert.equal(node.value, "value");
            });

		});

        describe('generateChildren', function(){

            it('No children found', () => {
                let uri = "file://~/Desktop/vscode-k8s/test.yaml";
                let content = "";
				let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				let yamlDoc = yamlLoader(testTextDocument.getText(),{});
                let children = generateChildren(<YAMLNode> yamlDoc);
                assert.equal(children.length, 0);
            });

            it('One child found', () => {
                let uri = "file://~/Desktop/vscode-k8s/test.yaml";
                let content = "metadata:\n  generateName: hello";
				let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				let yamlDoc = yamlLoader(testTextDocument.getText(),{});
                let children = generateChildren(<YAMLNode> yamlDoc);
                assert.equal(children.length, 1);
            });

            it('Multiple children found', () => {
                let uri = "file://~/Desktop/vscode-k8s/test.yaml";
                let content = "apiVersion: v1\nmetadata:\n  generateName: hello";
				let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				let yamlDoc = yamlLoader(testTextDocument.getText(),{});
                let children = generateChildren(<YAMLNode> yamlDoc);
                assert.equal(children.length, 2);
            });

        });

        describe('generateParents', function(){

            it('No parents', () => {
                let uri = "file://~/Desktop/vscode-k8s/test.yaml";
                let content = "";
				let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				let yamlDoc = yamlLoader(testTextDocument.getText(),{});
                let parents = generateParents(<YAMLNode> yamlDoc);
                assert.equal(parents.length, 0);
            });

            it('Two parents', () => {
                let uri = "file://~/Desktop/vscode-k8s/test.yaml";
                let content = "metadata:\n  generateName: test";
				let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				let yamlDoc = yamlLoader(testTextDocument.getText(),{});
                let parents = generateParents((<YAMLNode> yamlDoc).mappings[0].value.mappings[0]);
                assert.equal(parents.length, 2);
            });

            it('Multiple parents', () => {
                let uri = "file://~/Desktop/vscode-k8s/test.yaml";
                let content = "a:\n  b:\n    c: test";
				let testTextDocument = TextDocument.create(uri, "yaml", 1, content);
				let yamlDoc = yamlLoader(testTextDocument.getText(),{});
                let parents = generateParents((<YAMLNode> yamlDoc).mappings[0].value.mappings[0].value.mappings[0]);
                assert.equal(parents.length, 3);
            });

        });

	});

});