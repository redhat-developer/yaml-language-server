/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable no-useless-escape */
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
): { componentId: string; category: string; filePath: string; sidebarPath: string; navigationPath: string } {
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
      filePath: Utils.mdFilePath.format(category),
      sidebarPath: Utils.sidebarPath.format(category),
      navigationPath: Utils.navigationPath.format(category),
    };
  }
  return {
    componentId: componentId,
    category: schemaConfig.folder,
    filePath: Utils.mdFilePath.format(schemaConfig.folder),
    sidebarPath: Utils.sidebarPath.format(schemaConfig.folder),
    navigationPath: Utils.navigationPath.format(schemaConfig.folder),
  };
}

// eslint-disable-next-line prettier/prettier
export function createInstance<T>(type: { new(): T }, initObj: any, initObj2: any = {}): T {
  let obj: T = new type();
  obj = Object.assign(obj, initObj, initObj2) as T;
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
// eslint-disable-next-line prettier/prettier
export function ensureInstance<T>(type: { new(): T }, initObj: any): T {
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
 * Get type name from reference url
 * @param $ref reference to the same file OR to the anoher component OR to the section in another component
 */
export function getSchemaRefTypeTitle($ref: string): string {
  const match = $ref.match(/schemas\/([a-z\-A-Z]+).schema.json/);
  const type = (match && match[1]) || '';
  return type;
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
    '*': '\\*',
    '#': '\\#',
    '(': '\\(',
    ')': '\\)',
    '[': '\\[',
    ']': '\\]',
    _: '\\_',
    '\\': '\\\\',
    '+': '\\+',
    '-': '\\-',
    '`': '\\`',
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '|': '&#124;',
    '\n': '<br />',
  };
  const ret = text.replace(/[\|\*\(\)\[\]\+\-\\_`#<>\n]/g, (m) => map[m]);
  //text.replace(/\n/g, '<br />');
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
  const offsetStr = '\n' + new Array(offset).join(' ');
  return '\n```ts' + offsetStr + replaceSpecialToCodeBlock(code).replace(/\n/g, offsetStr) + '\n```\n';
}

export function toCodeSingleLine(code: string): string {
  return `\`${replaceSpecialToCodeBlock(code)}\``;
}
