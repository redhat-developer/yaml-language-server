/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range, Position, TextEdit, FormattingOptions } from 'vscode-languageserver-types';
import { CustomFormatterOptions, LanguageSettings } from '../yamlLanguageService';
import * as prettier from 'prettier';
import { Options } from 'prettier';
import * as parser from 'prettier/parser-yaml';
import { TextDocument } from 'vscode-languageserver-textdocument';

export class YAMLFormatter {
  private formatterEnabled = true;

  public configure(shouldFormat: LanguageSettings): void {
    if (shouldFormat) {
      this.formatterEnabled = shouldFormat.format;
    }
  }

  public format(document: TextDocument, options: FormattingOptions & CustomFormatterOptions): TextEdit[] {
    if (!this.formatterEnabled) {
      return [];
    }

    try {
      const text = document.getText();

      const prettierOptions: Options = {
        parser: 'yaml',
        plugins: [parser],

        // --- FormattingOptions ---
        tabWidth: (options.tabWidth as number) || options.tabSize,

        // --- CustomFormatterOptions ---
        singleQuote: options.singleQuote,
        bracketSpacing: options.bracketSpacing,
        // 'preserve' is the default for Options.proseWrap. See also server.ts
        proseWrap: 'always' === options.proseWrap ? 'always' : 'never' === options.proseWrap ? 'never' : 'preserve',
        printWidth: options.printWidth,
      };

      const formatted = prettier.format(text, prettierOptions);

      return [TextEdit.replace(Range.create(Position.create(0, 0), document.positionAt(text.length)), formatted)];
    } catch (error) {
      return [];
    }
  }
}
