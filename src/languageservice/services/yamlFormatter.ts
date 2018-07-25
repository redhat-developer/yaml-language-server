/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as jsyaml from 'js-yaml';
import * as Yaml from 'yaml-ast-parser'
import { EOL } from 'os';
import { TextDocument, Range, Position, FormattingOptions, TextEdit } from 'vscode-languageserver-types';

export function format(document: TextDocument, options: FormattingOptions, customTags: Array<String>): TextEdit[] {
    const text = document.getText();

    let schemaWithAdditionalTags = jsyaml.Schema.create(customTags.map((tag) => {
		const typeInfo = tag.split(' ');
		return new jsyaml.Type(typeInfo[0], { kind: typeInfo[1] || 'scalar' });
	}));

	//We need compiledTypeMap to be available from schemaWithAdditionalTags before we add the new custom properties
	customTags.map((tag) => {
		const typeInfo = tag.split(' ');
		schemaWithAdditionalTags.compiledTypeMap[typeInfo[0]] = new jsyaml.Type(typeInfo[0], { kind: typeInfo[1] || 'scalar' });
	});

	let additionalOptions: Yaml.LoadOptions = {
		schema: schemaWithAdditionalTags
	}

    const documents = []
    jsyaml.loadAll(text, doc => documents.push(doc), additionalOptions)

    const dumpOptions = { indent: options.tabSize, noCompatMode: true };

    let newText;
    if (documents.length == 1) {
        const yaml = documents[0]
        newText = jsyaml.safeDump(yaml, dumpOptions)
    }
    else {
        const formatted = documents.map(d => jsyaml.safeDump(d, dumpOptions))
        newText = '%YAML 1.2' + EOL + '---' + EOL + formatted.join('...' + EOL + '---' + EOL) + '...' + EOL
    }

    return [TextEdit.replace(Range.create(Position.create(0, 0), document.positionAt(text.length)), newText)]
}