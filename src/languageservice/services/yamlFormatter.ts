/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { FormattingOptions, Position, Range, TextEdit } from 'vscode-languageserver-types';
import { parseDocument, ToStringOptions } from 'yaml';
import { YamlVersion } from '../parser/yamlParser07';
import { CustomFormatterOptions, LanguageSettings } from '../yamlLanguageService';
import { getCustomTags } from '../parser/custom-tag-provider';

export class YAMLFormatter {
  private formatterEnabled = true;
  private yamlVersion: YamlVersion = '1.2';
  private customTags: string[] = [];

  public configure(shouldFormat: LanguageSettings): void {
    if (shouldFormat) {
      this.formatterEnabled = shouldFormat.format;
      this.yamlVersion = shouldFormat.yamlVersion;
      this.customTags = shouldFormat.customTags;
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
      const doc = parseDocument(text, {
        version: this.yamlVersion,
        customTags: getCustomTags(this.customTags),
      });

      const toStringOptions: ToStringOptions = {
        // --- FormattingOptions ---
        indent: (options.tabWidth as number) || options.tabSize || 2,

        // --- CustomFormatterOptions ---
        singleQuote: options.singleQuote,
        flowCollectionPadding: options.bracketSpacing,
        blockQuote: options.proseWrap === 'always' ? 'folded' : true,
        lineWidth: Math.max(options.printWidth || 0, 22),
        trailingComma: options.trailingComma === undefined ? true : options.trailingComma,
      };

      const formatted = doc.toString(toStringOptions);

      if (formatted === text) {
        return [];
      }

      return [TextEdit.replace(Range.create(Position.create(0, 0), document.positionAt(text.length)), formatted)];
    } catch (error) {
      return [];
    }
  }
}
