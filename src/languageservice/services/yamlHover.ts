/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { PromiseConstructor, Thenable, LanguageService } from 'vscode-json-languageservice';
import { Hover, TextDocument, Position } from 'vscode-languageserver-types';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { LanguageSettings } from '../yamlLanguageService';
import { parse as parseYAML } from '../parser/yamlParser07';
import { YAMLSchemaService } from './yamlSchemaService';
import { JSONHover } from 'vscode-json-languageservice/lib/umd/services/jsonHover';

export class YAMLHover {

    private promise: PromiseConstructor;
    private shouldHover: boolean;
    private jsonHover;

    constructor (schemaService: YAMLSchemaService, promiseConstructor: PromiseConstructor) {
        this.promise = promiseConstructor || Promise;
        this.shouldHover = true;
        this.jsonHover = new JSONHover(schemaService, [], Promise);
    }

    public configure (languageSettings: LanguageSettings) {
        if (languageSettings) {
            this.shouldHover = languageSettings.hover;
        }
    }

    public doHover (document: TextDocument, position: Position): Thenable<Hover> {

        if (!this.shouldHover || !document) {
            return this.promise.resolve(undefined);
        }
        const doc = parseYAML(document.getText());
        const offset = document.offsetAt(position);
        const currentDoc = matchOffsetToDocument(offset, doc);
        if (currentDoc === null) {
            return this.promise.resolve(undefined);
        }

        const currentDocIndex = doc.documents.indexOf(currentDoc);
        currentDoc.currentDocIndex = currentDocIndex;
        return this.jsonHover.doHover(document, position, currentDoc);
    }
}
