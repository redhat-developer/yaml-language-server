import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FilePatternAssociation, YAMLSchemaService } from '../src/languageservice/services/yamlSchemaService.js';

describe('Schema file patterns in dot folders', () => {
  for (const { name, patterns, uri } of [
    { name: 'bare filename in .github', patterns: ['actionlint.yaml'], uri: 'file:///home/user/repo/.github/actionlint.yaml' },
    {
      name: 'workspace below a dot folder',
      patterns: ['docker-compose.yml'],
      uri: 'file:///home/user/.config/app/docker-compose.yml',
    },
    {
      name: 'explicit dot pattern below a hidden ancestor',
      patterns: ['**/.github/workflows/*.yml'],
      uri: 'file:///home/user/.dev/repo/.github/workflows/ci.yml',
    },
    {
      name: 'Windows path with a hidden ancestor',
      patterns: ['docker-compose.yml'],
      uri: 'file:///c:/Users/user/.config/app/docker-compose.yml',
    },
    { name: 'wildcard matching a dot filename', patterns: ['*.yaml'], uri: 'file:///home/user/repo/.hidden.yaml' },
  ]) {
    it(name, () => {
      const association = new FilePatternAssociation(patterns, undefined, ['https://example.test/schema.json']);
      assert.equal(association.matchesPattern(uri), true);
    });
  }

  it('honors exclusions below a dot folder', () => {
    const association = new FilePatternAssociation(['*.yaml', '!**/excluded/*.yaml'], undefined, []);
    assert.equal(association.matchesPattern('file:///home/user/.config/app/excluded/config.yaml'), false);
    assert.equal(association.matchesPattern('file:///home/user/.config/app/config.yaml'), true);
  });

  it('applies a wildcard exclusion independently of positive dot-folder matching', () => {
    const association = new FilePatternAssociation(['**/.config/app/*.yaml', '!**/app/*.yaml'], undefined, []);
    assert.equal(association.matchesPattern('file:///home/user/.config/app/config.yaml'), false);
    const control = new FilePatternAssociation(['**/.config/app/*.yaml'], undefined, []);
    assert.equal(control.matchesPattern('file:///home/user/.config/app/config.yaml'), true);
  });

  it('does not make single-star patterns recursive', () => {
    const association = new FilePatternAssociation(['**/playbooks/*.yml'], undefined, []);
    assert.equal(association.matchesPattern('file:///home/user/.config/playbooks/tasks/example.yml'), false);
    assert.equal(association.matchesPattern('file:///home/user/.config/playbooks/example.yml'), true);
  });

  it('keeps folder URI boundaries', () => {
    const association = new FilePatternAssociation(['*.yaml'], 'file:///home/user/.config/app/', []);
    assert.equal(association.matchesPattern('file:///home/user/.config/app/config.yaml'), true);
    assert.equal(association.matchesPattern('file:///home/user/.config/other/config.yaml'), false);
  });

  it('resolves a registered schema for a file below .github', async () => {
    const service = new YAMLSchemaService(() => Promise.reject(new Error('No remote fetch expected')));
    service.registerExternalSchema('https://example.test/actionlint.json', ['actionlint.yaml'], {
      type: 'object',
      properties: { 'self-hosted-runner': { type: 'object' } },
    });
    const resolved = await service.getSchemaForResource('file:///home/user/repo/.github/actionlint.yaml', undefined);
    assert.ok(resolved);
    assert.equal(resolved.schema.type, 'object');
    assert.ok(resolved.schema.properties?.['self-hosted-runner']);
  });
});
