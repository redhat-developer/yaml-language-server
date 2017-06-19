import { DiagnosticSeverity } from "vscode-languageserver/lib/main";

export class ErrorHandler {
    private errorResultsList;
    private textDocument;
    
    constructor(textDocument){
        this.errorResultsList = [];
        this.textDocument = textDocument;
    }

    public addErrorResult(errorNode, errorMessage, errorType){
        this.errorResultsList.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: this.textDocument.positionAt(errorNode.startPosition),
                end: this.textDocument.positionAt(errorNode.endPosition)
            },
            message: errorMessage,
            source: "k8s Model"
        });
        
    }

    public getErrorResultsList(){
        return this.errorResultsList;
    }

}