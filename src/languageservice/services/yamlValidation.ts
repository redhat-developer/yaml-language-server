/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Diagnostic, TextDocument } from 'vscode-languageserver-types';
import { PromiseConstructor, LanguageSettings } from '../yamlLanguageService';
import { parse as parseYAML, YAMLDocument } from '../parser/yamlParser07';
import { SingleYAMLDocument } from '../parser/yamlParser07';
import { YAMLSchemaService } from './yamlSchemaService';
import { JSONValidation } from 'vscode-json-languageservice/lib/umd/services/jsonValidation';

export class YAMLValidation {

    private promise: PromiseConstructor;
    private validationEnabled: boolean;
    private customTags: String[];
    private jsonValidation;

    private MATCHES_MULTIPLE = 'Matches multiple schemas when only one must validate.';

    public constructor (schemaService: YAMLSchemaService, promiseConstructor: PromiseConstructor) {
        this.promise = promiseConstructor || Promise;
        this.validationEnabled = true;
        this.jsonValidation = new JSONValidation(schemaService, this.promise);
    }

    public configure (settings: LanguageSettings) {
        if (settings) {
            this.validationEnabled = settings.validate;
            this.customTags = settings.customTags;
        }
    }

    public async doValidation (textDocument: TextDocument, isKubernetes: boolean = false): Promise<Diagnostic[]> {

        if (!this.validationEnabled) {
            return this.promise.resolve([]);
        }
        const yamlDocument: YAMLDocument = parseYAML(textDocument.getText(), this.customTags);
        const validationResult: Diagnostic[] = [];
        let index = 0;
        for (const currentYAMLDoc of yamlDocument.documents) {
            currentYAMLDoc.isKubernetes = isKubernetes;
            currentYAMLDoc.currentDocIndex = index;

            const validation = await this.jsonValidation.doValidation(textDocument, currentYAMLDoc);
            const syd = currentYAMLDoc as unknown as SingleYAMLDocument;
            if (syd.errors.length > 0) {
                //@ts-ignore
                validationResult.push(...syd.errors);
            }
            if (syd.warnings.length > 0) {
                validationResult.push(...syd.warnings);
            }

            validationResult.push(...validation);
            index++;
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
