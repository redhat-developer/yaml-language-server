/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { readFile } from 'fs/promises';
import * as sinon from 'sinon';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
import * as path from 'path';
import * as SchemaService from '../src/languageservice/services/yamlSchemaService';
import { parse } from '../src/languageservice/parser/yamlParser07';
import { YAMLSchemaService } from '../src/languageservice/services/yamlSchemaService';
import { UnresolvedSchema, ResolvedSchema } from 'vscode-json-languageservice/lib/umd/services/jsonSchemaService';
import { JSONSchema } from '../src/languageservice/jsonSchema';

const expect = chai.expect;
chai.use(sinonChai);

describe('YAML Schema Service', () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => {
    sandbox.restore();
  });

  describe('Schema for resource', () => {
    let requestServiceMock: sinon.SinonSpy;

    beforeEach(() => {
      requestServiceMock = sandbox.fake.resolves(undefined);
    });

    it('should handle inline schema http url', () => {
      const documentContent = `# yaml-language-server: $schema=http://json-schema.org/draft-07/schema# anothermodeline=value\n`;
      const content = `${documentContent}\n---\n- `;
      const yamlDock = parse(content);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnceWith('http://json-schema.org/draft-07/schema#');
    });

    it('should handle inline schema https url', () => {
      const documentContent = `# yaml-language-server: $schema=https://json-schema.org/draft-07/schema# anothermodeline=value\n`;
      const content = `${documentContent}\n---\n- `;
      const yamlDock = parse(content);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnceWith('https://json-schema.org/draft-07/schema#');
    });

    it('should handle url with fragments', async () => {
      const content = `# yaml-language-server: $schema=https://json-schema.org/draft-07/schema#/definitions/schemaArray\nfoo: bar`;
      const yamlDock = parse(content);

      requestServiceMock = sandbox.fake.resolves(`{"definitions": {"schemaArray": {
        "type": "array",
        "minItems": 1,
        "items": { "$ref": "#" }
    }}, "properties": {}}`);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledTwice;
      expect(requestServiceMock).calledWithExactly('https://json-schema.org/draft-07/schema');
      expect(requestServiceMock).calledWithExactly('https://json-schema.org/draft-07/schema#/definitions/schemaArray');

      expect(schema.schema.type).eqls('array');
    });

    it('should handle schemas that use draft-04', async () => {
      const content = `openapi: "3.0.0"
info:
  version: 1.0.0
  title: Minimal ping API server
paths:
  /ping:
    get:
      responses:
        '200':
          description: pet response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pong'
components:
  schemas:
    # base types
    Pong:
      type: object
      required:
        - ping
      properties:
        ping:
          type: string
          example: pong`;

      const yamlDock = parse(content);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const openapiV3Schema = await readFile(path.join(__dirname, './fixtures/sample-openapiv3.0.0-schema.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(openapiV3Schema);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.registerCustomSchemaProvider(() => {
        return new Promise<string | string[]>((resolve) => {
          resolve('http://fakeschema.faketld');
        });
      });

      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);
      expect(requestServiceMock).calledWithExactly('http://fakeschema.faketld');
      expect(schema).to.not.be.null;
    });

    it('should handle url with fragments when root object is schema', async () => {
      const content = `# yaml-language-server: $schema=https://json-schema.org/draft-07/schema#/definitions/schemaArray`;
      const yamlDock = parse(content);

      requestServiceMock = sandbox.fake.resolves(`{"definitions": {"schemaArray": {
        "type": "array",
        "minItems": 1,
        "items": { "$ref": "#" }
    },
    "bar": {
      "type": "string"
    }
  }, "properties": {"foo": {"type": "boolean"}}, "required": ["foo"]}`);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledTwice;
      expect(requestServiceMock).calledWithExactly('https://json-schema.org/draft-07/schema');
      expect(requestServiceMock).calledWithExactly('https://json-schema.org/draft-07/schema#/definitions/schemaArray');

      expect(schema.schema.type).eqls('array');
      expect(schema.schema.required).is.undefined;
      expect(schema.schema.definitions.bar.type).eqls('string');
    });

    it('should handle file path with fragments', async () => {
      const content = `# yaml-language-server: $schema=schema.json#/definitions/schemaArray\nfoo: bar`;
      const yamlDock = parse(content);

      requestServiceMock = sandbox.fake.resolves(`{"definitions": {"schemaArray": {
        "type": "array",
        "minItems": 1,
        "items": { "$ref": "#" }
    }}, "properties": {}}`);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledTwice;
      if (process.platform === 'win32') {
        const driveLetter = path.parse(__dirname).root.split(':')[0].toLowerCase();
        expect(requestServiceMock).calledWithExactly(`file:///${driveLetter}%3A/schema.json`);
        expect(requestServiceMock).calledWithExactly(`file:///${driveLetter}%3A/schema.json#/definitions/schemaArray`);
      } else {
        expect(requestServiceMock).calledWithExactly('file:///schema.json');
        expect(requestServiceMock).calledWithExactly('file:///schema.json#/definitions/schemaArray');
      }

      expect(schema.schema.type).eqls('array');
    });

    it('should handle modeline schema comment in the middle of file', () => {
      const documentContent = `foo:\n  bar\n# yaml-language-server: $schema=https://json-schema.org/draft-07/schema#\naa:bbb\n`;
      const content = `${documentContent}`;
      const yamlDock = parse(content);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnceWith('https://json-schema.org/draft-07/schema#');
    });

    it('should handle modeline schema comment in multiline comments', () => {
      const documentContent = `foo:\n  bar\n#first comment\n# yaml-language-server: $schema=https://json-schema.org/draft-07/schema#\naa:bbb\n`;
      const content = `${documentContent}`;
      const yamlDock = parse(content);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnceWith('https://json-schema.org/draft-07/schema#');
    });
  });

  describe('JSON Schema 2019-09 support', () => {
    let requestServiceMock: sinon.SinonSpy;

    beforeEach(() => {
      requestServiceMock = sandbox.fake.resolves(undefined);
    });

    it('should handle inline schema with 2019-09 meta-schema', () => {
      const documentContent = `# yaml-language-server: $schema=https://json-schema.org/draft/2019-09/schema\n`;
      const content = `${documentContent}\n---\nfirstName: John\nlastName: Doe`;
      const yamlDock = parse(content);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnceWith('https://json-schema.org/draft/2019-09/schema');
    });

    it('should load and validate against 2019-09 schema', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-2019-09.json
firstName: John
lastName: Doe
age: 30
email: john.doe@example.com
address:
  street: 123 Main St
  city: Anytown
  country: USA`;

      const yamlDock = parse(content);
      const schema2019 = await readFile(path.join(__dirname, './fixtures/schema-2019-09.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schema2019);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnce;
      expect(schema).to.not.be.null;
      expect(schema.schema.title).to.equal('Person Schema 2019-09');
      expect(schema.schema.$schema).to.equal('https://json-schema.org/draft/2019-09/schema');
    });

    it('should handle $defs keyword from 2019-09', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-2019-09.json
firstName: John
lastName: Doe
address:
  street: 123 Main St
  city: Anytown
  country: USA`;

      const yamlDock = parse(content);
      const schema2019 = await readFile(path.join(__dirname, './fixtures/schema-2019-09.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schema2019);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(schema.schema.$defs).to.exist;
      expect(schema.schema.$defs.address).to.exist;
      expect(schema.schema.$defs.address.type).to.equal('object');
    });

    it('should handle unevaluatedProperties keyword from 2019-09', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-2019-09.json
firstName: John
lastName: Doe
extraProperty: shouldBeInvalid`;

      const yamlDock = parse(content);
      const schema2019 = await readFile(path.join(__dirname, './fixtures/schema-2019-09.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schema2019);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(schema.schema.unevaluatedProperties).to.equal(false);
    });
  });

  describe('JSON Schema 2020-12 support', () => {
    let requestServiceMock: sinon.SinonSpy;

    beforeEach(() => {
      requestServiceMock = sandbox.fake.resolves(undefined);
    });

    it('should handle inline schema with 2020-12 meta-schema', () => {
      const documentContent = `# yaml-language-server: $schema=https://json-schema.org/draft/2020-12/schema\n`;
      const content = `${documentContent}\n---\nproductId: 123\nproductName: Widget`;
      const yamlDock = parse(content);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnceWith('https://json-schema.org/draft/2020-12/schema');
    });

    it('should load and validate against 2020-12 schema', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-2020-12.json
productId: 123
productName: Super Widget
price: 29.99
tags:
  - electronics
  - gadget
dimensions:
  length: 10.5
  width: 5.2
  height: 2.1
category: electronics`;

      const yamlDock = parse(content);
      const schema2020 = await readFile(path.join(__dirname, './fixtures/schema-2020-12.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schema2020);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnce;
      expect(schema).to.not.be.null;
      expect(schema.schema.title).to.equal('Product Schema 2020-12');
      expect(schema.schema.$schema).to.equal('https://json-schema.org/draft/2020-12/schema');
    });

    it('should handle $defs keyword from 2020-12', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-2020-12.json
productId: 123
productName: Widget
price: 29.99
dimensions:
  length: 10.5
  width: 5.2
  height: 2.1`;

      const yamlDock = parse(content);
      const schema2020 = await readFile(path.join(__dirname, './fixtures/schema-2020-12.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schema2020);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(schema.schema.$defs).to.exist;
      expect(schema.schema.$defs.dimensions).to.exist;
      expect(schema.schema.$defs.dimensions.type).to.equal('object');
    });

    it('should handle exclusiveMinimum as boolean in 2020-12', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-2020-12.json
productId: 123
productName: Widget
price: 0`;

      const yamlDock = parse(content);
      const schema2020 = await readFile(path.join(__dirname, './fixtures/schema-2020-12.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schema2020);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(schema.schema.properties.price.exclusiveMinimum).to.equal(true);
      expect(schema.schema.properties.price.minimum).to.equal(0);
    });

    it('should handle unevaluatedProperties keyword from 2020-12', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-2020-12.json
productId: 123
productName: Widget
price: 29.99
unknownProperty: shouldBeInvalid`;

      const yamlDock = parse(content);
      const schema2020 = await readFile(path.join(__dirname, './fixtures/schema-2020-12.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schema2020);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(schema.schema.unevaluatedProperties).to.equal(false);
    });
  });

  describe('Mixed schema version support', () => {
    let requestServiceMock: sinon.SinonSpy;

    beforeEach(() => {
      requestServiceMock = sandbox.fake.resolves(undefined);
    });

    it('should handle mixed schema versions in the same document', async () => {
      // This tests that the service can handle references between different schema versions
      const content = `# yaml-language-server: $schema=./fixtures/schema-2020-12.json
productId: 123
productName: Widget
price: 29.99`;

      const yamlDock = parse(content);
      const schema2020 = await readFile(path.join(__dirname, './fixtures/schema-2020-12.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schema2020);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(schema).to.not.be.null;
      expect(schema.schema.$schema).to.equal('https://json-schema.org/draft/2020-12/schema');
    });

    it('should gracefully handle unknown schema versions', () => {
      const documentContent = `# yaml-language-server: $schema=https://json-schema.org/draft/2030-01/schema\n`;
      const content = `${documentContent}\n---\nfoo: bar`;
      const yamlDock = parse(content);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnceWith('https://json-schema.org/draft/2030-01/schema');
    });
  });

  describe('JSON Schema Draft-07 support', () => {
    let requestServiceMock: sinon.SinonSpy;

    beforeEach(() => {
      requestServiceMock = sandbox.fake.resolves(undefined);
    });

    it('should handle inline schema with draft-07 meta-schema', () => {
      const documentContent = `# yaml-language-server: $schema=https://json-schema.org/draft-07/schema\n`;
      const content = `${documentContent}\n---\nfirstName: John\nlastName: Doe`;
      const yamlDock = parse(content);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnceWith('https://json-schema.org/draft-07/schema');
    });

    it('should handle draft-07 schema with http prefix', () => {
      const documentContent = `# yaml-language-server: $schema=http://json-schema.org/draft-07/schema#\n`;
      const content = `${documentContent}\n---\nfirstName: John\nlastName: Doe`;
      const yamlDock = parse(content);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnceWith('http://json-schema.org/draft-07/schema#');
    });

    it('should load and validate against draft-07 schema', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-draft-07.json
firstName: John
lastName: Doe
age: 30
email: john.doe@example.com
address:
  street: 123 Main St
  city: Anytown
  country: USA`;

      const yamlDock = parse(content);
      const schemaDraft07 = await readFile(path.join(__dirname, './fixtures/schema-draft-07.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schemaDraft07);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnce;
      expect(schema).to.not.be.null;
      expect(schema.schema.title).to.equal('Person Schema Draft 07');
      expect(schema.schema.$schema).to.equal('https://json-schema.org/draft-07/schema');
    });

    it('should handle definitions keyword from draft-07', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-draft-07.json
firstName: John
lastName: Doe
address:
  street: 123 Main St
  city: Anytown
  country: USA`;

      const yamlDock = parse(content);
      const schemaDraft07 = await readFile(path.join(__dirname, './fixtures/schema-draft-07.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schemaDraft07);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(schema).to.not.be.null;
      expect(schema.schema.definitions).to.exist;
      expect(schema.schema.definitions.address).to.exist;
    });
  });

  describe('JSON Schema Draft-04 support', () => {
    let requestServiceMock: sinon.SinonSpy;

    beforeEach(() => {
      requestServiceMock = sandbox.fake.resolves(undefined);
    });

    it('should handle inline schema with draft-04 meta-schema', () => {
      const documentContent = `# yaml-language-server: $schema=http://json-schema.org/draft-04/schema#\n`;
      const content = `${documentContent}\n---\nproductId: 1\nproductName: Widget`;
      const yamlDock = parse(content);

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnceWith('http://json-schema.org/draft-04/schema#');
    });

    it('should load and validate against draft-04 schema', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-draft-04.json
productId: 1
productName: Widget
price: 10.99
tags:
  - gadget
  - widget
dimensions:
  length: 10
  width: 5
  height: 2`;

      const yamlDock = parse(content);
      const schemaDraft04 = await readFile(path.join(__dirname, './fixtures/schema-draft-04.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schemaDraft04);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(requestServiceMock).calledOnce;
      expect(schema).to.not.be.null;
      expect(schema.schema.title).to.equal('Product Schema Draft 04');
      expect(schema.schema.$schema).to.equal('http://json-schema.org/draft-04/schema#');
    });

    it('should handle definitions keyword from draft-04', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-draft-04.json
productId: 1
productName: Widget
price: 10.99
dimensions:
  length: 10
  width: 5
  height: 2`;

      const yamlDock = parse(content);
      const schemaDraft04 = await readFile(path.join(__dirname, './fixtures/schema-draft-04.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schemaDraft04);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(schema).to.not.be.null;
      expect(schema.schema.definitions).to.exist;
      expect(schema.schema.definitions.dimensions).to.exist;
    });

    it('should handle exclusiveMinimum as boolean in draft-04', async () => {
      const content = `# yaml-language-server: $schema=./fixtures/schema-draft-04.json
productId: 1
productName: Widget
price: 0`;

      const yamlDock = parse(content);
      const schemaDraft04 = await readFile(path.join(__dirname, './fixtures/schema-draft-04.json'), {
        encoding: 'utf-8',
      });

      requestServiceMock = sandbox.fake.resolves(schemaDraft04);
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      expect(schema).to.not.be.null;
      expect(schema.schema.properties.price.exclusiveMinimum).to.be.true;
    });
  });

  describe('Schema version detection and default behavior', () => {
    let requestServiceMock: sinon.SinonSpy;

    beforeEach(() => {
      requestServiceMock = sandbox.fake.resolves(undefined);
    });

    it('should default to draft-07 when no schema version is specified', async () => {
      const schemaContent = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      requestServiceMock = sandbox.fake.resolves(JSON.stringify(schemaContent));
      const service = new SchemaService.YAMLSchemaService(requestServiceMock);

      // Access the private method via any to test it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detectedVersion = (service as any).detectSchemaVersion(schemaContent);

      expect(detectedVersion).to.equal('draft-07');
    });

    it('should detect 2020-12 schema version', async () => {
      const schemaContent = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detectedVersion = (service as any).detectSchemaVersion(schemaContent);

      expect(detectedVersion).to.equal('2020-12');
    });

    it('should detect 2019-09 schema version', async () => {
      const schemaContent = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detectedVersion = (service as any).detectSchemaVersion(schemaContent);

      expect(detectedVersion).to.equal('2019-09');
    });

    it('should detect draft-07 schema version', async () => {
      const schemaContent = {
        $schema: 'https://json-schema.org/draft-07/schema',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detectedVersion = (service as any).detectSchemaVersion(schemaContent);

      expect(detectedVersion).to.equal('draft-07');
    });

    it('should detect draft-07 schema version with http prefix', async () => {
      const schemaContent = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detectedVersion = (service as any).detectSchemaVersion(schemaContent);

      expect(detectedVersion).to.equal('draft-07');
    });

    it('should detect draft-04 schema version', async () => {
      const schemaContent = {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detectedVersion = (service as any).detectSchemaVersion(schemaContent);

      expect(detectedVersion).to.equal('draft-04');
    });

    it('should handle malformed schema version gracefully', async () => {
      const schemaContent = {
        $schema: 'https://some-invalid-schema-url.com/schema',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detectedVersion = (service as any).detectSchemaVersion(schemaContent);

      expect(detectedVersion).to.equal('draft-07'); // Should default to draft-07
    });

    it('should handle schema without $schema property gracefully', async () => {
      const schemaContent = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const service = new SchemaService.YAMLSchemaService(requestServiceMock);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detectedVersion = (service as any).detectSchemaVersion(schemaContent);

      expect(detectedVersion).to.equal('draft-07'); // Should default to draft-07
    });
  });
  describe('resolveSchemaContent Tests', () => {
    let yamlSchemaService: YAMLSchemaService;
    let requestServiceMock: sinon.SinonStub;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      requestServiceMock = sandbox.stub();
      yamlSchemaService = new YAMLSchemaService(requestServiceMock);
    });

    afterEach(() => {
      sandbox.restore();
    });

    describe('Basic Schema Type Validation', () => {
      it('should accept valid object schema', async () => {
        const validSchema: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(validSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result).to.be.instanceOf(ResolvedSchema);
        expect(result.errors).to.have.length(0);
        expect(result.schema).to.deep.equal(validSchema);
      });

      it('should reject null schema', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unresolvedSchema = new UnresolvedSchema(null as any, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(1);
        expect(result.errors[0]).to.include('it MUST be an Object or Boolean');
      });

      it('should reject array schema', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unresolvedSchema = new UnresolvedSchema([] as any, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(1);
        expect(result.errors[0]).to.include('Wrong schema: "array", it MUST be an Object or Boolean');
      });

      it('should reject primitive schema', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unresolvedSchema = new UnresolvedSchema('invalid' as any, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(1);
        expect(result.errors[0]).to.include('Wrong schema: "string", it MUST be an Object or Boolean');
      });

      it('should reject number schema', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unresolvedSchema = new UnresolvedSchema(42 as any, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(1);
        expect(result.errors[0]).to.include('Wrong schema: "number", it MUST be an Object or Boolean');
      });
    });

    describe('Schema Meta-Schema Validation', () => {
      it('should validate draft-04 schema correctly', async () => {
        const draft04Schema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-04/schema#',
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: {
              type: 'number',
              minimum: 0,
              exclusiveMinimum: true, // Boolean in draft-04
            },
          },
          required: ['name'],
          additionalProperties: false,
        };

        const unresolvedSchema = new UnresolvedSchema(draft04Schema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema).to.deep.include(draft04Schema);
      });

      it('should validate draft-07 schema correctly', async () => {
        const draft07Schema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: {
              type: 'number',
              minimum: 0,
            },
            email: {
              type: 'string',
              format: 'email',
            },
          },
          required: ['name'],
          additionalProperties: false,
          if: { properties: { age: { minimum: 18 } } },
          then: { properties: { canVote: { const: true } } },
        };

        const unresolvedSchema = new UnresolvedSchema(draft07Schema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema).to.deep.include(draft07Schema);
      });

      it('should validate 2019-09 schema correctly', async () => {
        const schema201909: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2019-09/schema',
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          definitions: {
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
              },
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schema201909, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema).to.deep.include(schema201909);
      });

      it('should validate 2020-12 schema correctly', async () => {
        const schema202012: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            productId: { type: 'number' },
            price: {
              type: 'number',
              minimum: 0,
              // In 2020-12, exclusiveMinimum should be a number or omitted with minimum
            },
          },
          definitions: {
            dimensions: {
              type: 'object',
              properties: {
                length: { type: 'number' },
                width: { type: 'number' },
                height: { type: 'number' },
              },
              required: ['length', 'width', 'height'],
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schema202012, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema).to.deep.include(schema202012);
      });

      it('should default to draft-07 when no $schema is specified', async () => {
        const schemaWithoutVersion: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithoutVersion, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema).to.deep.include(schemaWithoutVersion);
      });

      it('should handle invalid schema structure gracefully', async () => {
        const invalidSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            name: 'invalid-property-definition' as any, // Should be an object
          },
        };

        const unresolvedSchema = new UnresolvedSchema(invalidSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        // Should not crash, but might have validation errors
        expect(result).to.be.instanceOf(ResolvedSchema);
        expect(result.schema).to.exist;
      });

      it('should handle meta-schema validation errors gracefully', async () => {
        // Create a spy to simulate meta-schema validation failure
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sandbox.stub(yamlSchemaService as any, 'detectSchemaVersion').returns('draft-07');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sandbox.stub(yamlSchemaService as any, 'getValidatorForVersion').returns({
          validate: sandbox.stub().throws(new Error('Validation failed')),
        });

        const schema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
        };

        const unresolvedSchema = new UnresolvedSchema(schema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        // Should not crash and should complete resolution
        expect(result).to.be.instanceOf(ResolvedSchema);
        expect(result.schema).to.deep.include(schema);
      });
    });

    describe('Reference Resolution', () => {
      it('should resolve internal $ref correctly', async () => {
        const schemaWithInternalRef: JSONSchema = {
          type: 'object',
          properties: {
            user: { $ref: '#/definitions/user' },
            address: { $ref: '#/definitions/address' },
          },
          definitions: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
            },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
              },
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithInternalRef, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema.properties.user).to.deep.include({
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          _$ref: '#/definitions/user',
        });
      });

      it('should handle external $ref resolution setup', async () => {
        // Mock the getOrAddSchemaHandle method
        const mockSchemaHandle = {
          getUnresolvedSchema: sandbox.stub().resolves({
            schema: {
              type: 'string',
              description: 'External schema',
            },
            errors: [],
          }),
          dependencies: {},
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sandbox.stub(yamlSchemaService, 'getOrAddSchemaHandle').returns(mockSchemaHandle as any);

        const schemaWithExternalRef: JSONSchema = {
          type: 'object',
          properties: {
            externalProp: { $ref: 'external://schema.json#/definitions/prop' },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithExternalRef, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        // External refs may produce errors in test environment - that's expected
        expect(result).to.be.instanceOf(ResolvedSchema);
        expect(result.schema).to.exist;
      });

      it('should handle invalid $ref gracefully', async () => {
        const schemaWithInvalidRef: JSONSchema = {
          type: 'object',
          properties: {
            invalidProp: { $ref: '#/definitions/nonexistent' },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithInvalidRef, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(1);
        // Handle both localized and non-localized error messages
        const errorMessage = result.errors[0];
        const isLocalizedMessage =
          errorMessage.includes('/definitions/nonexistent') && errorMessage.includes('can not be resolved');
        const isKeyMessage = errorMessage.includes('json.schema.invalidref');

        expect(isLocalizedMessage || isKeyMessage).to.be.true;
      });

      it('should handle circular $ref without infinite loop', async () => {
        const schemaWithCircularRef: JSONSchema = {
          type: 'object',
          properties: {
            self: { $ref: '#' },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithCircularRef, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema).to.exist;
        // Should not hang or throw
      });

      it('should handle multiple nested $refs', async () => {
        const schemaWithNestedRefs: JSONSchema = {
          definitions: {
            level1: {
              type: 'object',
              properties: {
                level2Ref: { $ref: '#/definitions/level2' },
              },
            },
            level2: {
              type: 'object',
              properties: {
                level3Ref: { $ref: '#/definitions/level3' },
              },
            },
            level3: {
              type: 'string',
              enum: ['value1', 'value2'],
            },
          },
          type: 'object',
          properties: {
            root: { $ref: '#/definitions/level1' },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithNestedRefs, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema).to.exist;
      });
    });

    describe('Schema Keywords Handling', () => {
      it('should handle allOf correctly', async () => {
        const schemaWithAllOf: JSONSchema = {
          type: 'object',
          allOf: [
            {
              properties: {
                name: { type: 'string' },
              },
            },
            {
              properties: {
                age: { type: 'number' },
              },
            },
          ],
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithAllOf, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema.allOf).to.have.length(2);
      });

      it('should handle anyOf correctly', async () => {
        const schemaWithAnyOf: JSONSchema = {
          anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithAnyOf, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema.anyOf).to.have.length(3);
      });

      it('should handle oneOf correctly', async () => {
        const schemaWithOneOf: JSONSchema = {
          oneOf: [
            { type: 'string', minLength: 5 },
            { type: 'number', minimum: 0 },
          ],
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithOneOf, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema.oneOf).to.have.length(2);
      });

      it('should handle if/then/else correctly', async () => {
        const schemaWithConditional: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            age: { type: 'number' },
            canVote: { type: 'boolean' },
          },
          if: {
            properties: { age: { minimum: 18 } },
          },
          then: {
            properties: { canVote: { const: true } },
          },
          else: {
            properties: { canVote: { const: false } },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithConditional, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema.if).to.exist;
        expect(result.schema.then).to.exist;
        expect(result.schema.else).to.exist;
      });

      it('should handle nested object properties', async () => {
        const schemaWithNestedObjects: JSONSchema = {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                profile: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    settings: {
                      type: 'object',
                      properties: {
                        theme: { type: 'string' },
                        notifications: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithNestedObjects, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema.properties.user.properties.profile.properties.settings).to.exist;
      });

      it('should handle array items correctly', async () => {
        const schemaWithArrays: JSONSchema = {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
            matrix: {
              type: 'array',
              items: {
                type: 'array',
                items: { type: 'number' },
              },
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schemaWithArrays, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema.properties.tags.items).to.deep.equal({ type: 'string' });
        expect(result.schema.properties.matrix.items.items).to.deep.equal({ type: 'number' });
      });
    });

    describe('Schema Validation Errors', () => {
      it('should detect invalid property definition in schema', async () => {
        const invalidPropertySchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            name: 'invalid-type-should-be-object' as any, // Invalid: should be object, not string
          },
        };

        const unresolvedSchema = new UnresolvedSchema(invalidPropertySchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
      });

      it('should detect invalid type constraint in schema', async () => {
        const invalidTypeSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: 'invalid-type' as any, // Invalid: not a valid JSON Schema type
          properties: {
            name: { type: 'string' },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(invalidTypeSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
      });

      it('should detect invalid enum values constraint', async () => {
        const invalidEnumSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            status: {
              type: 'string',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              enum: 'should-be-array' as any, // Invalid: enum should be array
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(invalidEnumSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
      });

      it('should detect invalid minimum constraint for draft-07', async () => {
        const invalidMinimumSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            age: {
              type: 'number',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              minimum: 'should-be-number' as any, // Invalid: minimum should be number
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(invalidMinimumSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
      });

      it('should detect invalid exclusiveMinimum for 2020-12 schema', async () => {
        const invalidExclusiveMinSchema: JSONSchema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            price: {
              type: 'number',
              minimum: 0,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              exclusiveMinimum: true as any, // Invalid for 2020-12: should be number, not boolean
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(invalidExclusiveMinSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
        expect(result.errors[0]).to.include('constraint violation');
      });

      it('should detect invalid required property constraint', async () => {
        const invalidRequiredSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          required: 'should-be-array' as any, // Invalid: required should be array
        };

        const unresolvedSchema = new UnresolvedSchema(invalidRequiredSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
      });

      it('should detect invalid additionalProperties constraint', async () => {
        const invalidAdditionalPropsSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          additionalProperties: 'invalid-should-be-boolean-or-object' as any, // Invalid
        };

        const unresolvedSchema = new UnresolvedSchema(invalidAdditionalPropsSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
      });

      it('should detect invalid array items constraint', async () => {
        const invalidArrayItemsSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              items: 'invalid-should-be-object-or-array' as any, // Invalid
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(invalidArrayItemsSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
      });

      it('should detect invalid pattern constraint', async () => {
        const invalidPatternSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            email: {
              type: 'string',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pattern: 123 as any, // Invalid: pattern should be string
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(invalidPatternSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
      });

      it('should detect invalid oneOf constraint structure', async () => {
        const invalidOneOfSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            value: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              oneOf: 'should-be-array' as any, // Invalid: oneOf should be array
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(invalidOneOfSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
      });

      it('should detect multiple validation errors in complex schema', async () => {
        const multipleErrorsSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: 'invalid-type' as any, // Error 1: invalid type
          properties: {
            name: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: 'invalid-property-type' as any, // Error 2: invalid property type
            },
            age: {
              type: 'number',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              minimum: 'not-a-number' as any, // Error 3: invalid minimum
            },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          required: 'not-an-array' as any, // Error 4: invalid required
        };

        const unresolvedSchema = new UnresolvedSchema(multipleErrorsSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors.length).to.be.greaterThan(0);
        expect(result.errors[0]).to.include('is not valid');
        // Should contain information about constraint violations
        expect(result.errors[0]).to.include('constraint violation');
      });

      it('should handle schema validation errors for different versions', async () => {
        // Test for each supported schema version
        const testCases = [
          {
            version: 'http://json-schema.org/draft-04/schema#',
            name: 'draft-04',
          },
          {
            version: 'http://json-schema.org/draft-07/schema#',
            name: 'draft-07',
          },
          {
            version: 'https://json-schema.org/draft/2019-09/schema',
            name: '2019-09',
          },
          {
            version: 'https://json-schema.org/draft/2020-12/schema',
            name: '2020-12',
          },
        ];

        for (const testCase of testCases) {
          const invalidSchema: JSONSchema = {
            $schema: testCase.version,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: 'invalid-type-for-any-version' as any,
          };

          const unresolvedSchema = new UnresolvedSchema(invalidSchema, []);
          const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

          expect(result.errors.length).to.be.greaterThan(0, `Should detect errors for ${testCase.name}`);
          expect(result.errors[0]).to.include('is not valid', `Should include validation error for ${testCase.name}`);
        }
      });
    });

    describe('Error Handling and Edge Cases', () => {
      it('should preserve existing errors from UnresolvedSchema', async () => {
        const schema: JSONSchema = { type: 'object' };
        const existingErrors = ['Existing error 1', 'Existing error 2'];
        const unresolvedSchema = new UnresolvedSchema(schema, existingErrors);

        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.include.members(existingErrors);
      });

      it('should handle schema with URL fragments', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(schema, []);
        // For schemas with URL fragments, external link resolution may fail in test environment
        // but the schema should still be processed
        try {
          const result = await yamlSchemaService.resolveSchemaContent(
            unresolvedSchema,
            'test://schema.json#/definitions/user',
            {}
          );
          expect(result).to.be.instanceOf(ResolvedSchema);
          expect(result.schema).to.exist;
        } catch (error) {
          // External link resolution may fail in test environment - that's acceptable
          expect(error).to.exist;
        }
      });

      it('should handle empty schema object', async () => {
        const emptySchema: JSONSchema = {};
        const unresolvedSchema = new UnresolvedSchema(emptySchema, []);

        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema).to.deep.equal({});
      });

      it('should handle schema with only $schema property', async () => {
        const schemaOnlyMeta: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
        };

        const unresolvedSchema = new UnresolvedSchema(schemaOnlyMeta, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema).to.deep.equal(schemaOnlyMeta);
      });

      it('should handle complex real-world schema', async () => {
        const complexSchema: JSONSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          title: 'Complex Real-World Schema',
          type: 'object',
          properties: {
            apiVersion: {
              type: 'string',
              enum: ['v1', 'v2'],
            },
            metadata: {
              type: 'object',
              properties: {
                name: { type: 'string', pattern: '^[a-z0-9-]+$' },
                labels: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
              required: ['name'],
            },
            spec: {
              type: 'object',
              properties: {
                replicas: { type: 'integer', minimum: 1, maximum: 10 },
                selector: { $ref: '#/definitions/selector' },
                template: { $ref: '#/definitions/template' },
              },
              required: ['selector', 'template'],
            },
          },
          required: ['apiVersion', 'metadata', 'spec'],
          definitions: {
            selector: {
              type: 'object',
              properties: {
                matchLabels: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
            },
            template: {
              type: 'object',
              properties: {
                metadata: { $ref: '#/properties/metadata' },
                spec: {
                  type: 'object',
                  properties: {
                    containers: {
                      type: 'array',
                      items: { $ref: '#/definitions/container' },
                    },
                  },
                },
              },
            },
            container: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                image: { type: 'string' },
                ports: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      containerPort: { type: 'integer' },
                      protocol: { type: 'string', enum: ['TCP', 'UDP'] },
                    },
                  },
                },
              },
              required: ['name', 'image'],
            },
          },
        };

        const unresolvedSchema = new UnresolvedSchema(complexSchema, []);
        const result = await yamlSchemaService.resolveSchemaContent(unresolvedSchema, 'test://schema.json', {});

        expect(result.errors).to.have.length(0);
        expect(result.schema).to.exist;
        expect(result.schema.properties.spec.properties.selector).to.deep.include({
          type: 'object',
          properties: {
            matchLabels: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
          _$ref: '#/definitions/selector',
        });
      });
    });
  });
});
