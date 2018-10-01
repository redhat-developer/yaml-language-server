/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextDocument } from 'vscode-languageserver';
import {getLanguageService, LanguageSettings} from '../src/languageservice/yamlLanguageService'
import {schemaRequestService, workspaceContext}  from './testHelper';
import { parse as parseYAML } from '../src/languageservice/parser/yamlParser';
var assert = require('assert');

let languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

let uri = 'http://json.schemastore.org/bowerrc';
let languageSettings: LanguageSettings = {
    schemas: [],
    hover: false
};
let fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite("Hover Setting Tests", () => {

	describe('Yaml Hover with bowerrc', function(){
		
		describe('doComplete', function(){
			
			function setup(content: string){
				return TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
			}

			function parseSetup(content: string, position){
				let testTextDocument = setup(content);
                let jsonDocument = parseYAML(testTextDocument.getText());
                return languageService.doHover(testTextDocument, testTextDocument.positionAt(position), jsonDocument);
			}

			it('Hover should not return anything', (done) => {
				let content = "cwd: test";
				let hover = parseSetup(content, 1);
				hover.then(function(result){
                    assert.equal(result, undefined);				
				}).then(done, done);
            });

		});
	});
});