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
});
