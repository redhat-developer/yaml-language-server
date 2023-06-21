import { Position, Range, SelectionRange } from 'vscode-languageserver-types';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ASTNode } from 'vscode-json-languageservice';

export function getSelectionRanges(document: TextDocument, positions: Position[]): SelectionRange[] | undefined {
  if (!document) {
    return;
  }
  const doc = yamlDocumentsCache.getYamlDocument(document);
  return positions.map((position) => {
    const ranges = getRanges(position);
    let current: SelectionRange;
    for (const range of ranges) {
      current = SelectionRange.create(range, current);
    }
    if (!current) {
      current = SelectionRange.create({
        start: position,
        end: position,
      });
    }
    return current;
  });

  function getRanges(position: Position): Range[] {
    const offset = document.offsetAt(position);
    const result: Range[] = [];
    for (const ymlDoc of doc.documents) {
      let currentNode: ASTNode;
      let firstNodeOffset: number;
      let isFirstNode = true;
      ymlDoc.visit((node) => {
        const endOffset = node.offset + node.length;
        // Skip if end offset doesn't even reach cursor position
        if (endOffset < offset) {
          return true;
        }
        let startOffset = node.offset;
        // Recheck start offset with the trimmed one in case of this
        // key:
        //   - value
        // ↑
        if (startOffset > offset) {
          const nodePosition = document.positionAt(startOffset);
          if (nodePosition.line !== position.line) {
            return true;
          }
          const lineBeginning = { line: nodePosition.line, character: 0 };
          const text = document.getText({
            start: lineBeginning,
            end: nodePosition,
          });
          if (text.trim().length !== 0) {
            return true;
          }
          startOffset = document.offsetAt(lineBeginning);
          if (startOffset > offset) {
            return true;
          }
        }
        // Allow equal for children to override
        if (!currentNode || startOffset >= currentNode.offset) {
          currentNode = node;
          firstNodeOffset = startOffset;
        }
        return true;
      });
      while (currentNode) {
        const startOffset = isFirstNode ? firstNodeOffset : currentNode.offset;
        const endOffset = currentNode.offset + currentNode.length;
        const range = {
          start: document.positionAt(startOffset),
          end: document.positionAt(endOffset),
        };
        const text = document.getText(range);
        const trimmedText = text.trimEnd();
        const trimmedLength = text.length - trimmedText.length;
        if (trimmedLength > 0) {
          range.end = document.positionAt(endOffset - trimmedLength);
        }
        // Add a jump between '' "" {} []
        const isSurroundedBy = (startCharacter: string, endCharacter?: string): boolean => {
          return trimmedText.startsWith(startCharacter) && trimmedText.endsWith(endCharacter || startCharacter);
        };
        if (
          (currentNode.type === 'string' && (isSurroundedBy("'") || isSurroundedBy('"'))) ||
          (currentNode.type === 'object' && isSurroundedBy('{', '}')) ||
          (currentNode.type === 'array' && isSurroundedBy('[', ']'))
        ) {
          result.push({
            start: document.positionAt(startOffset + 1),
            end: document.positionAt(endOffset - 1),
          });
        }
        result.push(range);
        currentNode = currentNode.parent;
        isFirstNode = false;
      }
      // A position can't be in multiple documents
      if (result.length > 0) {
        break;
      }
    }
    return result.reverse();
  }
}
