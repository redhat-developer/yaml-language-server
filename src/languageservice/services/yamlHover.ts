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

export class YAMLHover {

    private promise: PromiseConstructor;
    private shouldHover: boolean;

    constructor(promiseConstructor: PromiseConstructor) {
        this.promise = promiseConstructor || Promise;
        this.shouldHover = true;
    }

    public configure(languageSettings: LanguageSettings) {
        if (languageSettings) {
            this.shouldHover = languageSettings.hover;
        }
    }

    public doHover(jsonLanguageService: LanguageService, document: TextDocument, position: Position, doc): Thenable<Hover> {

        if (!this.shouldHover || !document) {
            return this.promise.resolve(void 0);
        }

        const offset = document.offsetAt(position);
        const currentDoc = matchOffsetToDocument2(offset, doc);
        if (currentDoc === null) {
            return this.promise.resolve(void 0);
        }

        return jsonLanguageService.doHover(document, position, currentDoc);
    }
}
