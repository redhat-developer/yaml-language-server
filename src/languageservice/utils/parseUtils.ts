import { filterInvalidCustomTags } from './arrUtils';
import { ErrorCode } from 'vscode-json-languageservice/lib/umd/jsonLanguageTypes';
import { Tags } from 'yaml';

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

export function customTagsToAdditionalOptions(customTags: string[]): Tags {
  const yamlTags = [];
  const filteredTags = filterInvalidCustomTags(customTags);

  for (const tag of filteredTags) {
    const typeInfo = tag.split(' ');
    const tagName = typeInfo[0];
    const tagType = (typeInfo[1] && typeInfo[1].toLowerCase()) || 'scalar';
    switch (tagType) {
      case 'sequence':
        yamlTags.push('seq');
        break;
      case 'mapping':
        yamlTags.push('map');
        break;
      case 'scalar':
      default:
        yamlTags.push({
          identify: (value) => typeof value === 'string',
          default: true,
          tag: tagName,
          resolve: (str) => str,
        });
    }
  }
  return yamlTags;
}
