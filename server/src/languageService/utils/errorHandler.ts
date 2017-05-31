import { DiagnosticSeverity } from "vscode-languageserver/lib/main";

export class ErrorHandler {
    private errorResultsList;
    
    constructor(){
        this.errorResultsList = [];
    }

    public addErrorResult(errorNode, errorMessage, errorType, startLine, endLine){
        
        this.errorResultsList.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: {line: startLine, character: 0},
                end: {line: endLine, character:Number.MAX_VALUE}
            },
            message: errorMessage,
            source: "k8s Model"
        });
        
    }

    public getErrorResultsList(){
        return this.errorResultsList;
    }

}