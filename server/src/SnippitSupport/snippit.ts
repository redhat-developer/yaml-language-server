
import { snippits } from "../../.vscode/snippits";
import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, RequestType
} from 'vscode-languageserver';

export class snippitAutocompletor {
    
    private textDocument;
    constructor(textDoc){
        this.textDocument = textDoc;
    }

    public provideSnippitAutocompletor(){
        let items = [];
        Object.keys(snippits).forEach(snip => {
            let item = CompletionItem.create(snippits[snip]["prefix"]);
            item.kind = CompletionItemKind.Snippet;
            item.insertText = snippits[snip]["body"].join("\n").replace(/\$\{TM_FILENAME\}/g, this.uriToName(this.textDocument.uri));
            item.detail = "vscode-k8s";
            item.sortText = snippits[snip]["prefix"].substring(0, 5);
            item.filterText = snippits[snip]["prefix"].substring(0, 5);
            item.documentation = snippits[snip]["description"];
            items.push(item);
        });
        return items;
    }

    private uriToName(uri){
        return uri.substring(0, uri.lastIndexOf(".")).substring(uri.lastIndexOf("/")+1);
    }

}