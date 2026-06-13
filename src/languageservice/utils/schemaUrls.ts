import type { WorkspaceFolder } from 'vscode-languageserver-protocol';

import type { JSONSchema, JSONSchemaRef } from '../jsonSchema';
import type { Telemetry } from '../telemetry';

import * as path from 'path';

import { URI } from 'vscode-uri';

import { isBoolean } from './objects';
import { isRelativePath, relativeToAbsolutePath } from './paths';

export const DEFAULT_KUBERNETES_SCHEMA_VERSION = 'v1.34.1';
export const JSON_SCHEMASTORE_URL = 'https://www.schemastore.org/api/json/catalog.json';
export const CRD_CATALOG_URL = 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main';
export const EMPTY_SCHEMA_URL = 'vscode://schemas/empty';

const KUBERNETES_SCHEMA_URL_PATTERN =
  /^https:\/\/raw\.githubusercontent\.com\/yannh\/kubernetes-json-schema\/master\/((?:v(\d+)\.(\d+)\.(\d+))-standalone-strict)\/all\.json$/;

export function isKubernetes(uri: string): boolean {
  if (uri.trim().toLowerCase() === 'kubernetes') return true;
  return KUBERNETES_SCHEMA_URL_PATTERN.test(uri);
}

export function checkSchemaURI(
  workspaceFolders: WorkspaceFolder[],
  workspaceRoot: URI,
  uri: string,
  telemetry: Telemetry,
  kubernetesVersion?: string
): string {
  const k8sKeywordUsed = uri.trim().toLowerCase() === 'kubernetes';
  if (k8sKeywordUsed || KUBERNETES_SCHEMA_URL_PATTERN.test(uri)) {
    telemetry.send({ name: 'yaml.schema.configured', properties: { kubernetes: true } });
    if (k8sKeywordUsed) {
      return `https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/${kubernetesVersion ?? DEFAULT_KUBERNETES_SCHEMA_VERSION}-standalone-strict/all.json`;
    } else {
      return uri;
    }
  } else if (path.isAbsolute(uri) || /^[a-z]:[\\/]/i.test(uri)) {
    const localPath = uri.split('#', 2)[0];
    return URI.file(localPath).toString() + uri.substring(localPath.length);
  } else if (isRelativePath(uri)) {
    return relativeToAbsolutePath(workspaceFolders, workspaceRoot, uri);
  } else {
    return uri;
  }
}

/**
 * Collect all urls of sub schemas
 * @param schema the root schema
 * @returns map url to schema
 */
export function getSchemaUrls(schema: JSONSchema): Map<string, JSONSchema> {
  const result = new Map<string, JSONSchema>();
  if (!schema) {
    return result;
  }

  if (schema.url) {
    if (schema.url.startsWith('schemaservice://combinedSchema/')) {
      addSchemasForOf(schema, result);
    } else {
      result.set(schema.url, schema);
    }
  } else {
    addSchemasForOf(schema, result);
  }
  return result;
}

function addSchemasForOf(schema: JSONSchema, result: Map<string, JSONSchema>): void {
  if (schema.allOf) {
    addInnerSchemaUrls(schema.allOf, result);
  }
  if (schema.anyOf) {
    addInnerSchemaUrls(schema.anyOf, result);
  }
  if (schema.oneOf) {
    addInnerSchemaUrls(schema.oneOf, result);
  }
}

function addInnerSchemaUrls(schemas: JSONSchemaRef[], result: Map<string, JSONSchema>): void {
  for (const subSchema of schemas) {
    if (!isBoolean(subSchema) && subSchema.url && !result.has(subSchema.url)) {
      result.set(subSchema.url, subSchema);
    }
  }
}
