/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import {
  IPCMessageReader,
  IPCMessageWriter,
  createConnection,
  IConnection,
  TextDocumentSyncKind,
  TextDocument,
  InitializeResult,
} from 'vscode-languageserver';
import { xhr, XHRResponse, getErrorStatusDescription } from 'request-light';
import { getLanguageService, LanguageSettings, LanguageService } from '../../src/languageservice/yamlLanguageService';
import Strings = require('../../src/languageservice/utils/strings');
import { URI } from 'vscode-uri';
import {
  getLanguageService as getJSONLanguageService,
  LanguageService as JSONLanguageService,
} from 'vscode-json-languageservice';
import * as URL from 'url';
import fs = require('fs');
import path = require('path');

// Create a connection for the server.
let connection: IConnection = null;
if (process.argv.indexOf('--stdio') === -1) {
  connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
} else {
  connection = createConnection();
}

connection.onInitialize(
  (): InitializeResult => {
    return {
      capabilities: {
        // Tell the client that the server works in FULL text document sync mode
        textDocumentSync: TextDocumentSyncKind.Full,
        // Tell the client that the server support code complete
        completionProvider: {
          resolveProvider: false,
        },
      },
    };
  }
);

export const workspaceContext = {
  resolveRelativePath: (relativePath: string, resource: string): string => {
    return URL.resolve(resource, relativePath);
  },
};

export const schemaRequestService = (uri: string): Promise<string> => {
  if (Strings.startsWith(uri, 'file://')) {
    const fsPath = URI.parse(uri).fsPath;
    return new Promise<string>((c, e) => {
      fs.readFile(fsPath, 'UTF-8', (err, result) => {
        return err ? e('') : c(result.toString());
      });
    });
  }
  return xhr({ url: uri, followRedirects: 5 }).then(
    (response) => {
      return response.responseText;
    },
    (error: XHRResponse) => {
      return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
    }
  );
};

export function toFsPath(str: unknown): string {
  if (typeof str !== 'string') {
    throw new TypeError(`Expected a string, got ${typeof str}`);
  }

  let pathName;
  pathName = path.resolve(str);
  pathName = pathName.replace(/\\/g, '/');
  // Windows drive letter must be prefixed with a slash
  if (pathName[0] !== '/') {
    pathName = `/${pathName}`;
  }
  return encodeURI(`file://${pathName}`).replace(/[?#]/g, encodeURIComponent);
}

export function configureLanguageService(languageSettings: LanguageSettings): LanguageService {
  const languageService = getLanguageService(schemaRequestService, workspaceContext);

  languageService.configure(languageSettings);
  return languageService;
}

export function createJSONLanguageService(): JSONLanguageService {
  return getJSONLanguageService({
    schemaRequestService,
    workspaceContext,
  });
}

export const TEST_URI = 'file://~/Desktop/vscode-k8s/test.yaml';
export const SCHEMA_ID = 'default_schema_id.yaml';

export function setupTextDocument(content: string): TextDocument {
  return TextDocument.create(TEST_URI, 'yaml', 0, content);
}

export function setupSchemaIDTextDocument(content: string): TextDocument {
  return TextDocument.create(SCHEMA_ID, 'yaml', 0, content);
}
