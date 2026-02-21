/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pattern that matches a `# yaml-lint-disable` comment.
 *
 * Usage in YAML files:
 *
 *   - `# yaml-lint-disable` - suppress ALL diagnostics on the next line
 *   - `# yaml-lint-disable Incorrect type` - suppress diagnostics whose message contains "Incorrect type"
 *   - `# yaml-lint-disable Incorrect type, not accepted` - suppress diagnostics matching any of the substrings
 *
 * Capture group 1 (optional) contains the comma-separated list of message
 * substrings to match against. If absent, all diagnostics are suppressed.
 */
export const YAML_LINT_DISABLE_PATTERN = /^\s*#\s*yaml-lint-disable\b(.*)$/;

/**
 * A callback that returns the text content of a given zero-based line number,
 * or `undefined` if the line does not exist.
 */
export type GetLineText = (line: number) => string | undefined;

/**
 * Parse the text after `yaml-lint-disable` into an array of trimmed,
 * lower-cased message substrings.  Returns an empty array when no
 * specifiers are provided (meaning "suppress all").
 */
export function parseDisableSpecifiers(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Determine whether a diagnostic should be suppressed based on the
 * specifiers from a `# yaml-lint-disable` comment.
 *
 * @param specifiers - Parsed specifiers (empty means suppress all).
 * @param diagnosticMessage - The diagnostic's message text.
 * @returns `true` if the diagnostic should be suppressed.
 */
export function shouldSuppressDiagnostic(specifiers: string[], diagnosticMessage: string): boolean {
  if (specifiers.length === 0) {
    return true;
  }
  const lowerMessage = diagnosticMessage.toLowerCase();
  return specifiers.some((spec) => lowerMessage.includes(spec));
}

/**
 * Filters an array of diagnostics, removing any whose starting line is
 * immediately preceded by a `# yaml-lint-disable` comment.
 *
 * When the comment includes one or more comma-separated message substrings,
 * only diagnostics whose message contains at least one of those substrings
 * (case-insensitive) are suppressed.  Without specifiers, all diagnostics
 * on the next line are suppressed.
 *
 * @param diagnostics - The diagnostics to filter.
 * @param getStartLine - Extracts the zero-based starting line number from a diagnostic.
 * @param getMessage - Extracts the message string from a diagnostic.
 * @param getLineText - Returns the text of a document line by its zero-based index,
 *   or `undefined` if the line is out of range.
 * @returns A new array containing only the diagnostics that are not suppressed.
 */
export function filterSuppressedDiagnostics<T>(
  diagnostics: T[],
  getStartLine: (diag: T) => number,
  getMessage: (diag: T) => string,
  getLineText: GetLineText
): T[] {
  return diagnostics.filter((diag) => {
    const line = getStartLine(diag);
    if (line === 0) {
      return true;
    }
    const prevLineText = getLineText(line - 1);
    if (prevLineText === undefined) {
      return true;
    }
    const match = YAML_LINT_DISABLE_PATTERN.exec(prevLineText);
    if (!match) {
      return true;
    }
    const specifiers = parseDisableSpecifiers(match[1]);
    return !shouldSuppressDiagnostic(specifiers, getMessage(diag));
  });
}
