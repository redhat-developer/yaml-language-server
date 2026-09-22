/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FormattingOptions } from 'vscode-languageserver-types';
import { Range, Position, TextEdit } from 'vscode-languageserver-types';
import type { CustomFormatterOptions, LanguageSettings } from '../yamlLanguageService';
import type { Options } from 'prettier';
import * as yamlPlugin from 'prettier/plugins/yaml';
import * as estreePlugin from 'prettier/plugins/estree';
import { format } from 'prettier/standalone';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { TemplateMode } from '../parser/templateMasking';

export class YAMLFormatter {
  private formatterEnabled = true;
  private templateMode: TemplateMode = 'none';

  public configure(shouldFormat: LanguageSettings): void {
    if (shouldFormat) {
      this.formatterEnabled = shouldFormat.format;
      this.templateMode = shouldFormat.template ?? 'none';
    }
  }

  public async format(
    document: TextDocument,
    options: Partial<FormattingOptions> & CustomFormatterOptions = {}
  ): Promise<TextEdit[]> {
    if (!this.formatterEnabled) {
      return [];
    }

    try {
      const text = document.getText();

      // Prettier has no notion of template expressions and would rewrite or
      // reject them, so a templated document is left untouched.
      if (this.templateMode !== 'none' && text.includes('{{')) {
        return [];
      }

      const prettierOptions: Options = {
        parser: 'yaml',
        plugins: [yamlPlugin, estreePlugin],

        // --- FormattingOptions ---
        tabWidth: (options.tabWidth as number) || options.tabSize,

        // --- CustomFormatterOptions ---
        singleQuote: options.singleQuote,
        bracketSpacing: options.bracketSpacing,
        // 'preserve' is the default for Options.proseWrap. See also server.ts
        proseWrap: 'always' === options.proseWrap ? 'always' : 'never' === options.proseWrap ? 'never' : 'preserve',
        printWidth: options.printWidth,
        trailingComma: options.trailingComma === false ? 'none' : 'all',
      };

      const formatted = await format(text, prettierOptions);
      if (formatted === text) {
        return [];
      }

      return [TextEdit.replace(Range.create(Position.create(0, 0), document.positionAt(text.length)), formatted)];
    } catch {
      return [];
    }
  }
}
