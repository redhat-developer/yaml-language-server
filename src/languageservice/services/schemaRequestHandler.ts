import { join } from 'path';
import { getErrorStatusDescription, xhr } from 'request-light';
import * as URL from 'url';
import type { Connection, WorkspaceFolder } from 'vscode-languageserver';
import { RequestType } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { CustomSchemaContentRequest, VSCodeContentRequest } from '../../requestTypes';
import { isRelativePath, relativeToAbsolutePath } from '../utils/paths';
import type { WorkspaceContextService } from '../yamlLanguageService';

export interface FileSystem {
  readFile(fsPath: string, encoding?: string): Promise<string>;
}

/**
 * HTTP statuses that indicate a temporary condition, where an identical request may well succeed shortly afterwards.
 * Any other status is a settled answer and is never retried.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

/** Connection level failures that are worth another attempt. */
const RETRYABLE_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE', 'EAI_AGAIN']);

/** Number of additional attempts made after the initial request fails. */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff, in milliseconds. */
const BASE_RETRY_DELAY_MS = 200;

/**
 * Upper bound for a single delay, in milliseconds. Also caps `Retry-After`, which servers sometimes express in minutes.
 * Schema loading blocks validation, so waiting must never become noticeable while editing.
 */
const MAX_RETRY_DELAY_MS = 1000;

/** Overrides for the http(s) retry behaviour, intended for tests. */
export interface SchemaRequestRetryOptions {
  /** Additional attempts made after the initial request fails. Defaults to {@link MAX_RETRIES}. */
  maxRetries?: number;
  /** Injected by tests so backoff is not actually slept through. */
  delay?: (ms: number) => Promise<void>;
}

/**
 * Wait for the given period.
 * @param ms how long to wait, in milliseconds
 * @returns a promise resolved once the period has elapsed
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decide whether a failed `xhr` call is worth repeating.
 * @param error the rejection from `xhr`
 * @returns true when the failure looks temporary
 */
function isRetryableError(error: { status?: number; code?: string }): boolean {
  if (error?.code && RETRYABLE_ERROR_CODES.has(error.code)) {
    return true;
  }
  // request-light reports connection failures as status 0 or 404 with no real response, so only trust a status that is
  // explicitly retryable.
  return typeof error?.status === 'number' && RETRYABLE_STATUS_CODES.has(error.status);
}

/**
 * Parse a `Retry-After` header, which may be given either as a number of seconds or as an HTTP date.
 * @param headers the response headers, if any were returned
 * @param now the current time, against which an HTTP date is measured
 * @returns the delay in milliseconds, or undefined when the header is absent or unparseable
 */
function parseRetryAfter(headers: Record<string, string> | undefined, now: number): number | undefined {
  const value = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (!Number.isNaN(seconds)) {
    return seconds >= 0 ? seconds * 1000 : undefined;
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * Work out how long to wait before the next attempt. A server supplied `Retry-After` wins; otherwise back off
 * exponentially with jitter so that several schemas failing together do not retry in lockstep. Either way the
 * result is capped at {@link MAX_RETRY_DELAY_MS}.
 * @param error the rejection from `xhr`, which may carry a `Retry-After` header
 * @param attempt the zero based index of the attempt that just failed
 * @returns how long to wait, in milliseconds
 */
function getRetryDelay(error: { headers?: Record<string, string> }, attempt: number): number {
  const retryAfter = parseRetryAfter(error?.headers, Date.now());
  if (retryAfter !== undefined) {
    return Math.min(retryAfter, MAX_RETRY_DELAY_MS);
  }

  const backoff = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_RETRY_DELAY_MS;
  return Math.min(backoff + jitter, MAX_RETRY_DELAY_MS);
}

/**
 * Send an HTTP(S) schema request, retrying a bounded number of times when the failure looks temporary. A failure that
 * is not retryable, or one that exhausts the budget, is rethrown unchanged.
 * @param url the schema URL to request
 * @param headers headers to send with each attempt
 * @param options overrides for the retry behaviour, used by tests
 * @returns the schema content as a string
 */
async function requestSchemaWithRetry(
  url: string,
  headers: Record<string, string>,
  options: SchemaRequestRetryOptions = {}
): Promise<string> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const delay = options.delay ?? sleep;

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await xhr({ url, followRedirects: 5, headers });
      return response.responseText;
    } catch (error) {
      if (attempt >= maxRetries || !isRetryableError(error)) {
        throw error;
      }
      await delay(getRetryDelay(error, attempt));
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace FSReadUri {
  export const type: RequestType<string, string, unknown> = new RequestType('fs/readUri');
}

/**
 * Handles schema content requests given the schema URI
 * @param uri can be a local file, vscode request, http(s) request or a custom request
 * @param retryOptions overrides for http(s) retry behaviour, used by tests
 */
export const schemaRequestHandler = async (
  connection: Connection,
  uri: string,
  workspaceFolders: WorkspaceFolder[],
  workspaceRoot: URI,
  useVSCodeContentRequest: boolean,
  fs: FileSystem,
  isWeb: boolean,
  retryOptions?: SchemaRequestRetryOptions
): Promise<string> => {
  if (!uri) {
    return Promise.reject('No schema specified');
  }

  // If the requested schema URI is a relative file path
  // Convert it into a proper absolute path URI
  if (isRelativePath(uri)) {
    // HACK: the fs/readUri extension is only available with vscode-yaml,
    // and this fix is specific to vscode-yaml on web, so don't use it in other cases
    if (workspaceFolders.length === 1 && isWeb) {
      const wsUri = URI.parse(workspaceFolders[0].uri);
      const wsDirname = wsUri.path;
      const modifiedUri = wsUri.with({ path: join(wsDirname, uri) });
      try {
        return connection.sendRequest(FSReadUri.type, modifiedUri.toString());
      } catch (e) {
        connection.window.showErrorMessage(`failed to get content of '${modifiedUri}': ${e}`);
      }
    } else {
      uri = relativeToAbsolutePath(workspaceFolders, workspaceRoot, uri);
    }
  }

  let scheme = URI.parse(uri).scheme.toLowerCase();

  // test if uri is windows path, ie starts with 'c:\'
  if (/^[a-z]:[\\/]/i.test(uri)) {
    const winUri = URI.file(uri);
    scheme = winUri.scheme.toLowerCase();
    uri = winUri.toString();
  }

  // If the requested schema is a local file, read and return the file contents
  if (scheme === 'file') {
    const fsPath = URI.parse(uri).fsPath;

    return fs.readFile(fsPath, 'UTF-8').catch(() => {
      // If there was an error reading the file, return empty error message
      // Otherwise return the file contents as a string
      return '';
    });
  }

  // HTTP(S) requests are sent and the response result is either the schema content or an error
  if (scheme === 'http' || scheme === 'https') {
    // If we are running inside of VSCode we need to make a content request. This content request
    // will make it so that schemas behind VPN's will resolve correctly
    if (useVSCodeContentRequest) {
      try {
        return await connection.sendRequest(VSCodeContentRequest.type, uri);
      } catch (error) {
        throw error.message;
      }
    }

    // Send the HTTP(S) schema content request and return the result
    const version = (typeof process !== 'undefined' && process.env.YAML_LANGUAGE_SERVER_VERSION) || 'unknown';
    const nodeVersion = typeof process !== 'undefined' && process.versions?.node ? ` node/${process.versions.node}` : '';
    const platform = typeof process !== 'undefined' && process.platform ? ` (${process.platform})` : '';
    const headers = {
      'Accept-Encoding': 'gzip, deflate',
      'User-Agent': `yaml-language-server/${version} (RedHat)${nodeVersion}${platform}`,
    };
    try {
      return await requestSchemaWithRetry(uri, headers, retryOptions);
    } catch (error) {
      throw error.responseText || getErrorStatusDescription(error.status) || error.toString();
    }
  }

  // Neither local file nor vscode, nor HTTP(S) schema request, so send it off as a custom request
  return connection.sendRequest(CustomSchemaContentRequest.type, uri) as Promise<string>;
};

export const workspaceContext: WorkspaceContextService = {
  resolveRelativePath: (relativePath: string, resource: string) => {
    return URL.resolve(resource, relativePath);
  },
};
