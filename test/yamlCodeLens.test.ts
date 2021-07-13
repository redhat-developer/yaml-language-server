/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as chai from 'chai';
import { YamlCodeLens } from '../src/languageservice/services/yamlCodeLens';
import { YAMLSchemaService } from '../src/languageservice/services/yamlSchemaService';
import { setupTextDocument } from './utils/testHelper';
import { JSONSchema } from '../src/languageservice/jsonSchema';
import { CodeLens, Command, Range } from 'vscode-languageserver-protocol';
import { YamlCommands } from '../src/commands';
import { Telemetry } from '../src/languageserver/telemetry';

const expect = chai.expect;
chai.use(sinonChai);

describe('YAML CodeLens', () => {
  const sandbox = sinon.createSandbox();
  let yamlSchemaService: sinon.SinonStubbedInstance<YAMLSchemaService>;
  let telemetryStub: sinon.SinonStubbedInstance<Telemetry>;
  let telemetry: Telemetry;

  beforeEach(() => {
    yamlSchemaService = sandbox.createStubInstance(YAMLSchemaService);
    telemetryStub = sandbox.createStubInstance(Telemetry);
    telemetry = (telemetryStub as unknown) as Telemetry;
  });

  afterEach(() => {
    sandbox.restore();
  });

  function createCommand(title: string, arg: string): Command {
    return {
      title,
      command: YamlCommands.JUMP_TO_SCHEMA,
      arguments: [arg],
    };
  }

  function createCodeLens(title: string, arg: string): CodeLens {
    const lens = CodeLens.create(Range.create(0, 0, 0, 0));
    lens.command = createCommand(title, arg);
    return lens;
  }

  it('should provides CodeLens with jumpToSchema command', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema: JSONSchema = {
      url: 'some://url/to/schema.json',
    };
    yamlSchemaService.getSchemaForResource.resolves({ schema });
    const codeLens = new YamlCodeLens((yamlSchemaService as unknown) as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc, { textDocument: { uri: doc.uri } });
    expect(result).is.not.empty;
    expect(result[0].command).is.not.undefined;
    expect(result[0].command).is.deep.equal(createCommand('schema.json', 'some://url/to/schema.json'));
  });

  it('should place CodeLens at beginning of the file and it has command', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema: JSONSchema = {
      url: 'some://url/to/schema.json',
    };
    yamlSchemaService.getSchemaForResource.resolves({ schema });
    const codeLens = new YamlCodeLens((yamlSchemaService as unknown) as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc, { textDocument: { uri: doc.uri } });
    expect(result[0].range).is.deep.equal(Range.create(0, 0, 0, 0));
    expect(result[0].command).is.deep.equal(createCommand('schema.json', 'some://url/to/schema.json'));
  });

  it('command name should contains schema title', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema = {
      url: 'some://url/to/schema.json',
      title: 'fooBar',
    } as JSONSchema;
    yamlSchemaService.getSchemaForResource.resolves({ schema });
    const codeLens = new YamlCodeLens((yamlSchemaService as unknown) as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc, { textDocument: { uri: doc.uri } });
    expect(result[0].command).is.deep.equal(createCommand('fooBar (schema.json)', 'some://url/to/schema.json'));
  });

  it('should provide lens for oneOf schemas', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema = {
      oneOf: [
        {
          url: 'some://url/schema1.json',
        },
        {
          url: 'some://url/schema2.json',
        },
      ],
    } as JSONSchema;
    yamlSchemaService.getSchemaForResource.resolves({ schema });
    const codeLens = new YamlCodeLens((yamlSchemaService as unknown) as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc, { textDocument: { uri: doc.uri } });
    expect(result).has.length(2);
    expect(result).is.deep.equal([
      createCodeLens('schema1.json', 'some://url/schema1.json'),
      createCodeLens('schema2.json', 'some://url/schema2.json'),
    ]);
  });

  it('should provide lens for allOf schemas', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema = {
      allOf: [
        {
          url: 'some://url/schema1.json',
        },
        {
          url: 'some://url/schema2.json',
        },
      ],
    } as JSONSchema;
    yamlSchemaService.getSchemaForResource.resolves({ schema });
    const codeLens = new YamlCodeLens((yamlSchemaService as unknown) as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc, { textDocument: { uri: doc.uri } });
    expect(result).has.length(2);
    expect(result).is.deep.equal([
      createCodeLens('schema1.json', 'some://url/schema1.json'),
      createCodeLens('schema2.json', 'some://url/schema2.json'),
    ]);
  });

  it('should provide lens for anyOf schemas', async () => {
    const doc = setupTextDocument('foo: bar');
    const schema = {
      anyOf: [
        {
          url: 'some://url/schema1.json',
        },
        {
          url: 'some://url/schema2.json',
        },
      ],
    } as JSONSchema;
    yamlSchemaService.getSchemaForResource.resolves({ schema });
    const codeLens = new YamlCodeLens((yamlSchemaService as unknown) as YAMLSchemaService, telemetry);
    const result = await codeLens.getCodeLens(doc, { textDocument: { uri: doc.uri } });
    expect(result).has.length(2);
    expect(result).is.deep.equal([
      createCodeLens('schema1.json', 'some://url/schema1.json'),
      createCodeLens('schema2.json', 'some://url/schema2.json'),
    ]);
  });
});
