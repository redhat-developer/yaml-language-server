import * as Yaml from 'yaml-ast-parser-custom-tags';
import { Schema, Type } from 'js-yaml';

import { filterInvalidCustomTags } from './arrUtils';

export const DUPLICATE_KEY_REASON = 'duplicate key';

/**
 * An individual YAML diagnostic,
 * after formatting.
 */
export interface YAMLDocDiagnostic {
    message: string
    range: {
        start: {
            line: number
            character: number
        }
        end: {
            line: number
            character: number
        }
    }
    severity: number
}

function exceptionToDiagnostic(e: Yaml.YAMLException): YAMLDocDiagnostic {
    const exception = {
        exception: e,
        string: e.toString(),
        mark: {
            mark: e.mark,
            string: e.mark.toString(),
            snippet: {
                snippet: e.mark.getSnippet(),
                length: e.mark.getSnippet().length
            }
        }
    };
    console.log(exception);

    const line = e.mark.line === 0 ? 0 : e.mark.line - 1;
    /**
     * I think this calculation is wrong???
     */
    const character = e.mark.position + e.mark.column === 0 ? 0 : e.mark.position + e.mark.column - 1;

    /**
     * Something funny going on here -- why would these
     * errors start and end at the same position?
     */
    return {
        message: `${e.reason}`,
        range: {
            start: {
                line,
                character
            },
            end: {
                line,
                character
            },
        },
        severity: 2
    };
}

/**
 * We have to convert the exceptions returned by the AST parser
 * into diagnostics for consumption by the server client.
 */
export function formatErrors(exceptions: Yaml.YAMLException[]) {
    return exceptions
            .filter(e => e.reason !== DUPLICATE_KEY_REASON && !e.isWarning)
            .map(e => exceptionToDiagnostic(e));
}

//Patch ontop of yaml-ast-parser to disable duplicate key message on merge key
export function isDuplicateAndNotMergeKey (error: Yaml.YAMLException, yamlText: string) {
    const errorStart = error.mark.position;
    const errorEnd = error.mark.position + error.mark.column;
    if (error.reason === DUPLICATE_KEY_REASON && yamlText.substring(errorStart, errorEnd).startsWith('<<')) {
        return false;
    }
    return true;
}

export function formatWarnings(exceptions: Yaml.YAMLException[], text: string) {
    return exceptions
            .filter(e => (e.reason === DUPLICATE_KEY_REASON && isDuplicateAndNotMergeKey(e, text)) || e.isWarning)
            .map(e => exceptionToDiagnostic(e));
}

export function customTagsToAdditionalOptions(customTags: String[]) {
    const filteredTags = filterInvalidCustomTags(customTags);

    const schemaWithAdditionalTags = Schema.create(filteredTags.map(tag => {
        const typeInfo = tag.split(' ');
        return new Type(typeInfo[0], { kind: (typeInfo[1] && typeInfo[1].toLowerCase()) || 'scalar' });
    }));

    /**
     * Collect the additional tags into a map of string to possible tag types
     */
    const tagWithAdditionalItems = new Map<string, string[]>();
    filteredTags.forEach(tag => {
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
        schema: schemaWithAdditionalTags
    };

    return additionalOptions;
}