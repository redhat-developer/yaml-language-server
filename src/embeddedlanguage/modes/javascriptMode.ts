import * as ts from 'typescript';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { yamlDocumentsCache } from '../../languageservice/parser/yaml-documents';
import { matchOffsetToDocument } from '../../languageservice/utils/arrUtils';
import { getLanguageModelCache } from '../languageModelCache';
import { CompletionItemKind, CompletionList, LanguageMode, Range, TextEdit, Workspace } from './languageModes';
import { join, resolve, dirname } from 'path';
import { existsSync } from 'fs';

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

const append = (result: string, str: string, n: number): string => {
  while (n > 0) {
    if (n & 1) {
      result += str;
    }
    n >>= 1;
    str += str;
  }
  return result;
};

const substituteWithWhitespace = (
  result: string,
  start: number,
  end: number,
  oldContent: string,
  before: string,
  after: string
): string => {
  result += before;
  let accumulatedWS = -before.length; // start with a negative value to account for the before string
  for (let i = start; i < end; i++) {
    const ch = oldContent[i];
    if (ch === '\n' || ch === '\r') {
      // only write new lines, skip the whitespace
      accumulatedWS = 0;
      result += ch;
    } else {
      accumulatedWS++;
    }
  }
  result = append(result, ' ', accumulatedWS - after.length);
  result += after;
  return result;
};

interface LanguageServiceHost {
  getLanguageService(jsDocument: TextDocument): Promise<ts.LanguageService>;
  getCompilationSettings(): ts.CompilerOptions;
  dispose(): void;
}

function getLanguageServiceHost(scriptKind: ts.ScriptKind, document: TextDocument, workspace: Workspace): LanguageServiceHost {
  const compilerOptions: ts.CompilerOptions = {
    allowNonTsExtensions: true,
    allowJs: true,
    lib: ['lib.esnext.full.d.ts', './global.d.ts'],
    target: ts.ScriptTarget.Latest,
    moduleResolution: ts.ModuleResolutionKind.Classic,
    experimentalDecorators: false,
    rootDir: workspace.root,
    baseUrl: '.',
  };

  // TODO: find a way to load $rootVars, $rootProps, $rootSlots, $rootStore, $router, $router and EB.* ...

  let currentTextDocument = TextDocument.create('init', 'javascript', 1, '');
  const jsLanguageService = import('./javascriptLibs').then((libs) => {
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
        if (fileName === currentTextDocument.uri) {
          return String(currentTextDocument.version);
        }
        return '1';
      },
      getScriptSnapshot: (fileName: string) => {
        let text = '';
        if (fileName === currentTextDocument.uri) {
          text = currentTextDocument.getText();
        } else {
          text = libs.loadLibrary(fileName, workspace.root);
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
        } else {
          return libs.loadLibrary(path, workspace.root);
        }
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
        if (path === currentTextDocument.uri) {
          return true;
        } else {
          return !!libs.loadLibrary(path, workspace.root);
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
    return ts.createLanguageService(host);
  });
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

  return TextDocument.create(document.uri, 'javascript', document.version, content);
};

export function getJavaScriptMode(languageId: string, workspace: Workspace): LanguageMode {
  // const languageServiceHostCache = getLanguageModelCache<LanguageServiceHost>(10, 60, (document) =>
  //   getLanguageServiceHost(ts.ScriptKind.JS, document)
  // );

  return {
    getId() {
      return languageId;
    },
    async doComplete(document: TextDocument, position: Position): Promise<CompletionList> {
      // const host = languageServiceHostCache.get(document);
      const host = getLanguageServiceHost(ts.ScriptKind.JS, document, workspace);
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
          return {
            uri: document.uri,
            position: position,
            label: entry.name,
            sortText: entry.sortText,
            kind: convertKind(entry.kind),
            textEdit: TextEdit.replace(replaceRange, entry.name),
          };
        }),
      };
    },
    dispose() {
      // languageServiceHostCache.dispose();
    },
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
