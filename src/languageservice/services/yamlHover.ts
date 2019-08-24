/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { PromiseConstructor, Thenable, LanguageService } from 'vscode-json-languageservice';
import { Hover, TextDocument, Position } from 'vscode-languageserver-types';
import { matchOffsetToDocument2 } from '../utils/arrUtils';
import { LanguageSettings } from '../yamlLanguageService';
import { parse as parseYAML } from '../parser/yamlParser07';
import { CustomSchemaProvider } from './jsonSchemaService';

export class YAMLHover {

    private promise: PromiseConstructor;
    private shouldHover: boolean;
    private jsonLanguageService: LanguageService;
    public customSchemaProvider: CustomSchemaProvider = null;

    constructor(promiseConstructor: PromiseConstructor, jsonLanguageService: LanguageService) {
        this.promise = promiseConstructor || Promise;
        this.shouldHover = true;
        this.jsonLanguageService = jsonLanguageService;
    }

    public configure(languageSettings: LanguageSettings) {
        if (languageSettings) {
            this.shouldHover = languageSettings.hover;
        }
    }

    public doHover(document: TextDocument, position: Position): Thenable<Hover> {

        if (!this.shouldHover || !document) {
            return this.promise.resolve(void 0);
        }
        const doc = parseYAML(document.getText());
        const offset = document.offsetAt(position);
        const currentDoc = matchOffsetToDocument2(offset, doc);
        if (currentDoc === null) {
            return this.promise.resolve(void 0);
        }

        if (this.customSchemaProvider) {
            return this.customSchemaProvider(document.uri).then(schemaURI => {
                if (schemaURI) {
                    this.jsonLanguageService.configure({
                        schemas: [
                            {
                                fileMatch: ['*.yaml', '*.yml'],
                                uri: schemaURI
                            }
                        ]
                    });
                }
                return this.jsonLanguageService.doHover(document, position, currentDoc);
            });
        }

        return this.jsonLanguageService.doHover(document, position, currentDoc);
    }
}
