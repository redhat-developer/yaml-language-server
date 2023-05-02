/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable no-useless-escape */
import { JSONSchema, JSONSchemaRef } from '../../jsonSchema';
import { Globals } from './globals';

export class Utils {
  static readonly mdFilePath = './docs/components/{0}/';
  static readonly navigationPath = '/docs/components/{0}/';
  static readonly sidebarPath = 'components/{0}/';

  public static SchemaPathConfig: { reg: RegExp; folder: string }[] = [
    { reg: /^ja\-/, folder: 'actions' },
    { reg: /^jc\-/, folder: 'UI' },
    { reg: /^jw\-/, folder: 'Widgets' },
    { reg: /^jd\-/, folder: 'Data' },
    { reg: /^icon-name/, folder: 'UI' },
    { reg: /^chart-shared/, folder: 'UI' },
    { reg: /^format-number/, folder: 'UI' },
    { reg: /^keg-content/, folder: 'UI' },
    { reg: /^jl-container/, folder: 'UI' },
    // { reg: /^jc-form/, folder: 'UI' }, //for test
  ];
}

/**
 *
 * @param componentIdName could be format: "@jigx/jc-list" or jc-list
 */
export function getFileInfo(
  componentIdName: string
): {
  componentId: string;
  category: string;
  filePath: string;
  sidebarPath: string;
  navigationPath: string;
} {
  const componentNameWithoutJigx = componentIdName.replace(Globals.ComponentPrefix, '');
  const schemaConfig = Utils.SchemaPathConfig.find((s) => s.reg.test(componentNameWithoutJigx));
  let componentId = componentIdName.startsWith(Globals.ComponentPrefix)
    ? componentIdName
    : Globals.ComponentPrefix + componentIdName;
  componentId = componentId.replace('@', '').replace('/', '_');
  console.log(`componentId ${componentIdName}`);
  if (!schemaConfig) {
    console.log(`componentId ${componentIdName} not found in SchemaPathConfig.`);
    const category = 'toBeDone';
    return {
      componentId: componentId,
      category: category,
      filePath: stringFormat(Utils.mdFilePath, category),
      sidebarPath: stringFormat(Utils.sidebarPath, category),
      navigationPath: stringFormat(Utils.navigationPath, category),
    };
  }
  return {
    componentId: componentId,
    category: schemaConfig.folder,
    filePath: stringFormat(Utils.mdFilePath, schemaConfig.folder),
    sidebarPath: stringFormat(Utils.sidebarPath, schemaConfig.folder),
    navigationPath: stringFormat(Utils.navigationPath, schemaConfig.folder),
  };
}

export interface Instantiable {
  initialize?: () => void;
}
export function createInstance<T extends Instantiable>(type: { new (): T }, initObj: any, initObj2: any = {}): T {
  let obj: T = new type();
  obj = Object.assign(obj, initObj, initObj2) as T;
  if (obj.initialize) {
    obj.initialize();
  }
  return obj;
}

/**
 * ensure that input initObj is real instance created by new T(), not only simple object {}.
 * ensured instance is returned.
 * if initObj is instance of T do nothing.
 * if initObj is simple object {}, create new instance base on T and copy properties.
 * @param type
 * @param initObj
 */
export function ensureInstance<T>(type: { new (): T }, initObj: any): T {
  let obj: T;
  if (initObj instanceof type) {
    return initObj;
  } else {
    obj = new type();
    obj = Object.assign(obj, initObj) as T;
    return obj;
  }
}

/**
 * Escape special chars for markdown
 * @param {string} sectionTitle ex: `### badge (number | null)`
 */
export function translateSectionTitleToLinkHeder(sectionTitle: string): string {
  const linkHeader = sectionTitle
    .replace(/^#* /, '') //ensure only one #
    .replace(/[^a-zA-Z0-9_ \-]/g, '') //remove special chars
    .replace(/ /g, '-') //replace space by -
    .toLowerCase();
  return '#' + linkHeader;
}

export function isEmptyObject(obj: any): boolean {
  if (!obj) {
    return true;
  }
  return Object.entries(obj).length === 0 && obj.constructor === Object;
}

export function replaceSpecialCharsInDescription(text: string): string {
  //copied from https://github.com/severinkaderli/markdown-escape/blob/master/index.js
  const map: any = {
    // '*': '\\*',
    '#': '\\#',
    // '(': '\\(',
    // ')': '\\)',
    // '[': '\\[',
    // ']': '\\]',
    _: '\\_',
    '\\': '\\\\',
    // '+': '\\+',
    // '-': '\\-',
    // '`': '\\`',
    // '<': '&lt;',
    // '>': '&gt;',
    '&': '&amp;',
    '|': '&#124;',
    '\n': '<br />',
  };
  // I want to support MD syntax in description
  // const ret = text.replace(/[\|\*\(\)\[\]\+\-\\_`#<>\n]/g, (m) => map[m]);
  const ret = text.replace(/<br \/>\n/g, '<br />').replace(/[\|\\_#\n]/g, (m) => map[m]);
  return ret;
}

/**
 * Replace elements in string by object properties.
 * @param str String with replaceable elements: {example1}, {example2}
 * @param dict Object with key and values, where keys are search pattern and their values are replace string.
 * @param keyPattern Patter that is used inside the files for replace. Recommended values: ```'{{0}}' | ':{0}' | '_{0}_' | '={0}='```
 */
export function replace(str: string, dict: { [prop: string]: any }, regexFlag = 'g', keyPattern = '{{0}}'): string {
  if (!str) {
    return str;
  }
  Object.keys(dict)
    .sort((a, b) => (a.length > b.length ? -1 : 1))
    .forEach((d) => {
      const key = keyPattern.replace('{0}', d);
      const regexpKey = new RegExp(key, regexFlag);
      const val = dict[d] !== undefined ? dict[d] : '';
      str = str.replace(regexpKey, val);
    });
  return str;
}

// export const tableColumnSeparator = ' &#124; ';
// export const char_lt = '&#60;';
// export const char_gt = '&#62;';
export const tableColumnSeparator = ' &#124; ';
export const char_lt = '&#60;';
export const char_gt = '&#62;';

export function replaceSpecialToCodeBlock(strWithSpecials: string): string {
  const map: any = {
    '&#124;': '|',
    '&#60;': '<',
    '&#62;': '>',
  };
  return strWithSpecials.replace(/&#60;|&#124;|&#62;/g, (m) => map[m]);
}

export function toTsBlock(code: string, offset = 0): string {
  // don't put offset to ts, the tab '>' is added later
  const offsetStr = '\n' + ' '.repeat(offset);
  // ```ts doesn't look very well with custom titles
  return '```' + offsetStr + replaceSpecialToCodeBlock(code).replace(/\n/g, offsetStr) + '\n```';
}

export function toCodeSingleLine(code: string): string {
  const map: any = {
    '&#124;': '\\|',
    '&#60;': '<',
    '&#62;': '>',
  };
  code = code.replace(/&#60;|&#124;|&#62;/g, (m) => map[m]);
  return `\`${code}\``;
}

export function stringFormat(str: string, ...params: string[]): string {
  const args = params; //arguments;
  return str.replace(/{(\d+)}/g, function (match, number) {
    return typeof args[number] != 'undefined' ? args[number] : match;
  });
}

/**
 * &emsp; = 4 * &nbsp;
 * &ensp; = 2 * &nbsp;
 */
export function simplifyNbsp(str: string): string {
  return str.replace(/&nbsp;&nbsp;&nbsp;&nbsp;/g, '&emsp;').replace(/&nbsp;&nbsp;/g, '&ensp;');
}

/**
 *
 * @param indent 2 is root
 * @returns
 */
export function getIndent(indent: number, useSpace = false): string {
  if (useSpace) {
    return simplifyNbsp('&nbsp;'.repeat(indent - 1));
  }
  return '>'.repeat(indent - 2);
}

export function getDescription(schema: { description?: string; markdownDescription?: string }): string {
  if (schema.markdownDescription) {
    return replaceSpecialCharsInDescription(schema.markdownDescription);
  }
  if (schema.description) {
    return replaceSpecialCharsInDescription(schema.description);
  }
  return '';
}

export function isJSONSchema(schema: JSONSchemaRef): schema is JSONSchema {
  return schema && typeof schema === 'object';
}
