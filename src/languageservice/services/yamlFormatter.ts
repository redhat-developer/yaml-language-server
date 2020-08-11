/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, Range, Position, TextEdit } from 'vscode-languageserver-types';
import { CustomFormatterOptions, LanguageSettings } from '../yamlLanguageService';
import * as prettier from 'prettier';

export class YAMLFormatter {
  private formatterEnabled = true;

  public configure(shouldFormat: LanguageSettings): void {
    if (shouldFormat) {
      this.formatterEnabled = shouldFormat.format;
    }
  }

  public format(document: TextDocument, options: CustomFormatterOptions): TextEdit[] {
    if (!this.formatterEnabled) {
      return [];
    }

    try {
      const text = document.getText();
      (options as prettier.Options).parser = 'yaml';
      const formatted = prettier.format(text, options as prettier.Options);

      return [
        TextEdit.replace(
          Range.create(Position.create(0, 0), document.positionAt(text.length)),
          formatted
        ),
      ];
    } catch (error) {
      return [];
    }
  }
}
