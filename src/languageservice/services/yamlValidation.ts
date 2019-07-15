/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Diagnostic, TextDocument } from 'vscode-languageserver-types';
import { PromiseConstructor, LanguageSettings } from '../yamlLanguageService';
import { LanguageService } from 'vscode-json-languageservice';
import { parse as parseYAML, YAMLDocument } from '../parser/yamlParser07';
import { SingleYAMLDocument } from '../parser/yamlParser04';

export class YAMLValidation {

    private promise: PromiseConstructor;
    private validationEnabled: boolean;
    private jsonLanguageService: LanguageService;
    private customTags: String[];

    private MATCHES_MULTIPLE = 'Matches multiple schemas when only one must validate.';

    public constructor(promiseConstructor: PromiseConstructor, jsonLanguageService: LanguageService) {
        this.promise = promiseConstructor;
        this.validationEnabled = true;
        this.jsonLanguageService = jsonLanguageService;
    }

    public configure(settings: LanguageSettings) {
        if (settings) {
            this.validationEnabled = settings.validate;
            this.customTags = settings.customTags;
        }
    }

    public async doValidation(textDocument: TextDocument, isKubernetes: boolean = false): Promise<Diagnostic[]> {

        if (!this.validationEnabled) {
            return this.promise.resolve([]);
        }
        const yamlDocument: YAMLDocument = parseYAML(textDocument.getText(), this.customTags);
        const validationResult: Diagnostic[] = [];
        for (const currentYAMLDoc of yamlDocument.documents) {
            currentYAMLDoc.isKubernetes = isKubernetes;
            const validation = await this.jsonLanguageService.doValidation(textDocument, currentYAMLDoc);
            const syd = currentYAMLDoc as unknown as SingleYAMLDocument;
            if (syd.errors.length > 0) {
                validationResult.push(...syd.errors);
            }

            validationResult.push(...validation);
        }

        const foundSignatures = new Set();
        const duplicateMessagesRemoved = [];
        for (const err of validationResult as Diagnostic[]) {
            /**
             * A patch ontop of the validation that removes the
             * 'Matches many schemas' error for kubernetes
             * for a better user experience.
             */
            if (isKubernetes && err.message === this.MATCHES_MULTIPLE) {
                continue;
            }
            const errSig = err.range.start.line + ' ' + err.range.start.character + ' ' + err.message;
            if (!foundSignatures.has(errSig)) {
                duplicateMessagesRemoved.push(err);
                foundSignatures.add(errSig);
            }
        }
        return duplicateMessagesRemoved;
    }

}
