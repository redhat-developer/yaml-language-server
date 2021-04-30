import { filterInvalidCustomTags } from './arrUtils';
import { ErrorCode } from 'vscode-json-languageservice/lib/umd/jsonLanguageTypes';
import { Tags, isSeq, isMap, YAMLMap, YAMLSeq } from 'yaml';

export const DUPLICATE_KEY_REASON = 'duplicate key';

/**
 * An individual YAML diagnostic,
 * after formatting.
 */
export interface YAMLDocDiagnostic {
  message: string;
  location: {
    start: number;
    end: number;
    toLineEnd: boolean;
  };
  severity: 1 | 2;
  source?: string;
  code: ErrorCode;
}

class CommonTagImpl {
  public tag: string;
  public readonly type: string;
  default: never;
  constructor(tag: string, type: string) {
    this.tag = tag;
    this.type = type;
  }
  get collection(): 'map' | 'seq' | never {
    if (this.type === 'mapping') {
      return 'map';
    }
    if (this.type === 'sequence') {
      return 'seq';
    }
    return undefined;
  }
  identify?: (value: unknown) => boolean;
  resolve(value: string | YAMLMap | YAMLSeq): string | YAMLMap | YAMLSeq {
    if (isMap(value) && this.type === 'mapping') {
      return value;
    }
    if (isSeq(value) && this.type === 'sequence') {
      return value;
    }
    if (typeof value === 'string' && this.type === 'scalar') {
      return value;
    }
  }
}

export function customTagsToAdditionalOptions(customTags: string[]): Tags {
  const tags = [];
  const filteredTags = filterInvalidCustomTags(customTags);
  for (const tag of filteredTags) {
    const typeInfo = tag.split(' ');
    const tagName = typeInfo[0];
    const tagType = (typeInfo[1] && typeInfo[1].toLowerCase()) || 'scalar';
    tags.push(new CommonTagImpl(tagName, tagType));
  }
  return tags;
}
