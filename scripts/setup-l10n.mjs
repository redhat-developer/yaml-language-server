import * as l10n from '@vscode/l10n';
import { URI } from 'vscode-uri';
import { fileURLToPath } from 'url';
import * as path from 'path';

class Setupl10n {
  async load() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const l10nPath = path.join(__dirname, '../l10n');

    process.env.VSCODE_NLS_CONFIG = JSON.stringify({
      locale: 'en',
      _languagePackSupport: true,
    });

    await l10n.config({
      uri: URI.file(path.join(l10nPath, 'bundle.l10n.json')).toString(),
    });
  }
}

// Run immediately
new Setupl10n()
  .load()
  .then(() => {
    console.log('✅ l10n configured');
  })
  .catch((err) => {
    console.error('❌ l10n setup failed:', err);
  });
