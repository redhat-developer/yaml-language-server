import { yamlDocumentsCache } from '../../languageservice/parser/yaml-documents';
import { Telemetry } from '../../languageservice/telemetry';
import { matchOffsetToDocument } from '../../languageservice/utils/arrUtils';
import { Position, TextDocument, Workspace } from './languageModes';

export interface YamlEmbeddedNode {
  languageId: string | undefined;
  content?: string;
  start: number;
  end: number;
}

export interface YamlEmbeddedDocument {
  getLanguageAtPosition(position: Position): string | undefined;
}

export function getYamlEmbeddedDocument(
  document: TextDocument,
  workspace: Workspace,
  telemetry: Telemetry
): YamlEmbeddedDocument {
  return {
    getLanguageAtPosition: (position: Position) => getLanguageAtPosition(document, position),
  };
}

function getLanguageAtPosition(document: TextDocument, position: Position): string | undefined {
  const offset = document.offsetAt(position);
  const doc = yamlDocumentsCache.getYamlDocument(document);
  const currentDoc = matchOffsetToDocument(offset, doc);
  const node = currentDoc.getNodeFromOffset(offset, true);

  if (
    'type' in node.internalNode &&
    ['BLOCK_LITERAL', 'PLAIN'].includes(node.internalNode.type) &&
    typeof node.internalNode.value === 'string'
  ) {
    if (/^\s*\$\{\{\s+(?:.|\s)*\s+\}\}\s*$/.test(node.internalNode.value)) {
      return 'javascript';
    }
  }
}
