/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic } from 'vscode-languageserver-types';
import type { SingleYAMLDocument } from '../../parser/yaml-documents';

export interface AdditionalValidator {
  validate(document: TextDocument, yamlDoc: SingleYAMLDocument): Diagnostic[];
}
