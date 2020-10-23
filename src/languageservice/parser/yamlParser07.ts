/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import * as Yaml from 'yaml-language-server-parser';

import { JSONDocument } from './jsonParser07';
import { YAMLDocDiagnostic, formatErrors, formatWarnings, customTagsToAdditionalOptions } from '../utils/parseUtils';
import recursivelyBuildAst from './recursivelyBuildAst';
import { getLineStartPositions } from '../utils/documentPositionCalculator';
import { ASTNode } from '../jsonASTTypes';
import { ErrorCode } from 'vscode-json-languageservice';

const YAML_COMMENT_PREFIX = '#';
const YAML_DATA_INSTANCE_SEPARATOR = '---';

/**
 * These documents are collected into a final YAMLDocument
 * and passed to the `parseYAML` caller.
 */
export class SingleYAMLDocument extends JSONDocument {
  private lines: number[];
  public root: ASTNode;
  public errors: YAMLDocDiagnostic[];
  public warnings: YAMLDocDiagnostic[];
  public isKubernetes: boolean;
  public currentDocIndex: number;
  public lineComments: string[];

  constructor(lines: number[]) {
    super(null, []);
    this.lines = lines;
    this.root = null;
    this.errors = [];
    this.warnings = [];
    this.lineComments = [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public getSchemas(schema: any, doc: any, node: any): any[] {
    const matchingSchemas = [];
    doc.validate(schema, matchingSchemas, node.start);
    return matchingSchemas;
  }
}

function nodeToSingleDoc(yamlNode: Yaml.YAMLNode, startPositions: number[], text: string): SingleYAMLDocument {
  const _doc = new SingleYAMLDocument(startPositions);
  _doc.root = recursivelyBuildAst(null, yamlNode);

  if (!_doc.root) {
    // TODO: When this is true, consider not pushing the other errors.
    _doc.errors.push(({
      message: localize('Invalid symbol', 'Expected a YAML object, array or literal'),
      code: ErrorCode.Undefined,
      location: { start: yamlNode.startPosition, end: yamlNode.endPosition },
    } as unknown) as YAMLDocDiagnostic);
  }

  const errors = formatErrors(yamlNode.errors);
  const warnings = formatWarnings(yamlNode.errors, text);

  errors.forEach((e) => {
    return _doc.errors.push(e);
  });
  warnings.forEach((e) => {
    return _doc.warnings.push(e);
  });

  return _doc;
}

/**
 * Contains the SingleYAMLDocuments, to be passed
 * to the `parseYAML` caller.
 */
export class YAMLDocument {
  public documents: SingleYAMLDocument[];
  private errors: YAMLDocDiagnostic[];
  private warnings: YAMLDocDiagnostic[];

  constructor(documents: SingleYAMLDocument[]) {
    this.documents = documents;
    this.errors = [];
    this.warnings = [];
  }
}

/**
 * `yaml-ast-parser-custom-tags` parses the AST and
 * returns YAML AST nodes, which are then formatted
 * for consumption via the language server.
 */
export function parse(text: string, customTags = []): YAMLDocument {
  const additionalOptions = customTagsToAdditionalOptions(customTags);

  // Parse the AST using `yaml-ast-parser-custom-tags`
  const yamlNodes: Yaml.YAMLNode[] = [];
  Yaml.loadAll(text, (doc) => yamlNodes.push(doc), additionalOptions);

  // Generate the SingleYAMLDocs from the AST nodes
  const startPositions = getLineStartPositions(text);
  const yamlDocs: SingleYAMLDocument[] = yamlNodes.map((node) => nodeToSingleDoc(node, startPositions, text));

  parseLineComments(text, yamlDocs);

  // Consolidate the SingleYAMLDocs
  return new YAMLDocument(yamlDocs);
}

function parseLineComments(text: string, yamlDocs: SingleYAMLDocument[]): void {
  const lines = text.split(/[\r\n]+/g);
  let yamlDocCount = 0;
  let firstSeparatorFound = false;
  lines.forEach((line) => {
    if (line === YAML_DATA_INSTANCE_SEPARATOR && firstSeparatorFound) {
      yamlDocCount++;
    } else if (line === YAML_DATA_INSTANCE_SEPARATOR) {
      firstSeparatorFound = true;
    }
    if (line.startsWith(YAML_COMMENT_PREFIX) && yamlDocCount < yamlDocs.length) {
      yamlDocs[yamlDocCount].lineComments.push(line);
    }
  });
}
