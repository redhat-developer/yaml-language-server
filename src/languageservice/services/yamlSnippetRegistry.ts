/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { YAMLSnippet } from '../yamlLanguageService';

/**
 * Creates a snippet registry that holds all the server side snippets.
 */
export class YAMLSnippetRegistry {

    private snippetStore = new Map<string, YAMLSnippet>();

    /**
     * Add a snippet to the registry. When autocompletion happens the snippet will appear depending on the context
     *
     * @param snippetTitle The name of the snippet that will appear during autocompletion
     * @param snippet  The snippet itself
     */
    addSnippet(snippetTitle: string, snippet: YAMLSnippet) {
        this.snippetStore.set(snippetTitle, snippet);
    }

    /**
     * Remove a snippet from the registry
     *
     * @param snippetTitle The title of the snippet you want to remove
     */
    removeSnippet(snippetTitle: string) {
        this.snippetStore.delete(snippetTitle);
    }

    getSnippets() {
        return this.snippetStore;
    }
}
