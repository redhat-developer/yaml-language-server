/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Length-preserving masking of Go-template expressions so that templated
 * documents (Helm charts) parse as plain YAML.
 *
 * Every replacement has exactly the same length as the original span and
 * newlines are never touched, so all document offsets survive and no
 * position translation is needed anywhere downstream.
 *
 * Rules:
 * - A line whose content is only template expressions (plus whitespace)
 *   becomes a comment of identical length. Control-flow lines such as
 *   `{{- if .Values.enabled }}` and `{{- end }}` drop out of the document
 *   structure entirely.
 * - An inline expression after other content (`foo: {{ .Values.name }}`)
 *   is replaced by an unquoted filler scalar of identical length, so the
 *   value parses as a plain string.
 * - A template span crossing line boundaries is masked on every line it
 *   covers, each line classified by the rules above.
 * - Expressions inside quotes are already valid YAML; masking them keeps
 *   the value a string of the same length, so the parse result class is
 *   unchanged and the function stays context-free.
 */

/** Which template dialect to mask. `none` disables masking entirely. */
export type TemplateMode = 'none' | 'helm';

/** Matches a template span, including across line boundaries; an unclosed
 *  span is masked to the end of its line. */
const TEMPLATE_SPAN = /\{\{[\s\S]*?\}\}|\{\{[^\n]*$/gm;

/** Filler character for inline expressions. Parses as a plain scalar. */
const INLINE_FILL = 'x';

/** Internal sentinel; NUL cannot appear in an LSP document's text. */
const SENTINEL = '\u0000';

/**
 * Mask Go-template expressions in `text`, preserving length and line
 * structure exactly. Returns the input unchanged when it contains no
 * template expression.
 */
export function maskTemplates(text: string): string {
  if (!text.includes('{{')) {
    return text;
  }

  // Pass 1: replace every character of every template span with a
  // sentinel, preserving newlines, so pass 2 can classify lines.
  const masked = text.replace(TEMPLATE_SPAN, (m) => m.replace(/[^\n]/g, SENTINEL));

  // Pass 2: per line, decide comment-out vs inline filler.
  const lines = masked.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(SENTINEL)) {
      continue;
    }
    if (line.split(SENTINEL).join('').trim().length === 0) {
      // Template-only line: comment it out at the first non-space column,
      // preserving both indentation and total length.
      const indent = line.match(/^[ \t]*/)[0].length;
      lines[i] = line.slice(0, indent) + '#' + ' '.repeat(Math.max(0, line.length - indent - 1));
    } else {
      // Inline expression: same-length filler scalar.
      lines[i] = line.split(SENTINEL).join(INLINE_FILL);
    }
  }
  return lines.join('\n');
}
