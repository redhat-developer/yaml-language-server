"use strict";
const snippets_1 = require("./snippets");
const vscode_languageserver_1 = require("vscode-languageserver");
class snippetAutocompletor {
    static provideSnippetAutocompletor(fileNameURI) {
        let items = [];
        Object.keys(snippets_1.snippets).forEach(snip => {
            let item = vscode_languageserver_1.CompletionItem.create(snippets_1.snippets[snip]["prefix"]);
            item.kind = vscode_languageserver_1.CompletionItemKind.Snippet;
            item.insertText = snippets_1.snippets[snip]["body"].join("\n").replace(/\$\{TM_FILENAME\}/g, this.uriToName(fileNameURI));
            item.detail = "vscode-k8s";
            item.sortText = snippets_1.snippets[snip]["prefix"].substring(0, 5);
            item.filterText = snippets_1.snippets[snip]["prefix"].substring(0, 5);
            item.documentation = snippets_1.snippets[snip]["description"];
            items.push(item);
        });
        return items;
    }
    static uriToName(uri) {
        return uri.substring(0, uri.lastIndexOf(".")).substring(uri.lastIndexOf("/") + 1);
    }
}
exports.snippetAutocompletor = snippetAutocompletor;
//# sourceMappingURL=snippet.js.map