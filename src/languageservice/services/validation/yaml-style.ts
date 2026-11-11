import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver-types';
import type { CST } from 'yaml';
import { isMap, isSeq, visit } from 'yaml';
import type { SingleYAMLDocument } from '../../parser/yaml-documents.js';
import type { LanguageSettings } from '../../yamlLanguageService.js';
import type { AdditionalValidator } from './types.js';
import * as l10n from '@vscode/l10n';

export class YAMLStyleValidator implements AdditionalValidator {
  private forbidSequence: boolean;
  private forbidMapping: boolean;

  constructor(settings: LanguageSettings) {
    this.forbidMapping = settings.flowMapping === 'forbid';
    this.forbidSequence = settings.flowSequence === 'forbid';
  }
  validate(document: TextDocument, yamlDoc: SingleYAMLDocument): Diagnostic[] {
    const result = [];
    visit(yamlDoc.internalDocument, (key, node) => {
      if (this.forbidMapping && isMap(node) && isClosedFlowCollection(node.srcToken)) {
        result.push(
          Diagnostic.create(
            this.getRangeOf(document, node.srcToken),
            l10n.t('Flow style mapping is forbidden'),
            DiagnosticSeverity.Error,
            'flowMap'
          )
        );
      }
      if (this.forbidSequence && isSeq(node) && isClosedFlowCollection(node.srcToken)) {
        result.push(
          Diagnostic.create(
            this.getRangeOf(document, node.srcToken),
            l10n.t('Flow style sequence is forbidden'),
            DiagnosticSeverity.Error,
            'flowSeq'
          )
        );
      }
    });
    return result;
  }

  private getRangeOf(document: TextDocument, node: CST.FlowCollection): Range {
    const endOffset = node.end[0].offset;
    let endPosition = document.positionAt(endOffset);
    endPosition = { character: endPosition.character + 1, line: endPosition.line };
    return Range.create(document.positionAt(node.start.offset), endPosition);
  }
}

function isClosedFlowCollection(token: CST.Token | undefined): token is CST.FlowCollection {
  // An unclosed flow collection has no end token. The parser already reports it as a syntax error.
  return token?.type === 'flow-collection' && token.end.length > 0;
}
