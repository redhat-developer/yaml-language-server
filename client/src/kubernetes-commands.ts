import * as vscode from 'vscode';

export function enableValidation(){
    
    let k8sConfig = vscode.workspace.getConfiguration('k8s');
    let filesValidating = k8sConfig.get('filesNotValidating', []);
    let currentWindow = vscode.window.activeTextEditor;
    let currentWindowFilename = currentWindow.document.fileName;
    
    let currentFileLocation = filesValidating.indexOf(currentWindowFilename); 
    if(currentFileLocation !== -1){
        let disabledValidationList = filesValidating.filter(function(file, index){
            return index != currentFileLocation;
        });
        k8sConfig.update('filesNotValidating', disabledValidationList, true);
    }

}


export function disableValidation(){
    
    let k8sConfig = vscode.workspace.getConfiguration('k8s');
    let filesValidating = k8sConfig.get('filesNotValidating', []);
    let currentWindow = vscode.window.activeTextEditor;
    let currentWindowFilename = currentWindow.document.fileName;
        
    if(filesValidating.indexOf(currentWindowFilename) === -1){
        let newValidationFileList = filesValidating.concat(currentWindowFilename);
        k8sConfig.update('filesNotValidating', newValidationFileList, true);
    }

}



