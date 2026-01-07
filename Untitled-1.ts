/**
 * Tests for Citrix Workspace Configuration Schema
 */

import { expect } from 'chai';
import { getLanguageService, TextDocument } from '../../src/languageservice/yamlLanguageService';
import * as path from 'path';

describe('Citrix Workspace Configuration Schema', () => {
  const languageService = getLanguageService({
    schemaRequestService: (uri) => {
      if (uri.includes('citrix-workspace-config')) {
        return Promise.resolve(
          JSON.stringify(require('../../schemas/citrix-workspace-config.schema.json'))
        );
      }
      return Promise.reject('Schema not found');
    }
  });

  it('should validate correct Citrix workspace configuration', async () => {
    const content = `
session:
  clipboard:
    enabled: true
    allowFormats:
      - CF_TEXT
      - CF_HTML
toolbar:
  EnableInSessionToolbar: true
`;

    const document = TextDocument.create(
      'test://citrix-config.yaml',
      'yaml',
      1,
      content
    );

    const diagnostics = await languageService.doValidation(document, true);
    expect(diagnostics).to.be.empty;
  });

  it('should report error for invalid toolbar button', async () => {
    const content = `
toolbar:
  HiddenToolbarButtons:
    - invalid_button
    - preferences
`;

    const document = TextDocument.create(
      'test://citrix-config.yaml',
      'yaml',
      1,
      content
    );

    const diagnostics = await languageService.doValidation(document, true);
    expect(diagnostics).to.have.length.greaterThan(0);
    expect(diagnostics[0].message).to.include('invalid_button');
  });

  it('should provide completion for session settings', async () => {
    const content = `
session:
  `;

    const document = TextDocument.create(
      'test://citrix-config.yaml',
      'yaml',
      1,
      content
    );

    const completions = await languageService.doComplete(
      document,
      document.positionAt(content.length),
      true
    );

    const labels = completions!.items.map(item => item.label);
    expect(labels).to.include('clipboard');
    expect(labels).to.include('reliability');
  });

  it('should provide enum completions for clipboard formats', async () => {
    const content = `
session:
  clipboard:
    allowFormats:
      - `;

    const document = TextDocument.create(
      'test://citrix-config.yaml',
      'yaml',
      1,
      content
    );

    const completions = await languageService.doComplete(
      document,
      document.positionAt(content.length),
      true
    );

    const labels = completions!.items.map(item => item.label);
    expect(labels).to.include('CF_TEXT');
    expect(labels).to.include('CF_HTML');
    expect(labels).to.include('CF_FILES');
  });

  it('should show hover documentation for settings', async () => {
    const content = `
session:
  reliability:
    timeout: 180
`;

    const document = TextDocument.create(
      'test://citrix-config.yaml',
      'yaml',
      1,
      content
    );

    const position = document.positionAt(content.indexOf('timeout'));
    const hover = await languageService.doHover(document, position);

    expect(hover).to.exist;
    expect(hover!.contents).to.include('Session reliability timeout');
  });

  it('should validate timeout ranges', async () => {
    const content = `
session:
  reliability:
    timeout: 10  # Too low, minimum is 30
`;

    const document = TextDocument.create(
      'test://citrix-config.yaml',
      'yaml',
      1,
      content
    );

    const diagnostics = await languageService.doValidation(document, true);
    expect(diagnostics).to.have.length.greaterThan(0);
    expect(diagnostics[0].message).to.include('minimum');
  });

  it('should validate format in clipboard settings', async () => {
    const content = `
session:
  clipboard:
    allowFormats:
      - CF_TEXT
      - INVALID_FORMAT
`;

    const document = TextDocument.create(
      'test://citrix-config.yaml',
      'yaml',
      1,
      content
    );

    const diagnostics = await languageService.doValidation(document, true);
    expect(diagnostics).to.have.length.greaterThan(0);
  });
});