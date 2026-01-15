/*---------------------------------------------------------------------------------------------
 *  Copyright (c) IBM Corp. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { existsSync } from 'fs';
import { URI } from 'vscode-uri';
import * as l10n from '@vscode/l10n';
import { InitializeParams } from 'vscode-languageserver';

/**
 * Loads translations from the filesystem based on the configured locale and the folder of translations provided in hte initilaization parameters.
 *
 * This is the default implementation when running as binary, but isn't used when running as a web worker.
 *
 * @param params the language server initialization parameters
 */
export async function setupl10nBundle(params: InitializeParams): Promise<void> {
  const __dirname = path.dirname(__filename);
  const l10nPath: string = params.initializationOptions?.l10nPath || path.join(__dirname, '../../../l10n');
  const locale: string = params.locale || 'en';
  if (l10nPath) {
    const bundleFile = !existsSync(path.join(l10nPath, `bundle.l10n.${locale}.json`))
      ? `bundle.l10n.json`
      : `bundle.l10n.${locale}.json`;
    const baseBundleFile = path.join(l10nPath, bundleFile);
    process.env.VSCODE_NLS_CONFIG = JSON.stringify({
      locale,
      _languagePackSupport: true,
    });
    await l10n.config({
      uri: URI.file(baseBundleFile).toString(),
    });
  }
}
