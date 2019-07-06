/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Diagnostic } from 'vscode-languageserver-types';
import { PromiseConstructor, LanguageSettings } from '../yamlLanguageService';
import { LanguageService } from 'vscode-json-languageservice';

export class YAMLValidation {

    private promise: PromiseConstructor;
    private validationEnabled: boolean;
    private jsonLanguageService: LanguageService;

    private MATCHES_MULTIPLE = 'Matches multiple schemas when only one must validate.';

    public constructor(promiseConstructor: PromiseConstructor, jsonLanguageService: LanguageService) {
        this.promise = promiseConstructor;
        this.validationEnabled = true;
        this.jsonLanguageService = jsonLanguageService;
    }

    public configure(shouldValidate: LanguageSettings) {
        if (shouldValidate) {
            this.validationEnabled = shouldValidate.validate;
        }
    }

    public doValidation(textDocument, yamlDocument, isKubernetes: boolean = false) {

        if (!this.validationEnabled) {
            return this.promise.resolve([]);
        }

        const validationResult = [];
        for (const currentYAMLDoc of yamlDocument.documents) {
            const validation = this.jsonLanguageService.doValidation(textDocument, currentYAMLDoc);

            if (currentYAMLDoc.errors.length > 0) {
                validationResult.push(currentYAMLDoc.errors);
            }

            validationResult.push(validation);
        }

        return Promise.all(validationResult).then(resolvedValidation => {
            let joinedResolvedArray = [];
            for (const resolvedArr of resolvedValidation) {
                joinedResolvedArray = joinedResolvedArray.concat(resolvedArr);
            }

            const foundSignatures = new Set();
            const duplicateMessagesRemoved = [];
            for (const err of joinedResolvedArray as Diagnostic[]) {

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
        });
    }

}
