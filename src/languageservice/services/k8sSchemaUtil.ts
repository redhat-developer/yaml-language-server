import { JSONDocument } from '../parser/jsonDocument';
import { SingleYAMLDocument } from '../parser/yamlParser07';

import { ResolvedSchema } from 'vscode-json-languageservice/lib/umd/services/jsonSchemaService';
import { JSONSchema } from '../jsonSchema';
import { BASE_KUBERNETES_SCHEMA_URL } from '../utils/schemaUrls';

/**
 * Attempt to retrieve the schema for a given YAML document based on the Kubernetes GroupVersionKind (GVK).
 *
 * First, checks for a schema for a matching builtin resource, then it checks for a schema for a CRD.
 *
 * @param doc the yaml document being validated
 * @param kubernetesSchema the resolved copy of the Kubernetes builtin
 * @param crdCatalogURI the catalog uri to use to find schemas for custom resource definitions
 * @returns a schema uri, or undefined if no specific schema can be identified
 */
export function autoDetectKubernetesSchema(
  doc: SingleYAMLDocument | JSONDocument,
  kubernetesSchema: ResolvedSchema,
  crdCatalogURI: string
): string | undefined {
  const gvk = getGroupVersionKindFromDocument(doc);
  if (!gvk || !gvk.group || !gvk.version || !gvk.kind) {
    return undefined;
  }
  const builtinResource = autoDetectBuiltinResource(gvk, kubernetesSchema);
  if (builtinResource) {
    return builtinResource;
  }
  const customResource = autoDetectCustomResource(gvk, crdCatalogURI);
  if (customResource) {
    return customResource;
  }
  return undefined;
}

function autoDetectBuiltinResource(gvk: GroupVersionKind, kubernetesSchema: ResolvedSchema): string | undefined {
  const { group, version, kind } = gvk;

  const groupWithoutK8sIO = group.replace('.k8s.io', '').replace('rbac.authorization', 'rbac');
  const k8sTypeName = `io.k8s.api.${groupWithoutK8sIO.toLowerCase()}.${version.toLowerCase()}.${kind.toLowerCase()}`;
  const k8sSchema: JSONSchema = kubernetesSchema.schema;
  const matchingBuiltin: string | undefined = (k8sSchema.oneOf || [])
    .map((s) => {
      if (typeof s === 'boolean') {
        return undefined;
      }
      return s._$ref || s.$ref;
    })
    .find((ref) => {
      if (!ref) {
        return false;
      }
      const lowercaseRef = ref.replace('_definitions.json#/definitions/', '').toLowerCase();
      return lowercaseRef === k8sTypeName;
    });

  if (matchingBuiltin) {
    return BASE_KUBERNETES_SCHEMA_URL + matchingBuiltin;
  }

  return undefined;
}

/**
 * Retrieve schema by auto-detecting the Kubernetes GroupVersionKind (GVK) from the document.
 * If there is no definition for the GVK in the main kubernetes schema,
 * the schema is then retrieved from the CRD catalog.
 * Public for testing purpose, not part of the API.
 * @param doc
 * @param crdCatalogURI The URL of the CRD catalog to retrieve the schema from
 */
export function autoDetectCustomResource(gvk: GroupVersionKind, crdCatalogURI: string): string | undefined {
  const { group, version, kind } = gvk;

  const groupWithoutK8sIO = group.replace('.k8s.io', '').replace('rbac.authorization', 'rbac');
  const k8sTypeName = `io.k8s.api.${groupWithoutK8sIO.toLowerCase()}.${version.toLowerCase()}.${kind.toLowerCase()}`;

  if (k8sTypeName.includes('openshift.io')) {
    return `${crdCatalogURI}/openshift/v4.15-strict/${kind.toLowerCase()}_${group.toLowerCase()}_${version.toLowerCase()}.json`;
  }

  const schemaURL = `${crdCatalogURI}/${group.toLowerCase()}/${kind.toLowerCase()}_${version.toLowerCase()}.json`;
  return schemaURL;
}

type GroupVersionKind = {
  group: string;
  version: string;
  kind: string;
};

/**
 * Retrieve the group, version and kind from the document.
 * Public for testing purpose, not part of the API.
 * @param doc
 */
export function getGroupVersionKindFromDocument(doc: SingleYAMLDocument | JSONDocument): GroupVersionKind | undefined {
  if (doc instanceof SingleYAMLDocument) {
    try {
      const rootJSON = doc.root.internalNode.toJSON();
      if (!rootJSON) {
        return undefined;
      }

      const groupVersion = rootJSON['apiVersion'];
      if (!groupVersion) {
        return undefined;
      }

      const [group, version] = groupVersion.split('/');
      if (!group || !version) {
        return undefined;
      }

      const kind = rootJSON['kind'];
      if (!kind) {
        return undefined;
      }

      return { group, version, kind };
    } catch (error) {
      console.error('Error parsing YAML document:', error);
      return undefined;
    }
  }
  return undefined;
}
