import { URI } from 'vscode-uri';
import { IConnection } from 'vscode-languageserver';
import { xhr, XHRResponse, getErrorStatusDescription } from 'request-light';
import * as fs from 'fs';

import { VSCodeContentRequest, CustomSchemaContentRequest } from '../../requestTypes';
import { isRelativePath, relativeToAbsolutePath } from '../utils/paths';

/**
 * Handles schema content requests given the schema URI
 * @param uri can be a local file, vscode request, http(s) request or a custom request
 */
export const schemaRequestHandler = (connection: IConnection, uri: string): Thenable<string> => {
  if (!uri) {
    return Promise.reject('No schema specified');
  }

  // If the requested schema URI is a relative file path
  // Convert it into a proper absolute path URI
  if (isRelativePath(uri)) {
    uri = relativeToAbsolutePath(this.workspaceFolders, this.workspaceRoot, uri);
  }

  const scheme = URI.parse(uri).scheme.toLowerCase();

  // If the requested schema is a local file, read and return the file contents
  if (scheme === 'file') {
    const fsPath = URI.parse(uri).fsPath;

    return new Promise<string>((c, e) => {
      fs.readFile(fsPath, 'UTF-8', (err, result) =>
        // If there was an error reading the file, return empty error message
        // Otherwise return the file contents as a string
        {
          return err ? e('') : c(result.toString());
        }
      );
    });
  }

  // vscode schema content requests are forwarded to the client through LSP
  // This is a non-standard LSP extension introduced by the JSON language server
  // See https://github.com/microsoft/vscode/blob/master/extensions/json-language-features/server/README.md
  if (scheme === 'vscode') {
    return connection.sendRequest(VSCodeContentRequest.type, uri).then(
      (responseText) => {
        return responseText;
      },
      (error) => {
        return error.message;
      }
    );
  }

  // HTTP(S) requests are sent and the response result is either the schema content or an error
  if (scheme === 'http' || scheme === 'https') {
    // Send the HTTP(S) schema content request and return the result
    const headers = { 'Accept-Encoding': 'gzip, deflate' };
    return xhr({ url: uri, followRedirects: 5, headers }).then(
      (response) => {
        return response.responseText;
      },
      (error: XHRResponse) => {
        return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
      }
    );
  }

  // Neither local file nor vscode, nor HTTP(S) schema request, so send it off as a custom request
  return connection.sendRequest(CustomSchemaContentRequest.type, uri) as Thenable<string>;
};
