/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FilePatternAssociation } from '../src/languageservice/services/yamlSchemaService';
import { expect } from 'chai';

describe('JSONFilePatternAssociation tests', () => {
  it('should handle glob patterns', () => {
    const pattern = new FilePatternAssociation(['foo/*.yml'], ['https://some/uri/to/schema.json']);
    expect(pattern.matchesPattern('file:///foo/aaa.yml')).to.be.true;
    expect(pattern.matchesPattern('file:///foo/bar/aaa.yml')).to.be.false;
  });

  it('should handle extglob patterns', () => {
    const pattern = new FilePatternAssociation(
      ['**/{host_vars,group_vars,vars,defaults}/**/*.{yaml,yml}'],
      ['https://some/uri/to/schema.json']
    );
    expect(pattern.matchesPattern('file:///foo/defaults/bar/test.yml')).to.be.true;
  });

  it('should match schemastore fileMatch', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schemaStore: SchemaToFileMatch[] = [
      {
        name: 'Ansible Role',
        url: 'https://json.schemastore.org/ansible-role-2.9.json',
        fileMatch: ['**/roles/**/tasks/*.yml', '**/roles/**/tasks/*.yaml'],
        shouldMatch: ['file:///some/path/roles/foo/tasks/aaa.yaml'],
        shouldNotMatch: ['file:///some/playbook.yml', 'file:///c|/WINDOWS/playbook.yaml'],
      },
      {
        name: 'Ansible Playbook',
        url: 'https://json.schemastore.org/ansible-playbook.json',
        fileMatch: ['playbook.yml', 'playbook.yaml'],
        shouldMatch: ['file:///some/playbook.yml', 'file:///c|/WINDOWS/playbook.yaml'],
      },
      {
        name: 'Buildkite',
        fileMatch: [
          'buildkite.yml',
          'buildkite.yaml',
          'buildkite.*.yml',
          'buildkite.*.yaml',
          '.buildkite/pipeline.yml',
          '.buildkite/pipeline.yaml',
          '.buildkite/pipeline.*.yml',
          '.buildkite/pipeline.*.yaml',
        ],
        url: 'https://raw.githubusercontent.com/buildkite/pipeline-schema/master/schema.json',
        shouldMatch: [
          'file:///some/path/roles/foo/tasks/buildkite.yml',
          'file:///c|/WINDOWS/buildkite.foo.yaml',
          'file:///some/.buildkite/pipeline.bar.yaml',
        ],
      },
      {
        name: 'Generic Ansible',
        fileMatch: [
          '**/{collections,requirements,molecule,galaxy}.yml',
          '**/{host_vars,group_vars,vars,defaults}/**/*.{yaml,yml}',
          '**/meta/main.{yaml,yml}',
        ],
        url: 'https://json.schemastore.org/ansible-role-2.9.json',
        shouldMatch: [
          'file:///some/path/collections.yml',
          'file:///some/path/foo/requirements.yml',
          'file:///some/path/molecule.yml',
          'file:///some/path/galaxy.yml',
          'file:///some/path/host_vars/foo/bar.yml',
          'file:///some/path/meta/main.yml',
        ],
      },
    ];

    for (const match of schemaStore) {
      const pattern = new FilePatternAssociation(match.fileMatch, [match.url]);
      for (const fileUri of match.shouldMatch) {
        expect(pattern.matchesPattern(fileUri), `${match.name} not match to ${fileUri}`).to.be.true;
      }

      if (match.shouldNotMatch) {
        for (const fileUri of match.shouldNotMatch) {
          expect(pattern.matchesPattern(fileUri), `${match.name} match to ${fileUri}`).to.be.false;
        }
      }
    }
  });
});

interface SchemaToFileMatch {
  name: string;
  fileMatch: string[];
  url: string;
  shouldMatch: string[];
  shouldNotMatch?: string[];
}
