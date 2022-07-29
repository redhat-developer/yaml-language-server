import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver-types';
import { isMap, isSeq, visit } from 'yaml';
import { FlowCollection } from 'yaml/dist/parse/cst';
import { SingleYAMLDocument } from '../../parser/yaml-documents';
import { LanguageSettings } from '../../yamlLanguageService';
import { AdditionalValidator } from './types';

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
      if (this.forbidMapping && isMap(node) && node.srcToken?.type === 'flow-collection') {
        result.push(
          Diagnostic.create(
            this.getRangeOf(document, node.srcToken),
            'Flow style mapping is forbidden',
            DiagnosticSeverity.Error,
            'flowMap'
          )
        );
      }
      if (this.forbidSequence && isSeq(node) && node.srcToken?.type === 'flow-collection') {
        result.push(
          Diagnostic.create(
            this.getRangeOf(document, node.srcToken),
            'Flow style sequence is forbidden',
            DiagnosticSeverity.Error,
            'flowSeq'
          )
        );
      }
    });
    return result;
  }

  private getRangeOf(document: TextDocument, node: FlowCollection): Range {
    return Range.create(document.positionAt(node.start.offset), document.positionAt(node.end.pop().offset));
  }
}
