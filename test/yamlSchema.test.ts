/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as SchemaService from '../src/languageservice/services/yamlSchemaService';
import * as url from 'url';
import * as sinon from 'sinon';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';

const expect = chai.expect;
chai.use(sinonChai);

const workspaceContext = {
  resolveRelativePath: (relativePath: string, resource: string) => {
    return url.resolve(resource, relativePath);
  },
};

describe('YAML Schema', () => {
  const sandbox = sinon.createSandbox();
  let requestServiceStub: sinon.SinonStub;
  beforeEach(() => {
    requestServiceStub = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('Loading yaml scheme', async () => {
    requestServiceStub.resolves(`
    properties:
      fooBar:
        items:
          type: string
        type: array
    type: object
    `);
    const service = new SchemaService.YAMLSchemaService(requestServiceStub, workspaceContext);
    const result = await service.loadSchema('fooScheme.yaml');
    expect(requestServiceStub.calledOnceWith('fooScheme.yaml'));
    expect(result.schema.properties['fooBar']).eql({
      items: { type: 'string' },
      type: 'array',
    });
  });

  it('Error while loading yaml', async () => {
    requestServiceStub.rejects();
    const service = new SchemaService.YAMLSchemaService(requestServiceStub, workspaceContext);
    const result = await service.loadSchema('fooScheme.yaml');
    expect(result.errors).length(1);
    expect(result.errors[0]).includes('Unable to load schema from');
  });

  it('Error while parsing yaml scheme', async () => {
    requestServiceStub.resolves(`%464*&^^&*%@$&^##$`);
    const service = new SchemaService.YAMLSchemaService(requestServiceStub, workspaceContext);
    const result = await service.loadSchema('fooScheme.yaml');
    expect(requestServiceStub.calledOnceWith('fooScheme.yaml'));
    expect(result.errors).length(1);
    expect(result.errors[0]).includes('Unable to parse content from');
  });
});
