import type { Tags, YAMLMap, YAMLSeq } from 'yaml';

import type { CustomTagInputType, CustomTagReturnType } from '../utils/customTags';

import { Scalar, isMap, isSeq } from 'yaml';

import { parseCustomTag, setCustomTagReturnType } from '../utils/customTags';

class CommonTagImpl {
  tag: string;
  readonly type: CustomTagInputType;
  readonly returnType?: CustomTagReturnType;
  default: never;
  constructor(tag: string, type: CustomTagInputType, returnType?: CustomTagReturnType) {
    this.tag = tag;
    this.type = type;
    this.returnType = returnType;
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
  resolve(value: string | YAMLMap | YAMLSeq): string | YAMLMap | YAMLSeq | Scalar {
    if (isMap(value) && this.type === 'mapping') {
      return this.addReturnTypeMetadata(value);
    }
    if (isSeq(value) && this.type === 'sequence') {
      return this.addReturnTypeMetadata(value);
    }
    if (typeof value === 'string' && this.type === 'scalar') {
      return this.addReturnTypeMetadata(value);
    }
  }

  private addReturnTypeMetadata(value: string | YAMLMap | YAMLSeq): string | YAMLMap | YAMLSeq | Scalar {
    if (!this.returnType) {
      return value;
    }
    if (typeof value === 'string') {
      const scalar = new Scalar(value);
      setCustomTagReturnType(scalar, this.returnType);
      return scalar;
    }
    setCustomTagReturnType(value, this.returnType);
    return value;
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
  for (const tag of customTags ?? []) {
    const parsedTag = parseCustomTag(tag);
    if (parsedTag) {
      tags.push(new CommonTagImpl(parsedTag.tag, parsedTag.inputType, parsedTag.returnType));
    }
  }
  tags.push(new IncludeTag());
  return tags;
}
