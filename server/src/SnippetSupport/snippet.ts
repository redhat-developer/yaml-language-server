
import { snippets } from "./snippets";
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, RequestType
} from 'vscode-languageserver';

export class snippetAutocompletor {
    
    public static provideSnippetAutocompletor(fileNameURI){
        let items = [];
        Object.keys(snippets).forEach(snip => {
            let item = CompletionItem.create(snippets[snip]["prefix"]);
            item.kind = CompletionItemKind.Snippet;
            item.insertText = snippets[snip]["body"].join("\n").replace(/\$\{TM_FILENAME\}/g, this.uriToName(fileNameURI));
            item.detail = "vscode-k8s";
            item.sortText = snippets[snip]["prefix"].substring(0, 5);
            item.filterText = snippets[snip]["prefix"].substring(0, 5);
            item.documentation = snippets[snip]["description"];
            items.push(item);
        });
        return items;
    }

    private static uriToName(uri){
        return uri.substring(0, uri.lastIndexOf(".")).substring(uri.lastIndexOf("/")+1);
    }

}