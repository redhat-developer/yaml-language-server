import { WorkspaceFolder } from 'vscode-languageserver';
import { join, normalize } from 'path';
import URI from './uri';

export const isRelativePath = (path: string): boolean => {
    const relativePathRegex = /^(((\.\.?)|([\w-\. ]+))(\/|\\\\?))*[\w-\. ]*\.[\w-]+$/i;
    return relativePathRegex.test(path);
};

export const relativeToAbsolutePath = (workspaceFolders: WorkspaceFolder[], workspaceRoot: URI, uri: string): string => {
    // Iterate through all of the workspace root folders
    for (const folder of workspaceFolders) {
        // If the requested schema URI specifies a workspace root folder
        // Convert it into an absolute path with the appropriate root folder path
        if (uri.startsWith(folder.name)) {
            const beforeFolderName = folder.uri.split(folder.name)[0];
            return (beforeFolderName + uri);
        }
    }

    // If a root folder was not specified, resolve the relative URI
    // Against the location of the workspace file instead
    if (workspaceRoot) {
        return URI.file(normalize(join(workspaceRoot.fsPath, uri))).toString();
    }

    // Fallback in case nothing could be applied
    return uri;
};
