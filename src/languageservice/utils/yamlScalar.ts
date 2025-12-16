/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function toYamlStringScalar(s: string, preferSingleQuote = false): string {
  const quote = preferSingleQuote ? "'" : '"';

  // empty string
  if (s.length === 0) {
    return `${quote}${quote}`;
  }

  // single quote character
  if (s.length === 1 && s === '"') {
    return '"\\""';
  }

  // literal quote strings like "" or ''
  if (s.length === 2 && ((s[0] === '"' && s[1] === '"') || (s[0] === "'" && s[1] === "'"))) {
    return s[0] === '"' ? '"\\"\\""' : `"''"`;
  }

  // check if the string is already a properly quoted YAML string
  if (s.length >= 2) {
    const firstChar = s[0];
    const lastChar = s[s.length - 1];
    if ((firstChar === '"' && lastChar === '"') || (firstChar === "'" && lastChar === "'")) {
      return s;
    }
  }

  // unescape strings with double quotes if they were escaped
  if (s.indexOf('"') !== -1) {
    s = s.replace(/\\+"/g, '"');
  }

  // support YAML spec 1.1 boolean values and null
  if (/^(?:on|off|true|false|yes|no|null|~)$/i.test(s)) {
    return `${quote}${s}${quote}`;
  }

  // numeric values: integer/float, hex (0x), and octal (0o or YAML 1.1 style 0[0-7]+)
  if (
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s) ||
    /^0x[0-9a-fA-F]+$/.test(s) ||
    /^0o[0-7]+$/.test(s) ||
    /^0[0-7]+$/.test(s)
  ) {
    return `"${s}"`;
  }

  // leading/trailing whitespaces need quoting
  if (/^\s|\s$/.test(s)) {
    return preferSingleQuote ? `'${s.replace(/'/g, "''")}'` : JSON.stringify(s);
  }

  // comment indicator
  if (/(?:^|\s)#/.test(s)) {
    return preferSingleQuote ? `'${s.replace(/'/g, "''")}'` : JSON.stringify(s);
  }

  // reserved indicators that cannot start a plain scalar
  if (/^[\][{}#&*!|>'"%@`]/.test(s)) {
    return preferSingleQuote ? `'${s.replace(/'/g, "''")}'` : JSON.stringify(s);
  }

  // -, ?, or : followed by space or end
  if (/^[-?:](\s|$)/.test(s)) {
    return preferSingleQuote ? `'${s.replace(/'/g, "''")}'` : JSON.stringify(s);
  }

  // colon in middle (mapping key indicator)
  // e.g. `foo: bar` or `foo : bar` needs quoting, but `foo:bar` does not
  if (/(?:^|[^:]):(?:\s|$)/.test(s)) {
    return preferSingleQuote ? `'${s.replace(/'/g, "''")}'` : JSON.stringify(s);
  }

  // newlines or tabs or carriage return
  if (/[\r\n\t]/.test(s)) {
    return JSON.stringify(s);
  }

  return s;
}
