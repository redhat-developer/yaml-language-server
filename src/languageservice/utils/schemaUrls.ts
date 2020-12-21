import { WorkspaceFolder } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { isRelativePath, relativeToAbsolutePath } from './paths';

export const KUBERNETES_SCHEMA_URL =
  'https://raw.githubusercontent.com/instrumenta/kubernetes-json-schema/master/v1.17.0-standalone-strict/all.json';
export const JSON_SCHEMASTORE_URL = 'https://www.schemastore.org/api/json/catalog.json';

export function checkSchemaURI(workspaceFolders: WorkspaceFolder[], workspaceRoot: URI, uri: string): string {
  if (uri.trim().toLowerCase() === 'kubernetes') {
    return KUBERNETES_SCHEMA_URL;
  } else if (isRelativePath(uri)) {
    return relativeToAbsolutePath(workspaceFolders, workspaceRoot, uri);
  } else {
    return uri;
  }
}
