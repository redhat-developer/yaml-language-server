import * as Yaml from 'yaml-ast-parser-custom-tags';
import { Schema, Type } from 'js-yaml';

import { filterInvalidCustomTags } from './arrUtils';
import { emit } from 'process';

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

/**
 * Convert a YAML node exception to a
 * language server diagnostic.
 */
function exceptionToDiagnostic(e: Yaml.YAMLException): YAMLDocDiagnostic {
    // The exceptions from the AST produce WEIRD text snippets.
    // This undoes the strange formatting.
    const formatSnippet = (snippet: string) => snippet
                                                .replace(/ /g, '')
                                                .replace(/\n/g, '')
                                                .replace(/\^/g, '');
    const exceptionSnippet = e.mark.getSnippet();
    const snippet = formatSnippet(exceptionSnippet);

    const line = e.mark.line === 1 ? 0 : e.mark.line;
    let startPos;
    let endPos;

    // Use the snippet to calculate the diagnostic position
    // if it's available. Some exceptions return empty snippets.
    // In the event of an empty snippet, use the old logic.
    if (snippet.length > 0) {
        startPos = e.mark.column;
        endPos = e.mark.column + snippet.length;
    } else {
        const pos = e.mark.position + e.mark.column === 0 ? 0 : e.mark.position + e.mark.column - 1;
        startPos = pos;
        endPos = pos;
    }

    return {
        message: `${e.reason}`,
        range: {
            start: {
                line,
                character: startPos
            },
            end: {
                line,
                character: endPos
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