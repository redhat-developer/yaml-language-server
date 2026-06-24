/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Forked from vscode-json-languageservice@6.0.0-next.1
// Source: https://github.com/microsoft/vscode-json-languageservice/blob/810471bbb462bb6b87351c2232e209a3bb4062ca/src/jsonLanguageTypes.ts

import type { FormattingOptions as LSPFormattingOptions } from 'vscode-languageserver-types';
import type { Node, Pair } from 'yaml';

import type { CustomTagReturnType } from './utils/customTags';

import { TextDocument, TextDocumentContentChangeEvent } from 'vscode-languageserver-textdocument';
import {
  CodeAction,
  CodeActionContext,
  CodeActionKind,
  Color,
  ColorInformation,
  ColorPresentation,
  Command,
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  CompletionList,
  DefinitionLink,
  Diagnostic,
  DiagnosticSeverity,
  DocumentHighlight,
  DocumentHighlightKind,
  DocumentLink,
  DocumentSymbol,
  DocumentUri,
  FoldingRange,
  FoldingRangeKind,
  Hover,
  InsertTextFormat,
  Location,
  MarkedString,
  MarkupContent,
  MarkupKind,
  Position,
  Range,
  SelectionRange,
  SymbolInformation,
  SymbolKind,
  TextDocumentEdit,
  TextEdit,
  VersionedTextDocumentIdentifier,
  WorkspaceEdit,
} from 'vscode-languageserver-types';

import { JSONSchema } from './jsonSchema';

export {
  TextDocument,
  TextDocumentContentChangeEvent,
  Range,
  Position,
  DocumentUri,
  MarkupContent,
  MarkupKind,
  JSONSchema,
  Color,
  ColorInformation,
  ColorPresentation,
  FoldingRange,
  FoldingRangeKind,
  SelectionRange,
  Diagnostic,
  DiagnosticSeverity,
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  CompletionItemTag,
  InsertTextFormat,
  DefinitionLink,
  SymbolInformation,
  SymbolKind,
  DocumentSymbol,
  Location,
  Hover,
  MarkedString,
  CodeActionContext,
  Command,
  CodeAction,
  DocumentHighlight,
  DocumentLink,
  WorkspaceEdit,
  TextEdit,
  CodeActionKind,
  TextDocumentEdit,
  VersionedTextDocumentIdentifier,
  DocumentHighlightKind,
};
/**
 * Error codes used by diagnostics
 */
export enum ErrorCode {
  Undefined = 0,
  EnumValueMismatch = 1,
  Deprecated = 2,
  UnexpectedEndOfComment = 257,
  UnexpectedEndOfString = 258,
  UnexpectedEndOfNumber = 259,
  InvalidUnicode = 260,
  InvalidEscapeCharacter = 261,
  InvalidCharacter = 262,
  PropertyExpected = 513,
  CommaExpected = 514,
  ColonExpected = 515,
  ValueExpected = 516,
  CommaOrCloseBacketExpected = 517,
  CommaOrCloseBraceExpected = 518,
  TrailingComma = 519,
  DuplicateKey = 520,
  CommentNotPermitted = 521,
  PropertyKeysMustBeDoublequoted = 528,
  SchemaUnsupportedFeature = 769,
  SchemaResolveError = 65536,
}
export function isSchemaResolveError(code: number): boolean {
  return code >= ErrorCode.SchemaResolveError;
}
export type YamlNode = Node | Pair;
export type ASTNode =
  | ObjectASTNode
  | PropertyASTNode
  | ArrayASTNode
  | StringASTNode
  | NumberASTNode
  | BooleanASTNode
  | NullASTNode;
export interface BaseASTNode {
  readonly type: 'object' | 'array' | 'property' | 'string' | 'number' | 'boolean' | 'null';
  readonly parent?: ASTNode;
  readonly offset: number;
  readonly length: number;
  readonly children?: ASTNode[];
  readonly value?: string | boolean | number | null;
  readonly internalNode: YamlNode;
  location: string;
  customTagReturnType?: CustomTagReturnType;
  getNodeFromOffsetEndInclusive(offset: number): ASTNode;
}
export interface ObjectASTNode extends BaseASTNode {
  readonly type: 'object';
  readonly properties: PropertyASTNode[];
  readonly children: ASTNode[];
}
export interface PropertyASTNode extends BaseASTNode {
  readonly type: 'property';
  readonly keyNode: StringASTNode;
  readonly valueNode?: ASTNode;
  readonly colonOffset?: number;
  readonly children: ASTNode[];
}
export interface ArrayASTNode extends BaseASTNode {
  readonly type: 'array';
  readonly items: ASTNode[];
  readonly children: ASTNode[];
}
export interface StringASTNode extends BaseASTNode {
  readonly type: 'string';
  readonly value: string;
}
export interface NumberASTNode extends BaseASTNode {
  readonly type: 'number';
  readonly value: number;
  readonly isInteger: boolean;
}
export interface BooleanASTNode extends BaseASTNode {
  readonly type: 'boolean';
  readonly value: boolean;
  readonly source: string;
}
export interface NullASTNode extends BaseASTNode {
  readonly type: 'null';
  readonly value: null;
}

export interface MatchingSchema {
  node: ASTNode;
  schema: JSONSchema;
}
export interface JSONLanguageStatus {
  schemas: string[];
}
export interface LanguageSettings {
  /**
   * If set, the validator will return syntax and semantic errors.
   */
  validate?: boolean;
  /**
   * Defines whether comments are allowed or not. If set to false, comments will be reported as errors.
   * DocumentLanguageSettings.allowComments will override this setting.
   */
  allowComments?: boolean;
  /**
   * A list of known schemas and/or associations of schemas to file names.
   */
  schemas?: SchemaConfiguration[];
}
export type SeverityLevel = 'error' | 'warning' | 'ignore';
export enum SchemaDraft {
  v3 = 3,
  v4 = 4,
  v6 = 6,
  v7 = 7,
  v2019_09 = 19,
  v2020_12 = 20,
}
export interface DocumentLanguageSettings {
  /**
   * The severity of reported comments. If not set, 'LanguageSettings.allowComments' defines whether comments are ignored or reported as errors.
   */
  comments?: SeverityLevel;
  /**
   * The severity of reported trailing commas. If not set, trailing commas will be reported as errors.
   */
  trailingCommas?: SeverityLevel;
  /**
   * The severity of problems from schema validation. If set to 'ignore', schema validation will be skipped. If not set, 'warning' is used.
   */
  schemaValidation?: SeverityLevel;
  /**
   * The severity of problems that occurred when resolving and loading schemas. If set to 'ignore', schema resolving problems are not reported. If not set, 'warning' is used.
   */
  schemaRequest?: SeverityLevel;
  /**
   * The draft version of schema to use if the schema doesn't specify one at $schema
   */
  schemaDraft?: SchemaDraft;
}
export interface SchemaConfiguration {
  /**
   * The URI of the schema, which is also the identifier of the schema.
   */
  uri: string;
  /**
   * A list of glob patterns that describe for which file URIs the JSON schema will be used.
   * '*' and '**' wildcards are supported. Exclusion patterns start with '!'.
   * For example '*.schema.json', 'package.json', '!foo*.schema.json', 'foo/**\/BADRESP.json'.
   * A match succeeds when there is at least one pattern matching and last matching pattern does not start with '!'.
   */
  fileMatch?: string[];
  /**
   * The schema for the given URI.
   * If no schema is provided, the schema will be fetched with the schema request service (if available).
   */
  schema?: JSONSchema;
  /**
   * A parent folder for folder specifc associations. An association that has a folder URI set is only used
   * if the document that is validated has the folderUri as parent
   */
  folderUri?: string;
}
export interface WorkspaceContextService {
  resolveRelativePath(relativePath: string, resource: string): string;
}
/**
 * The schema request service is used to fetch schemas. If successful, returns a resolved promise with the content of the schema.
 * In case of an error, returns a rejected promise with an Error object. If the type is of form { message: string, code: number }, the
 * error code will be used for diagnostics.
 */
export interface SchemaRequestService {
  (uri: string): PromiseLike<string>;
}
export interface PromiseConstructor {
  /**
   * Creates a new Promise.
   * @param executor A callback used to initialize the promise. This callback is passed two arguments:
   * a resolve callback used resolve the promise with a value or the result of another promise,
   * and a reject callback used to reject the promise with a provided reason or error.
   */
  new <T>(
    executor: (resolve: (value?: T | PromiseLike<T | undefined>) => void, reject: (reason?: unknown) => void) => void
  ): PromiseLike<T | undefined>;
  /**
   * Creates a Promise that is resolved with an array of results when all of the provided Promises
   * resolve, or rejected when any Promise is rejected.
   * @param values An array of Promises.
   * @returns A new Promise.
   */
  all<T>(values: Array<T | PromiseLike<T>>): PromiseLike<T[]>;
  /**
   * Creates a new rejected promise for the provided reason.
   * @param reason The reason the promise was rejected.
   * @returns A new rejected Promise.
   */
  reject<T>(reason: unknown): PromiseLike<T>;
  /**
   * Creates a new resolved promise for the provided value.
   * @param value A promise.
   * @returns A promise whose internal state matches the provided promise.
   */
  resolve<T>(value: T | PromiseLike<T>): PromiseLike<T>;
}
export interface LanguageServiceParams {
  /**
   * The schema request service is used to fetch schemas from a URI. The provider returns the schema file content, or,
   * in case of an error, a displayable error string
   */
  schemaRequestService?: SchemaRequestService;
  /**
   * The workspace context is used to resolve relative paths for relative schema references.
   */
  workspaceContext?: WorkspaceContextService;
  /**
   * A promise constructor. If not set, the ES5 Promise will be used.
   */
  promiseConstructor?: PromiseConstructor;
  /**
   * Describes the LSP capabilities the client supports.
   */
  clientCapabilities?: ClientCapabilities;
}
/**
 * Describes what LSP capabilities the client supports
 */
export interface ClientCapabilities {
  /**
   * The text document client capabilities
   */
  textDocument?: {
    /**
     * Capabilities specific to completions.
     */
    completion?: {
      /**
       * The client supports the following `CompletionItem` specific
       * capabilities.
       */
      completionItem?: {
        /**
         * Client supports the follow content formats for the documentation
         * property. The order describes the preferred format of the client.
         */
        documentationFormat?: MarkupKind[];
        /**
         * The client supports commit characters on a completion item.
         */
        commitCharactersSupport?: boolean;
        /**
         * The client has support for completion item label
         * details (see also `CompletionItemLabelDetails`).
         */
        labelDetailsSupport?: boolean;
      };
    };
    /**
     * Capabilities specific to hovers.
     */
    hover?: {
      /**
       * Client supports the follow content formats for the content
       * property. The order describes the preferred format of the client.
       */
      contentFormat?: MarkupKind[];
    };
  };
}
export const ClientCapabilities: { LATEST: ClientCapabilities } = {
  LATEST: {
    textDocument: {
      completion: {
        completionItem: {
          documentationFormat: [MarkupKind.Markdown, MarkupKind.PlainText],
          commitCharactersSupport: true,
          labelDetailsSupport: true,
        },
      },
    },
  },
};
export interface FoldingRangesContext {
  /**
   * The maximal number of ranges returned.
   */
  rangeLimit?: number;
  /**
   * Called when the result was cropped.
   */
  onRangeLimitExceeded?: (uri: string) => void;
}
export interface DocumentSymbolsContext {
  /**
   * The maximal number of document symbols returned.
   */
  resultLimit?: number;
  /**
   * Called when the result was cropped.
   */
  onResultLimitExceeded?: (uri: string) => void;
}
export interface ColorInformationContext {
  /**
   * The maximal number of color informations returned.
   */
  resultLimit?: number;
  /**
   * Called when the result was cropped.
   */
  onResultLimitExceeded?: (uri: string) => void;
}
export interface FormattingOptions extends LSPFormattingOptions {
  insertFinalNewline?: boolean;
  keepLines?: boolean;
}
export interface SortOptions extends LSPFormattingOptions {
  insertFinalNewline?: boolean;
}
