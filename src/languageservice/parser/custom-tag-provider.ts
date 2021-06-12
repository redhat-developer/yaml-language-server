import { Tags, isSeq, isMap, YAMLMap, YAMLSeq } from 'yaml';
import { filterInvalidCustomTags } from '../utils/arrUtils';

class CommonTagImpl {
  tag: string;
  readonly type: string;
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

class IncludeTag {
  public readonly tag = '!include';
  public readonly type = 'scalar';
  default: never;
  collection: never;
  identify?: (value: unknown) => boolean;
  resolve(value: string, onError: (message: string) => void): string {
    if (value && value.length > 0 && value.trim()) {
      return value;
    }
    onError('!include without value');
  }
}

/**
 * Converts the tags from settings and adds known tags such as !include
 * and returns Tags that can be used by the parser.
 * @param customTags Tags for parser
 */
export function getCustomTags(customTags: string[]): Tags {
  const tags = [];
  const filteredTags = filterInvalidCustomTags(customTags);
  for (const tag of filteredTags) {
    const typeInfo = tag.split(' ');
    const tagName = typeInfo[0];
    const tagType = (typeInfo[1] && typeInfo[1].toLowerCase()) || 'scalar';
    tags.push(new CommonTagImpl(tagName, tagType));
  }
  tags.push(new IncludeTag());
  return tags;
}
