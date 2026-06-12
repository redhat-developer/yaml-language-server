import { CST, visit } from 'yaml';
import { ASTNode } from '../jsonASTTypes.ts';

export class FlowStyleRewriter {
  constructor(private readonly indentation: string) {}

  public write(node: ASTNode): string | null {
    if (node.internalNode.srcToken['type'] !== 'flow-collection') {
      return null;
    }
    const collection: CST.FlowCollection = node.internalNode.srcToken as CST.FlowCollection;
    const blockType = collection.start.type === 'flow-map-start' ? 'block-map' : 'block-seq';
    const parentType = node.parent.type;

    const blockStyle = {
      type: blockType,
      offset: collection.offset,
      indent: collection.indent,
      items: [],
    };

    for (const item of collection.items) {
      CST.visit(item, ({ key, sep, value }) => {
        if (blockType === 'block-map') {
          const start: CST.SourceToken[] = [{ type: 'space', indent: 0, offset: key.offset, source: this.indentation }];
          if (parentType === 'property') {
            // add a new line if part of a map
            start.unshift({ type: 'newline', indent: 0, offset: key.offset, source: '\n' });
          }
          blockStyle.items.push({
            start: start,
            key: key,
            sep: sep,
            value: value,
          });
        } else if (blockType === 'block-seq') {
          blockStyle.items.push({
            start: [
              { type: 'newline', indent: 0, offset: value.offset, source: '\n' },
              { type: 'space', indent: 0, offset: value.offset, source: this.indentation },
              { type: 'seq-item-ind', indent: 0, offset: value.offset, source: '-' },
              { type: 'space', indent: 0, offset: value.offset, source: ' ' },
            ] satisfies CST.SourceToken[],
            value: value,
          });
        }
        if (value.type === 'flow-collection') {
          return visit.SKIP;
        }
      });
    }
    return CST.stringify(blockStyle as CST.Token);
  }
}
