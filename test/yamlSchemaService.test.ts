/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as sinon from 'sinon';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
import * as path from 'path';
import * as SchemaService from '../src/languageservice/services/yamlSchemaService';
import { parse } from '../src/languageservice/parser/yamlParser07';
import { SettingsState } from '../src/yamlSettings';
import { KUBERNETES_SCHEMA_URL } from '../src/languageservice/utils/schemaUrls';

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

    it('should handle crd catalog for crd', async () => {
      const documentContent = 'apiVersion: argoproj.io/v1alpha1\nkind: Application';
      const content = `${documentContent}`;
      const yamlDock = parse(content);

      const settings = new SettingsState();
      settings.schemaAssociations = {
        kubernetes: ['*.yaml'],
      };
      settings.kubernetesCRDStoreEnabled = true;
      requestServiceMock = sandbox.fake.resolves(
        `
        {
          "oneOf": [ {
              "$ref": "_definitions.json#/definitions/io.k8s.api.admissionregistration.v1.MutatingWebhook"
            }
          ]
        }
        `
      );
      const service = new SchemaService.YAMLSchemaService(requestServiceMock, undefined, undefined, settings);
      service.registerExternalSchema(KUBERNETES_SCHEMA_URL, ['*.yaml']);
      const resolvedeSchema = await service.getSchemaForResource('test.yaml', yamlDock.documents[0]);

      expect(resolvedeSchema.schema.url).eqls(
        'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/argoproj.io/application_v1alpha1.json'
      );

      expect(requestServiceMock).calledWithExactly(KUBERNETES_SCHEMA_URL);
      expect(requestServiceMock).calledWithExactly('file:///_definitions.json');

      expect(requestServiceMock).calledWithExactly(
        'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/argoproj.io/application_v1alpha1.json'
      );
      expect(requestServiceMock).calledThrice;
    });

    it('should not get schema from crd catalog if definition in kubernetes schema', async () => {
      const documentContent = 'apiVersion: admissionregistration.k8s.io/v1\nkind: MutatingWebhook';
      const content = `${documentContent}`;
      const yamlDock = parse(content);

      const settings = new SettingsState();
      settings.schemaAssociations = {
        kubernetes: ['*.yaml'],
      };
      settings.kubernetesCRDStoreEnabled = true;
      requestServiceMock = sandbox.fake.resolves(
        `
        {
          "oneOf": [ {
              "$ref": "_definitions.json#/definitions/io.k8s.api.admissionregistration.v1.MutatingWebhook"
            }
          ]
        }
        `
      );
      const service = new SchemaService.YAMLSchemaService(requestServiceMock, undefined, undefined, settings);
      service.registerExternalSchema(KUBERNETES_SCHEMA_URL, ['*.yaml']);
      const resolvedSchema = await service.getSchemaForResource('test.yaml', yamlDock.documents[0]);
      expect(resolvedSchema.schema.url).eqls(KUBERNETES_SCHEMA_URL);

      expect(requestServiceMock).calledWithExactly(KUBERNETES_SCHEMA_URL);
      expect(requestServiceMock).calledWithExactly('file:///_definitions.json');
      expect(requestServiceMock).calledTwice;
    });

    it('should not get schema from crd catalog if definition in kubernetes schema (multiple oneOf)', async () => {
      const documentContent = 'apiVersion: apps/v1\nkind: Deployment';
      const content = `${documentContent}`;
      const yamlDock = parse(content);

      const settings = new SettingsState();
      settings.schemaAssociations = {
        kubernetes: ['*.yaml'],
      };
      settings.kubernetesCRDStoreEnabled = true;
      requestServiceMock = sandbox.fake.resolves(
        `
        {
          "oneOf": [
            {
              "$ref": "_definitions.json#/definitions/io.k8s.api.apps.v1.Deployment"
            },
            {
              "$ref": "_definitions.json#/definitions/io.k8s.api.apps.v1.DeploymentCondition"
            }
          ]
        }
        `
      );
      const service = new SchemaService.YAMLSchemaService(requestServiceMock, undefined, undefined, settings);
      service.registerExternalSchema(KUBERNETES_SCHEMA_URL, ['*.yaml']);
      const resolvedSchema = await service.getSchemaForResource('test.yaml', yamlDock.documents[0]);
      expect(resolvedSchema.schema.url).eqls(KUBERNETES_SCHEMA_URL);

      expect(requestServiceMock).calledWithExactly(KUBERNETES_SCHEMA_URL);
      expect(requestServiceMock).calledWithExactly('file:///_definitions.json');
      expect(requestServiceMock).calledTwice;
    });
  });
});
