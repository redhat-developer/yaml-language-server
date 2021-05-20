import { WorkspaceFolder } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { Telemetry } from '../../languageserver/telemetry';
import { isRelativePath, relativeToAbsolutePath } from './paths';

export const KUBERNETES_SCHEMA_URL =
  'https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/v1.20.5-standalone-strict/all.json';
export const JSON_SCHEMASTORE_URL = 'https://www.schemastore.org/api/json/catalog.json';

export function checkSchemaURI(
  workspaceFolders: WorkspaceFolder[],
  workspaceRoot: URI,
  uri: string,
  telemetry: Telemetry
): string {
  if (uri.trim().toLowerCase() === 'kubernetes') {
    telemetry.send({ name: 'yaml.schema.configured', properties: { kubernetes: true } });
    return KUBERNETES_SCHEMA_URL;
  } else if (isRelativePath(uri)) {
    return relativeToAbsolutePath(workspaceFolders, workspaceRoot, uri);
  } else {
    return uri;
  }
}
