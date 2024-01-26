import { stripIndent } from 'common-tags';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import * as ts from 'typescript';
import { ASTNode, PropertyASTNode } from 'vscode-json-languageservice';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { yamlDocumentsCache } from '../../languageservice/parser/yaml-documents';
import { matchOffsetToDocument } from '../../languageservice/utils/arrUtils';
import { loadLibrary } from './javascriptLibs';
import {
  CompletionItem,
  CompletionItemData,
  CompletionItemKind,
  CompletionList,
  Definition,
  Hover,
  LanguageMode,
  ParameterInformation,
  Range,
  SignatureHelp,
  SignatureInformation,
  TextEdit,
  Workspace,
} from './languageModes';

// eslint-disable-next-line no-useless-escape
const JS_WORD_REGEX = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;

const CR = '\r'.charCodeAt(0);
const NL = '\n'.charCodeAt(0);
export const isNewlineCharacter = (charCode: number): boolean => {
  return charCode === CR || charCode === NL;
};

export const convertRange = (document: TextDocument, span: { start: number | undefined; length: number | undefined }): Range => {
  if (typeof span.start === 'undefined') {
    const pos = document.positionAt(0);
    return Range.create(pos, pos);
  }
  const startPosition = document.positionAt(span.start);
  const endPosition = document.positionAt(span.start + (span.length || 0));
  return Range.create(startPosition, endPosition);
};

export const isCompletionItemData = (value: any): value is CompletionItemData => {
  return value && typeof value.languageId === 'string' && typeof value.uri === 'string' && typeof value.offset === 'number';
};

const getTypeOfNodeInRootDTS = (rootVarsPropValueNode: ASTNode): string => {
  let rootVarsPropType = 'any';

  switch (rootVarsPropValueNode.type) {
    case 'number': {
      rootVarsPropType = 'number | null | undefined';
      break;
    }
    case 'boolean': {
      rootVarsPropType = 'boolean | null | undefined';
      break;
    }
    case 'array': {
      rootVarsPropType = 'any[] | null | undefined';
      break;
    }
    case 'object': {
      rootVarsPropType = 'Record<string, any> | null | undefined';
      break;
    }
    case 'string': {
      if (/^\s*\$\{\{\s+\[/.test(rootVarsPropValueNode.value)) {
        rootVarsPropType = 'any[] | null | undefined';
      } else if (/:\s+(?:\||-)?\s*(\$\{\{\s+(?:(?:.|\s)(?!\}{2}\s*$))+\s*\}\})/gm.test(rootVarsPropValueNode.value)) {
        rootVarsPropType = 'any';
      } else {
        rootVarsPropType = 'string | null | undefined';
      }
      break;
    }
  }

  return rootVarsPropType;
};

/**
 * Create a .d.ts file for global $rootVars, $rootProps, $rootSlots, $rootStore, $router, $router and
 * @param document
 * @returns
 */
const buildComponentRootDTS = (document: TextDocument): string => {
  const doc = yamlDocumentsCache.getYamlDocument(document);
  const yamlDoc = doc.documents.find((x) => x.internalDocument) ?? doc.documents[0];
  let rootVars = '{}';
  let rootStore = '{}';

  const rootVarsNode = yamlDoc.root.children.find((x) => x.type === 'property' && x.keyNode.value === 'rootVars');
  if (rootVarsNode) {
    const rootVarsNodeValue = (rootVarsNode as PropertyASTNode).valueNode;

    if (rootVarsNodeValue) {
      rootVars = `{`;

      if (rootVarsNodeValue.type === 'array') {
        for (const item of rootVarsNodeValue.items) {
          if (item.type === 'string') {
            rootVars += ` ${item.value}: any; `;
          } else if (item.type === 'object') {
            const rootVarsPropName = item.properties[0].keyNode.value;
            const rootVarsPropType = getTypeOfNodeInRootDTS(item.properties[0].valueNode);

            rootVars += ` ${rootVarsPropName}: ${rootVarsPropType}; `;
          }
        }
      } else if (rootVarsNodeValue.type === 'object') {
        for (const property of rootVarsNodeValue.properties) {
          const rootVarsPropName = property.keyNode.value;
          const rootVarsPropType = getTypeOfNodeInRootDTS(property.valueNode);

          rootVars += ` ${rootVarsPropName}: ${rootVarsPropType}; `;
        }
      }

      rootVars += `}`;
    }
  }

  const rootStoreNode = yamlDoc.root.children.find((x) => x.type === 'property' && x.keyNode.value === 'rootStore');
  if (rootStoreNode) {
    const rootStoreNodeValue = (rootStoreNode as PropertyASTNode).valueNode;

    if (rootStoreNodeValue && rootStoreNodeValue.type === 'object') {
      rootStore = `{`;

      for (const property of rootStoreNodeValue.properties) {
        if (property.valueNode && property.valueNode.type === 'object') {
          const rootStorePropName = property.keyNode.value;
          const rootStorePropNodeValue = property.valueNode;

          if (rootStorePropNodeValue && rootStorePropNodeValue.type === 'object') {
            const initialStateNode = rootStorePropNodeValue.properties.find((x) => x.keyNode.value === 'initialState').valueNode;
            let rootStorePropType = 'any';

            if (initialStateNode && initialStateNode.type === 'object') {
              rootStorePropType = '{';

              for (const property of initialStateNode.properties) {
                const initialStatePropName = property.keyNode.value;
                const initialPropType = getTypeOfNodeInRootDTS(property.valueNode);

                rootStorePropType += ` ${initialStatePropName}: ${initialPropType}; `;
              }

              rootStorePropType += '}';
            }

            rootStore += ` ${rootStorePropName}: ${rootStorePropType}; `;
          }
        }
      }

      rootStore += `}`;
    }
  }

  return stripIndent`
    import { RouteLocationNormalizedLoaded, Router } from 'vue-router';

    declare global {
      declare const $route: RouteLocationNormalizedLoaded;
      declare const $router: Router;
      declare const $rootProps: Record<string, any>;
      declare const $rootSlots: Record<string, any>;
      declare const $rootVars: ${rootVars};
      declare const $rootStore: ${rootStore};
    }
  `;
};

interface LanguageServiceHost {
  getLanguageService(jsDocument: TextDocument): Promise<ts.LanguageService>;
  getCompilationSettings(): ts.CompilerOptions;
  dispose(): void;
}

function getLanguageServiceHost(scriptKind: ts.ScriptKind, document: TextDocument, workspace: Workspace): LanguageServiceHost {
  const yamlDocumentDTSPath = URI.parse(`${document.uri}.d.ts`).fsPath;
  const globalDTSPath = join(workspace.root, 'global.d.ts');
  const compilerOptions: ts.CompilerOptions = {
    allowNonTsExtensions: true,
    allowJs: true,
    lib: ['lib.esnext.full.d.ts', globalDTSPath, yamlDocumentDTSPath],
    target: ts.ScriptTarget.Latest,
    moduleResolution: ts.ModuleResolutionKind.Classic,
    experimentalDecorators: false,
    rootDir: workspace.root,
    baseUrl: '.',
  };

  let currentTextDocument = TextDocument.create('init', 'javascript', 1, '');
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => [currentTextDocument.uri],
    getScriptKind: (fileName) => {
      if (fileName === currentTextDocument.uri) {
        return scriptKind;
      }
      return fileName.substr(fileName.length - 2) === 'ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    },
    getScriptVersion: (fileName: string) => {
      if (fileName === currentTextDocument.uri || fileName === yamlDocumentDTSPath) {
        return String(currentTextDocument.version);
      }
      return '1';
    },
    getScriptSnapshot: (fileName: string) => {
      let text = '';
      if (fileName === currentTextDocument.uri) {
        text = currentTextDocument.getText();
      } else {
        text = host.readFile(fileName);
      }
      return {
        getText: (start, end) => text.substring(start, end),
        getLength: () => text.length,
        getChangeRange: () => undefined,
      };
    },
    getCurrentDirectory: () => workspace.root,
    getDefaultLibFileName: (_options: ts.CompilerOptions) => 'esnext.full',
    readFile: (path: string, _encoding?: string | undefined): string | undefined => {
      if (path === currentTextDocument.uri) {
        return currentTextDocument.getText();
      }

      if (path === yamlDocumentDTSPath) {
        return buildComponentRootDTS(document);
      }

      return loadLibrary(path, workspace.root);
    },
    resolveModuleNames: (
      moduleNames: string[],
      containingFile: string,
      reusedNames: string[] | undefined,
      redirectedReference,
      options,
      containingSourceFile
    ) => {
      return moduleNames.map((module) => {
        if (module.startsWith('./') || module.startsWith('../')) {
          const absPath = resolve(dirname(containingFile), module);
          const files = [`${absPath}.d.ts`, `${absPath}/index.d.ts`];

          for (const file of files) {
            if (host.fileExists(file)) {
              return {
                resolvedFileName: file,
              };
            }
          }
        }

        const test = join(workspace.root, 'node_modules', module);
        if (existsSync(test)) {
          const testPackageJson = join(test, 'package.json');

          if (host.fileExists(testPackageJson)) {
            const packageJsonContent = host.readFile(testPackageJson);

            if (packageJsonContent) {
              const packageJson = JSON.parse(packageJsonContent);
              const packageJsonTypes = packageJson.types || packageJson.typings;

              if (packageJsonTypes && host.fileExists(join(test, packageJsonTypes))) {
                return {
                  resolvedFileName: join(test, packageJsonTypes),
                };
              }
            }
          }

          const defaultIndexDTS = join(test, 'index.d.ts');
          if (host.fileExists(defaultIndexDTS)) {
            return {
              resolvedFileName: defaultIndexDTS,
            };
          }
        }
      });
    },
    fileExists: (path: string): boolean => {
      if (path === currentTextDocument.uri || path === yamlDocumentDTSPath) {
        return true;
      } else {
        return !!loadLibrary(path, workspace.root);
      }
    },
    directoryExists: (path: string): boolean => {
      // typescript tries to first find libraries in node_modules/@types and node_modules/@typescript
      // there's no node_modules in our setup
      if (path.startsWith('node_modules') || path.startsWith('/node_modules')) {
        return false;
      }
      return true;
    },
  };
  const jsLanguageService = Promise.resolve(ts.createLanguageService(host));

  return {
    async getLanguageService(jsDocument: TextDocument): Promise<ts.LanguageService> {
      currentTextDocument = jsDocument;
      return jsLanguageService;
    },
    getCompilationSettings() {
      return compilerOptions;
    },
    dispose() {
      jsLanguageService.then((s) => s.dispose());
    },
  };
}

const getJsDocumentAtPosition = (document: TextDocument, position: Position): TextDocument => {
  const offset = document.offsetAt(position);
  const doc = yamlDocumentsCache.getYamlDocument(document);
  const currentDoc = matchOffsetToDocument(offset, doc);
  const node = currentDoc.getNodeFromOffset(offset, true);
  let content = '';

  // For:
  // prop: |
  //   ${{
  //      ...js code ...
  //   }}
  if ('type' in node.internalNode && node.internalNode.type === 'BLOCK_LITERAL') {
    const leadingSpaces = document.positionAt(node.parent.offset).character + 2;
    // we need to + 1 here with BLOCK_LITERAL, since the offset of `node` is offset of `|` character
    const startPositionLine = document.positionAt(node.offset).line + 1;
    const endPositionLine = document.positionAt(node.offset + node.length).line;
    const nodeLines = node.value
      .toString()
      .replace(/(^\s*)(\$\{\{)/, '$1   ')
      .replace(/\}\}(\s*$)/, ' '.repeat(2))
      .split(/\r?\n/);
    content = document
      .getText()
      .split(/\r?\n/)
      .map((line, i) => {
        if (i >= startPositionLine && i < endPositionLine) {
          return ' '.repeat(leadingSpaces) + nodeLines[i - startPositionLine];
        }

        return ' '.repeat(line.length);
      })
      .join('\n');
  }

  // For:
  // prop: ${{ ...js code ... }}
  if ('type' in node.internalNode && node.internalNode.type === 'PLAIN') {
    const leadingSpaces = document.positionAt(node.offset).character;
    const startLine = document.positionAt(node.offset).line;
    const inlineCode = node.value
      .toString()
      .replace(/(^\s*)(\$\{\{)/, '$1   ')
      .replace(/\}\}(\s*$)/, ' '.repeat(2));
    content = document
      .getText()
      .split(/\r?\n/)
      .map((line, i) => {
        if (i == startLine) {
          return ' '.repeat(leadingSpaces) + inlineCode;
        }

        return ' '.repeat(line.length);
      })
      .join('\n');
  }

  return TextDocument.create(`${document.uri}.${randomUUID()}`, 'javascript', document.version, content);
};

export function getJavaScriptMode(languageId: string, workspace: Workspace): LanguageMode {
  const getHost = (document: TextDocument): LanguageServiceHost => {
    // FIXME: For now we have to create language service for each inline js code, need to optimize this later
    return getLanguageServiceHost(ts.ScriptKind.JS, document, workspace);
  };

  return {
    getId() {
      return languageId;
    },
    async doComplete(document: TextDocument, position: Position): Promise<CompletionList> {
      const host = getHost(document);
      try {
        const jsDocument = getJsDocumentAtPosition(document, position);
        const jsLanguageService = await host.getLanguageService(jsDocument);
        const offset = jsDocument.offsetAt(position);
        const completions = jsLanguageService.getCompletionsAtPosition(jsDocument.uri, offset, {
          includeExternalModuleExports: false,
          includeInsertTextCompletions: false,
        });
        if (!completions) {
          return { isIncomplete: false, items: [] };
        }
        const replaceRange = convertRange(jsDocument, getWordAtText(jsDocument.getText(), offset, JS_WORD_REGEX));
        return {
          isIncomplete: false,
          items: completions.entries.map((entry) => {
            const data: CompletionItemData = {
              // data used for resolving item details (see 'doResolve')
              languageId,
              uri: document.uri,
              offset: offset,
            };

            return {
              uri: document.uri,
              position: position,
              label: entry.name,
              sortText: entry.sortText,
              kind: convertKind(entry.kind),
              textEdit: TextEdit.replace(replaceRange, entry.name),
              data,
            };
          }),
        };
      } finally {
        host.dispose();
      }
    },
    async doSignatureHelp(document: TextDocument, position: Position): Promise<SignatureHelp | null> {
      const host = getHost(document);
      try {
        const jsDocument = getJsDocumentAtPosition(document, position);
        const jsLanguageService = await host.getLanguageService(jsDocument);
        const signHelp = jsLanguageService.getSignatureHelpItems(jsDocument.uri, jsDocument.offsetAt(position), undefined);
        if (signHelp) {
          const ret: SignatureHelp = {
            activeSignature: signHelp.selectedItemIndex,
            activeParameter: signHelp.argumentIndex,
            signatures: [],
          };
          signHelp.items.forEach((item) => {
            const signature: SignatureInformation = {
              label: '',
              documentation: undefined,
              parameters: [],
            };

            signature.label += ts.displayPartsToString(item.prefixDisplayParts);
            item.parameters.forEach((p, i, a) => {
              const label = ts.displayPartsToString(p.displayParts);
              const parameter: ParameterInformation = {
                label: label,
                documentation: ts.displayPartsToString(p.documentation),
              };
              signature.label += label;
              signature.parameters!.push(parameter);
              if (i < a.length - 1) {
                signature.label += ts.displayPartsToString(item.separatorDisplayParts);
              }
            });
            signature.label += ts.displayPartsToString(item.suffixDisplayParts);
            ret.signatures.push(signature);
          });
          return ret;
        }
        return null;
      } finally {
        host.dispose();
      }
    },
    async doHover(document: TextDocument, position: Position): Promise<Hover | null> {
      const host = getHost(document);
      try {
        const jsDocument = getJsDocumentAtPosition(document, position);
        const jsLanguageService = await host.getLanguageService(jsDocument);
        const info = jsLanguageService.getQuickInfoAtPosition(jsDocument.uri, jsDocument.offsetAt(position));
        if (info) {
          const contents = ts.displayPartsToString(info.displayParts);
          return {
            range: convertRange(jsDocument, info.textSpan),
            contents: ['```typescript', contents, '```'].join('\n'),
          };
        }
        return null;
      } finally {
        host.dispose();
      }
    },
    async doResolve(document: TextDocument, item: CompletionItem): Promise<CompletionItem> {
      if (isCompletionItemData(item.data)) {
        const host = getHost(document);
        try {
          const jsDocument = getJsDocumentAtPosition(document, document.positionAt(item.data.offset));
          const jsLanguageService = await host.getLanguageService(jsDocument);
          const details = jsLanguageService.getCompletionEntryDetails(
            jsDocument.uri,
            item.data.offset,
            item.label,
            undefined,
            undefined,
            undefined,
            undefined
          );
          if (details) {
            item.detail = ts.displayPartsToString(details.displayParts);
            item.documentation = ts.displayPartsToString(details.documentation);
            delete item.data;
          }
        } finally {
          host.dispose();
        }
      }
      return item;
    },
    async findDefinition(document: TextDocument, position: Position): Promise<Definition | null> {
      const host = getHost(document);
      try {
        const jsDocument = getJsDocumentAtPosition(document, position);
        const jsLanguageService = await host.getLanguageService(jsDocument);
        const definition = jsLanguageService.getDefinitionAtPosition(jsDocument.uri, jsDocument.offsetAt(position));
        if (definition) {
          return definition.map((d) => {
            const defDoc = TextDocument.create(d.fileName, 'javascript', 1, readFileSync(d.fileName).toString());
            const range = convertRange(defDoc, d.textSpan);

            return {
              uri: d.fileName,
              range,
            };
          });
        }
        return null;
      } finally {
        host.dispose();
      }
    },
    dispose() {},
  };
}

export function getWordAtText(text: string, offset: number, wordDefinition: RegExp): { start: number; length: number } {
  let lineStart = offset;
  while (lineStart > 0 && !isNewlineCharacter(text.charCodeAt(lineStart - 1))) {
    lineStart--;
  }
  const offsetInLine = offset - lineStart;
  const lineText = text.substr(lineStart);

  // make a copy of the regex as to not keep the state
  const flags = wordDefinition.ignoreCase ? 'gi' : 'g';
  wordDefinition = new RegExp(wordDefinition.source, flags);

  let match = wordDefinition.exec(lineText);
  while (match && match.index + match[0].length < offsetInLine) {
    match = wordDefinition.exec(lineText);
  }
  if (match && match.index <= offsetInLine) {
    return { start: match.index + lineStart, length: match[0].length };
  }

  return { start: offset, length: 0 };
}

const enum Kind {
  alias = 'alias',
  callSignature = 'call',
  class = 'class',
  const = 'const',
  constructorImplementation = 'constructor',
  constructSignature = 'construct',
  directory = 'directory',
  enum = 'enum',
  enumMember = 'enum member',
  externalModuleName = 'external module name',
  function = 'function',
  indexSignature = 'index',
  interface = 'interface',
  keyword = 'keyword',
  let = 'let',
  localFunction = 'local function',
  localVariable = 'local var',
  method = 'method',
  memberGetAccessor = 'getter',
  memberSetAccessor = 'setter',
  memberVariable = 'property',
  module = 'module',
  primitiveType = 'primitive type',
  script = 'script',
  type = 'type',
  variable = 'var',
  warning = 'warning',
  string = 'string',
  parameter = 'parameter',
  typeParameter = 'type parameter',
}

function convertKind(kind: string): CompletionItemKind {
  switch (kind) {
    case Kind.primitiveType:
    case Kind.keyword:
      return CompletionItemKind.Keyword;

    case Kind.const:
    case Kind.let:
    case Kind.variable:
    case Kind.localVariable:
    case Kind.alias:
    case Kind.parameter:
      return CompletionItemKind.Variable;

    case Kind.memberVariable:
    case Kind.memberGetAccessor:
    case Kind.memberSetAccessor:
      return CompletionItemKind.Field;

    case Kind.function:
    case Kind.localFunction:
      return CompletionItemKind.Function;

    case Kind.method:
    case Kind.constructSignature:
    case Kind.callSignature:
    case Kind.indexSignature:
      return CompletionItemKind.Method;

    case Kind.enum:
      return CompletionItemKind.Enum;

    case Kind.enumMember:
      return CompletionItemKind.EnumMember;

    case Kind.module:
    case Kind.externalModuleName:
      return CompletionItemKind.Module;

    case Kind.class:
    case Kind.type:
      return CompletionItemKind.Class;

    case Kind.interface:
      return CompletionItemKind.Interface;

    case Kind.warning:
      return CompletionItemKind.Text;

    case Kind.script:
      return CompletionItemKind.File;

    case Kind.directory:
      return CompletionItemKind.Folder;

    case Kind.string:
      return CompletionItemKind.Constant;

    default:
      return CompletionItemKind.Property;
  }
}
