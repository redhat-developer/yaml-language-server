/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONFilePatternAssociation } from '../src/languageservice/services/yamlSchemaService';
import { expect } from 'chai';

describe('JSONFilePatternAssociation tests', () => {
  it('should handle glob patterns', () => {
    const pattern = new JSONFilePatternAssociation(['foo/*.yml'], ['https://some/uri/to/schema.json']);
    expect(pattern.matchesPattern('/foo/aaa.yml')).to.be.true;
    expect(pattern.matchesPattern('/foo/bar/aaa.yml')).to.be.false;
  });

  it('should handle extglob patterns', () => {
    const pattern = new JSONFilePatternAssociation(
      ['**/{host_vars,group_vars,vars,defaults}/**/*.{yaml,yml}'],
      ['https://some/uri/to/schema.json']
    );
    expect(pattern.matchesPattern('file:///foo/defaults/bar/test.yml')).to.be.true;
  });
});
