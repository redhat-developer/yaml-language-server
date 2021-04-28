import * as Yaml from 'yaml-language-server-parser';
import { Schema } from 'yaml-language-server-parser/dist/src/schema';
import { Type } from 'yaml-language-server-parser/dist/src/type';

import { filterInvalidCustomTags } from './arrUtils';
import { ErrorCode } from 'vscode-json-languageservice/lib/umd/jsonLanguageTypes';

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

/**
 * Convert a YAML node exception to a
 * special diagnostic type (NOT YET THE
 * LANGUAGE SERVER DIAGNOSTIC).
 */
function exceptionToDiagnostic(e: Yaml.YAMLException): YAMLDocDiagnostic {
  return {
    message: `${e.reason}`,
    location: {
      start: e.mark.position,
      end: e.mark.position + 1, // we do not know actual end of error, so assuming that it 1 character
      toLineEnd: e.mark.toLineEnd,
    },
    severity: 2,
    code: ErrorCode.Undefined,
  };
}

/**
 * We have to convert the exceptions returned by the AST parser
 * into diagnostics for consumption by the server client.
 */
export function formatErrors(exceptions: Yaml.YAMLException[]): YAMLDocDiagnostic[] {
  return exceptions.filter((e) => e.reason !== DUPLICATE_KEY_REASON && !e.isWarning).map((e) => exceptionToDiagnostic(e));
}

//Patch ontop of yaml-ast-parser to disable duplicate key message on merge key
export function isDuplicateAndNotMergeKey(error: Yaml.YAMLException, yamlText: string): boolean {
  const errorStart = error.mark.position;
  const errorEnd = error.mark.position + error.mark.column;
  if (error.reason === DUPLICATE_KEY_REASON && yamlText.substring(errorStart, errorEnd).startsWith('<<')) {
    return false;
  }
  return true;
}

export function formatWarnings(exceptions: Yaml.YAMLException[], text: string): YAMLDocDiagnostic[] {
  return exceptions
    .filter((e) => (e.reason === DUPLICATE_KEY_REASON && isDuplicateAndNotMergeKey(e, text)) || e.isWarning)
    .map((e) => exceptionToDiagnostic(e));
}

export function customTagsToAdditionalOptions(customTags: string[]): Yaml.LoadOptions {
  const filteredTags = filterInvalidCustomTags(customTags);

  const schemaWithAdditionalTags = Schema.create(
    filteredTags.map((tag) => {
      const typeInfo = tag.split(' ');
      return new Type(typeInfo[0], {
        kind: (typeInfo[1] && typeInfo[1].toLowerCase()) || 'scalar',
      });
    })
  );

  /**
   * Collect the additional tags into a map of string to possible tag types
   */
  const tagWithAdditionalItems = new Map<string, string[]>();
  filteredTags.forEach((tag) => {
    const typeInfo = tag.split(' ');
    const tagName = typeInfo[0];
    const tagType = (typeInfo[1] && typeInfo[1].toLowerCase()) || 'scalar';
    if (tagWithAdditionalItems.has(tagName)) {
      tagWithAdditionalItems.set(tagName, tagWithAdditionalItems.get(tagName).concat([tagType]));
    } else {
      tagWithAdditionalItems.set(tagName, [tagType]);
    }
  });

  tagWithAdditionalItems.forEach((additionalTagKinds, key) => {
    const newTagType = new Type(key, { kind: additionalTagKinds[0] || 'scalar' });
    newTagType.additionalKinds = additionalTagKinds;
    schemaWithAdditionalTags.compiledTypeMap[key] = newTagType;
  });

  const additionalOptions: Yaml.LoadOptions = {
    schema: schemaWithAdditionalTags,
  };

  return additionalOptions;
}
