import { Telemetry } from '../../languageservice/telemetry';
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
  const nodes: YamlEmbeddedNode[] = [];
  // const doc = yamlDocumentsCache.getYamlDocument(document);
  const docText = document.getText();
  const inlineJsRegex = new RegExp(/:\s+(?:\||-)?\s*(\$\{\{\s+(?:(?:.|\s)(?!\}{2}\s*$))+\s*\}\})/, 'gm');

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const match = inlineJsRegex.exec(docText);

      if (!match) {
        break;
      }

      const start = match.index + match[1].indexOf('${{');
      const end = start + match[1].length;

      // TODO: We might need to track `node` here to bind some context env, root is default
      // const currentDoc = matchOffsetToDocument(pos, doc);
      // const node = currentDoc.getNodeFromOffset(pos, true);

      nodes.push({
        languageId: 'javascript',
        start,
        end,
        content: match[1],
      });
    }
  } catch (error) {
    console.error(error);
    telemetry.sendError('getYamlEmbeddedDocument', { error: error.message });
  }

  return {
    getLanguageAtPosition: (position: Position) => getLanguageAtPosition(document, nodes, position),
  };
}

function getLanguageAtPosition(document: TextDocument, regions: YamlEmbeddedNode[], position: Position): string | undefined {
  const offset = document.offsetAt(position);

  for (const region of regions) {
    if (region.start <= offset) {
      if (offset <= region.end) {
        return region.languageId;
      }

      continue;
    }

    break;
  }

  return undefined;
}
