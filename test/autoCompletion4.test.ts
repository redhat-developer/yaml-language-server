/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getLanguageService } from '../src/languageservice/yamlLanguageService';
import { schemaRequestService, workspaceContext, setupTextDocument } from './utils/testHelper';
import assert = require('assert');

const languageService = getLanguageService(schemaRequestService, workspaceContext, [], null);

const uri = 'https://gist.githubusercontent.com/JPinkney/510c098c40b0afd574971909eeff3350/raw/7b5861e89167fccb9f1c7cf135a7b0a19c7a07c9/Schema7Test.json';
const languageSettings = {
    schemas: [],
    completion: true
};
const fileMatch = ['*.yml', '*.yaml'];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);

suite('Auto Completion Tests', () => {

    describe('JSON Schema 7 Tests', function () {

        function parseSetup(content: string, position) {
            const testTextDocument = setupTextDocument(content);
            return languageService.doComplete(testTextDocument, testTextDocument.positionAt(position), false);
        }

        it('Autocomplete works with examples', done => {
            const content = 'foodItems: ';
            const completion = parseSetup(content, 12);
            completion.then(function (result) {
                assert.notEqual(result.items.length, 0);
                // Do other stuff here
            }).then(done, done);
        });

        it('Autocomplete works with const', done => {
            const content = 'fruit: App';
            const completion = parseSetup(content, 9);
            completion.then(function (result) {
                assert.notEqual(result.items.length, 0);
                // Do other stuff here
            }).then(done, done);
        });
    });
});
