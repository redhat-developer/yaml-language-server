import { SingleYAMLDocument } from '../parser/yamlParser07';
import { JSONDocument } from '../parser/jsonParser07';

const CRD_URI = 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main';

/**
 * Retrieve schema by auto-detecting the Kubernetes GroupVersionKind (GVK) from the document.
 * The matching schema is then retrieved from the CRD catalog.
 * Public for testing purpose, not part of the API.
 * @param doc
 */
export function autoDetectKubernetesSchemaFromDocument(doc: SingleYAMLDocument | JSONDocument): string | undefined {
  const res = getGroupVersionKindFromDocument(doc);
  if (!res) {
    return undefined;
  }

  const { group, version, kind } = res;
  if (!group || !version || !kind) {
    return undefined;
  }

  const schemaURL = `${CRD_URI}/${group.toLowerCase()}/${kind.toLowerCase()}_${version.toLowerCase()}.json`;
  return schemaURL;
}

/**
 * Retrieve the group, version and kind from the document.
 * Public for testing purpose, not part of the API.
 * @param doc
 */
export function getGroupVersionKindFromDocument(
  doc: SingleYAMLDocument | JSONDocument
): { group: string; version: string; kind: string } | undefined {
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
