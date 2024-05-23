/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { LocationLink, Position, Range } from 'vscode-languageserver-types';
import { isSeq, isMap, isScalar, isPair, YAMLMap, Node, Pair, isNode, Scalar, visit } from 'yaml';
import { SingleYAMLDocument, YAMLDocument, yamlDocumentsCache } from '../parser/yaml-documents';
import { readFileSync, readdirSync, statSync } from 'fs';
import { WorkspaceFolder } from 'vscode-languageserver';
import { URI } from 'vscode-uri';

// Find node within all yaml documents
export function findNodeFromPath(
  allDocuments: [string, YAMLDocument, TextDocument][],
  path: string[]
): [string, Pair<unknown, unknown>, TextDocument] | undefined {
  for (const [uri, docctx, doctxt] of allDocuments) {
    for (const doc of docctx.documents) {
      if (isMap(doc.internalDocument.contents)) {
        let node: YAMLMap<unknown, unknown> = doc.internalDocument.contents;
        let i = 0;
        // Follow path
        while (i < path.length) {
          const target = node.items.find(({ key: key }) => key == path[i]);
          if (target && i == path.length - 1) {
            return [uri, target, doctxt];
          } else if (target && isMap(target.value)) {
            node = target.value;
          } else {
            break;
          }
          ++i;
        }
      }
    }
  }
}

// Like findNodeFromPath but will follow extends tags
export function findNodeFromPathRecursive(
  allDocuments: [string, YAMLDocument, TextDocument][],
  path: string[],
  maxDepth = 16
): [string, Pair<unknown, unknown>, TextDocument][] {
  const result = [];
  let pathResult = findNodeFromPath(allDocuments, path);
  for (let i = 0; pathResult && i < maxDepth; ++i) {
    result.push(pathResult);
    const target = pathResult[1];
    path = null;
    if (isMap(target.value)) {
      // Find extends within result
      const extendsNode = findChildWithKey(target.value, 'extends');
      if (extendsNode) {
        // Only follow the first extends tag
        if (isScalar(extendsNode.value)) {
          path = [extendsNode.value.value as string];
        } else if (isSeq(extendsNode.value) && isScalar(extendsNode.value.items[0])) {
          path = [extendsNode.value.items[0].value as string];
        }
      }
    }
    if (path === null) {
      break;
    }
    pathResult = findNodeFromPath(allDocuments, path);
  }

  return result;
}

// Will create a LocationLink from a pair node
export function createDefinitionFromTarget(target: Pair<Node, Node>, document: TextDocument, uri: string): LocationLink {
  const start = target.key.range[0];
  const endDef = target.key.range[1];
  const endFull = target.value.range[2];
  const targetRange = Range.create(document.positionAt(start), document.positionAt(endFull));
  const selectionRange = Range.create(document.positionAt(start), document.positionAt(endDef));

  return LocationLink.create(uri, targetRange, selectionRange);
}

// Returns whether or not the node has a parent with the given key
// Useful to find the parent for nested nodes (e.g. extends with an array)
export function findParentWithKey(node: Node, key: string, currentDoc: SingleYAMLDocument, maxDepth = 2): Pair {
  let parent = currentDoc.getParent(node);
  for (let i = 0; i < maxDepth; ++i) {
    if (parent && isPair(parent) && isScalar(parent.key) && parent.key.value === key) {
      return parent;
    }
    parent = currentDoc.getParent(parent);
  }

  return null;
}

// Find if possible a child with the given key
export function findChildWithKey(node: YAMLMap, targetKey: string): Pair | undefined {
  return node.items.find(({ key: key }) => key == targetKey);
}

// Get all potential job nodes from all documents
// A job node is a map node at the root of the document
export function getJobNodes(
  allDocuments: [string, YAMLDocument, TextDocument][]
): [LocationLink, TextDocument, Pair<Node, YAMLMap>][] {
  const jobNodes = [];
  for (const [uri, docctx, doctxt] of allDocuments) {
    for (const doc of docctx.documents) {
      if (isMap(doc.internalDocument.contents)) {
        for (const node of doc.internalDocument.contents.items) {
          if (isNode(node.key) && isMap(node.value)) {
            const loc = createDefinitionFromTarget(node as Pair<Node, Node>, doctxt, uri);
            jobNodes.push([loc, doctxt, node]);
          }
        }
      }
    }
  }

  return jobNodes;
}

// Find where jobs are used, such as within extends or needs nodes and reference tags
export function findUsages(allDocuments: [string, YAMLDocument, TextDocument][]): Map<string, LocationLink[]> {
  const targetAttributes = ['extends', 'needs'];
  const usages = new Map<string, LocationLink[]>();
  const jobNodes = getJobNodes(allDocuments);

  for (const [jobLoc, doc, job] of jobNodes) {
    // !reference tags
    visit(job.value, (_, node) => {
      // Support only top level jobs so the sequence must be of length 1
      if (isSeq(node) && node.tag === '!reference' && node.items.length === 1 && isScalar(node.items[0])) {
        const jobName = node.items[0].value as string;
        const range = Range.create(doc.positionAt(node.items[0].range[0]), doc.positionAt(node.items[0].range[1]));
        const loc = LocationLink.create(jobLoc.targetUri, range, range);
        if (usages.has(jobName)) usages.get(jobName).push(loc);
        else usages.set(jobName, [loc]);
      }
    });

    // Extends / needs attributes
    // For each attribute of each job
    for (const item of job.value.items) {
      if (isScalar(item.key)) {
        if (targetAttributes.includes(item.key.value as string)) {
          const referencedJobs: Scalar[] = [];

          // Get all job names
          if (isScalar(item.value) && typeof item.value.value === 'string') {
            referencedJobs.push(item.value);
          } else if (isSeq(item.value)) {
            for (const seqItem of item.value.items) {
              if (isScalar(seqItem) && typeof seqItem.value === 'string') {
                referencedJobs.push(seqItem);
              }
            }
          }

          for (const referencedJob of referencedJobs) {
            const jobName = referencedJob.value as string;
            const targetRange = Range.create(doc.positionAt(referencedJob.range[0]), doc.positionAt(referencedJob.range[1]));
            const loc = LocationLink.create(jobLoc.targetUri, targetRange, targetRange);

            // Add it to the references
            if (usages.has(jobName)) usages.get(jobName).push(loc);
            else usages.set(jobName, [loc]);
          }
        }
      }
    }
  }

  return usages;
}

export function toExportedPos(pos: Position): object {
  return { lineNumber: pos.line + 1, column: pos.character + 1 };
}

export function toExportedRange(range: Range): object {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

// Parse the file at this parse and add it to the cache
function registerFile(path: string): void {
  const content = readFileSync(path, 'utf8');
  const doc = TextDocument.create('file://' + path, 'yaml', 1, content);
  yamlDocumentsCache.getYamlDocument(doc);
}

function registerWorkspaceFiles(path: string): void {
  const files = readdirSync(path);
  for (const file of files) {
    const filePath = path + '/' + file;
    if (file.endsWith('.yaml') || file.endsWith('.yml')) {
      registerFile(filePath);
    } else if (statSync(filePath).isDirectory()) {
      registerWorkspaceFiles(filePath);
    }
  }
}

// Walk through all the files in the workspace and put them in cache
// Useful to have cross files references for gitlabci
export function registerWorkspaces(workspaceFolders: WorkspaceFolder[]): void {
  for (const folder of workspaceFolders) {
    registerWorkspaceFiles(URI.parse(folder.uri).fsPath);
  }
}
