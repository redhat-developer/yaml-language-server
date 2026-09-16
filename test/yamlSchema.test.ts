/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as SchemaService from '../src/languageservice/services/yamlSchemaService';
import * as url from 'url';
import * as sinon from 'sinon';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';

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
    requestServiceStub.resolves(`%YAML 1.2
---
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
    expect(result.errors[0].message).includes('Unable to load schema from');
  });

  it('Error while loading yaml should keep the underlying reason', async () => {
    requestServiceStub.rejects(new Error('Request failed with status code 429'));
    const service = new SchemaService.YAMLSchemaService(requestServiceStub, workspaceContext);
    const result = await service.loadSchema('https://example.com/fooScheme.json');
    expect(result.errors).length(1);
    expect(result.errors[0].message).includes('Request failed with status code 429');
    expect(result.errors[0].message).not.includes('No content');
  });

  it('Empty response while loading yaml should report no content', async () => {
    requestServiceStub.resolves('');
    const service = new SchemaService.YAMLSchemaService(requestServiceStub, workspaceContext);
    const result = await service.loadSchema('https://example.com/fooScheme.json');
    expect(result.errors).length(1);
    expect(result.errors[0].message).includes('No content');
  });

  it('Unreachable host should report the connection failure, not an empty reason', async () => {
    // request-light wraps connection errors as '<context>. Error: <message>', and for
    // ECONNREFUSED the underlying message is empty - the reason must not collapse to ''
    requestServiceStub.rejects(new Error('Unable to connect to https://example.com/fooScheme.json. Error: '));
    const service = new SchemaService.YAMLSchemaService(requestServiceStub, workspaceContext);
    const result = await service.loadSchema('https://example.com/fooScheme.json');
    expect(result.errors).length(1);
    expect(result.errors[0].message).includes('Unable to connect to');
    expect(result.errors[0].message).to.not.match(/:\s*\.$/);
    expect(result.errors[0].message).to.not.match(/\bError:?\.?$/);
  });

  it('Error with no message should fall back to the error code', async () => {
    const connectionError = new Error('');
    (connectionError as Error & { code: string }).code = 'ECONNREFUSED';
    requestServiceStub.rejects(connectionError);
    const service = new SchemaService.YAMLSchemaService(requestServiceStub, workspaceContext);
    const result = await service.loadSchema('https://example.com/fooScheme.json');
    expect(result.errors).length(1);
    expect(result.errors[0].message).includes('ECONNREFUSED');
  });

  it('Non-Error rejection should still report its reason', async () => {
    // schemaRequestHandler rethrows the response body as a plain string, not an Error
    requestServiceStub.callsFake(() => Promise.reject('Too Many Requests'));
    const service = new SchemaService.YAMLSchemaService(requestServiceStub, workspaceContext);
    const result = await service.loadSchema('https://example.com/fooScheme.json');
    expect(result.errors).length(1);
    expect(result.errors[0].message).includes('Too Many Requests');
  });

  it('Error while parsing yaml scheme', async () => {
    requestServiceStub.resolves(`%464*&^^&*%@$&^##$`);
    const service = new SchemaService.YAMLSchemaService(requestServiceStub, workspaceContext);
    const result = await service.loadSchema('fooScheme.yaml');
    expect(requestServiceStub.calledOnceWith('fooScheme.yaml'));
    expect(result.errors).length(1);
    expect(result.errors[0].message).includes('Unable to parse content from');
  });
});

describe('toLoadErrorReason', () => {
  const withCode = (message: string, code: string): Error => {
    const error = new Error(message);
    (error as Error & { code: string }).code = code;
    return error;
  };

  it('should return the message of a plain Error', () => {
    expect(SchemaService.toLoadErrorReason(new Error('socket hang up'))).to.equal('socket hang up');
  });

  it('should accept a non-Error rejection', () => {
    // schemaRequestHandler rethrows the response body as a plain string
    expect(SchemaService.toLoadErrorReason('Too Many Requests')).to.equal('Too Many Requests');
  });

  it('should prefer the text after a nested "Error: " prefix', () => {
    expect(SchemaService.toLoadErrorReason(new Error('Wrapper: Error: socket hang up'))).to.equal('socket hang up');
  });

  it('should keep the leading context when nothing follows "Error: "', () => {
    // request-light formats connection failures this way, and for ECONNREFUSED the
    // underlying message is empty - taking the tail would leave no reason at all
    expect(SchemaService.toLoadErrorReason(new Error('Unable to connect to https://example.com. Error: '))).to.equal(
      'Unable to connect to https://example.com'
    );
  });

  it('should not leave a dangling "Error" marker', () => {
    expect(SchemaService.toLoadErrorReason(new Error('Unable to connect. Error:'))).to.equal('Unable to connect');
    expect(SchemaService.toLoadErrorReason(new Error('Unable to connect. Error'))).to.equal('Unable to connect');
  });

  it('should strip a single trailing period', () => {
    // the caller appends its own period
    expect(SchemaService.toLoadErrorReason(new Error('Internal Server Error.'))).to.equal('Internal Server Error');
  });

  it('should fall back to the error code when there is no message', () => {
    expect(SchemaService.toLoadErrorReason(withCode('', 'ECONNREFUSED'))).to.equal('ECONNREFUSED');
    expect(SchemaService.toLoadErrorReason(withCode('   ', 'ENOTFOUND'))).to.equal('ENOTFOUND');
  });

  it('should prefer an available message over the error code', () => {
    expect(SchemaService.toLoadErrorReason(withCode('getaddrinfo failed', 'ENOTFOUND'))).to.equal('getaddrinfo failed');
  });

  it('should return an empty string when no reason can be determined', () => {
    // the caller omits the ': {reason}' suffix entirely rather than printing ': .'
    expect(SchemaService.toLoadErrorReason(new Error(''))).to.equal('');
    expect(SchemaService.toLoadErrorReason(undefined)).to.equal('');
    expect(SchemaService.toLoadErrorReason(null)).to.equal('');
  });

  it('should ignore a non-string error code', () => {
    expect(SchemaService.toLoadErrorReason(withCode('', 500 as unknown as string))).to.equal('');
  });
});
