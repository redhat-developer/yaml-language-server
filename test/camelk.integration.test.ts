/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getLanguageService, LanguageSettings } from '../src/languageservice/yamlLanguageService';
import { schemaRequestService, workspaceContext }  from './utils/testHelper';
import { TextDocument } from 'vscode-languageserver';
import * as chai from 'chai';

const expect = chai.expect;
const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const uri = 'https://gist.githubusercontent.com/lburgazzoli/5b860fdad50d372a27fc51306f1ae378/raw/addea32147720a41ff58aa82e1ec845dae6ab77c/camel-yaml-dsl.json';
const languageSettings: LanguageSettings = {
    schemas: [],
    validate: true,
    completion: true,
    hover: true
};
const fileMatch = ['*.camelk.yml', '*.camelk.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

// Defines a Mocha test suite to group tests of similar kind together
suite('Camel K Integration Tests', () => {

    describe('Yaml Completion with Camel K', function () {

        describe('doComplete', function () {

            function parseSetup(content: string, position) {
                const testTextDocument = TextDocument.create(
                    'file://~/Desktop/vscode-k8s/test.camelk.yaml',
                    'yaml',
                    0,
                    content
                );
                return languageService.doComplete(testTextDocument, testTextDocument.positionAt(position), true);
            }

            it('Autocomplete on first level', done => {
                const content = '- ';
                const completion = parseSetup(content, 2);
                completion.then(function (result) {
                    const completionLabels = result.items.map(completionItem => completionItem.label);
                    expect(completionLabels).to.have.all.members(['from', 'error-handler', 'on-exception', 'rest', 'route']);
                }).then(done, done);
            });

            it('Autocomplete on second level', done => {
                const content = '- from:\n    ';
                const completion = parseSetup(content, 13);
                completion.then(function (result) {
                    const completionLabels = result.items.map(completionItem => completionItem.label);
                    expect(completionLabels).to.have.all.members(['uri', 'steps', 'parameters']);
                }).then(done, done);
            });

        });
    });

});
