import { URI } from 'vscode-uri';
import type { JSONSchema } from '../jsonSchema';
import * as path from 'path';

export function getSchemaTypeName(schema: JSONSchema, ignoreFileNameRefs = false): string {
  const closestTitleWithType = schema.type && schema.closestTitle;
  if (schema.title) {
    return schema.title;
  }
  if (schema.$id && !(ignoreFileNameRefs && isSchemaFileRef(schema.$id))) {
    return getSchemaRefTypeTitle(schema.$id);
  }
  const ref = schema.$ref || schema._$ref;
  if (ref && !(ignoreFileNameRefs && isSchemaFileRef(ref))) {
    return getSchemaRefTypeTitle(ref);
  }
  return Array.isArray(schema.type)
    ? schema.type.join(' | ')
    : closestTitleWithType
      ? schema.type.concat('(', schema.closestTitle, ')')
      : schema.type || schema.closestTitle; //object
}

/**
 * A `$id`/`$ref` pointing at a whole schema document (no `#/...` fragment) yields a
 * plain file name such as `schema1.json` or `schema1.schema.json`, which is a schema
 * file name rather than a type name.
 */
function isSchemaFileRef($ref: string): boolean {
  return !$ref.includes('#');
}

/**
 * Get type name from reference url
 * @param $ref reference to the same file OR to the another component OR to the section in another component:
 * `schema-name.schema.json` -> schema-name
 * `custom-scheme://shared-schema.json#/definitions/SomeType` -> SomeType
 * `custom-scheme://schema-name.schema.json` -> schema-name
 * `shared-schema.schema.json#/definitions/SomeType` -> SomeType
 * `file:///Users/user/Documents/project/schemas/schema-name.schema.json` -> schema-name
 * `#/definitions/SomeType` -> SomeType
 * `#/definitions/io.k8s.api.apps.v1.DaemonSetSpec` => io.k8s.api.apps.v1.DaemonSetSpec
 * `file:///default_schema_id.yaml` => default_schema_id.yaml
 * test: https://regex101.com/r/ZpuXxk/1
 */
export function getSchemaRefTypeTitle($ref: string): string {
  const match = $ref.match(/^(?:.*\/)?(.*?)(?:\.schema\.json)?$/);
  let type = !!match && match[1];
  if (!type) {
    type = 'typeNotFound';
    console.error(`$ref (${$ref}) not parsed properly`);
  }
  return type;
}

export function getSchemaTitle(schema: JSONSchema, url: string): string {
  const uri = URI.parse(url);
  const baseName = path.basename(uri.fsPath);
  const fragmentName = uri.fragment.split('/').filter(Boolean).pop();
  const kubernetesVersion = uri.path.match(/\/(v\d+\.\d+\.\d+)-standalone-strict\/(?:_definitions|all)\.json$/)?.[1];
  if (kubernetesVersion) {
    return fragmentName
      ? `${fragmentName.split('.').pop()} (Kubernetes ${kubernetesVersion})`
      : `Kubernetes ${kubernetesVersion}`;
  }
  if (Object.getOwnPropertyDescriptor(schema, 'name')) {
    return Object.getOwnPropertyDescriptor(schema, 'name').value + ` (${baseName})`;
  } else if (schema.title) {
    return schema.description ? schema.title + ' - ' + schema.description + ` (${baseName})` : schema.title + ` (${baseName})`;
  }

  return baseName;
}

export function isPrimitiveType(schema: JSONSchema): boolean {
  return schema.type !== 'object' && !isAnyOfAllOfOneOfType(schema);
}

export function isAnyOfAllOfOneOfType(schema: JSONSchema): boolean {
  return !!(schema.anyOf || schema.allOf || schema.oneOf);
}
