/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as sinon from 'sinon';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
import * as path from 'path';
import * as url from 'url';
import * as SchemaService from '../src/languageservice/services/yamlSchemaService';
import { parse } from '../src/languageservice/parser/yamlParser07';
import { SettingsState } from '../src/yamlSettings';
import { BASE_KUBERNETES_SCHEMA_URL, KUBERNETES_SCHEMA_URL } from '../src/languageservice/utils/schemaUrls';

const expect = chai.expect;
chai.use(sinonChai);
const workspaceContext = {
  resolveRelativePath: (relativePath: string, resource: string) => {
    return url.resolve(resource, relativePath);
  },
};

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

    it('should use local sibling schema path before remote $id ref', async () => {
      const content = `# yaml-language-server: $schema=file:///schemas/primary.json\nmode: stage`;
      const yamlDock = parse(content);

      const primarySchema = {
        $id: 'https://example.com/schemas/primary.json',
        type: 'object',
        properties: {
          mode: { $ref: 'secondary.json' },
        },
        required: ['mode'],
      };
      const secondarySchema = {
        $id: 'https://example.com/schemas/secondary.json',
        type: 'string',
        enum: ['dev', 'prod'],
      };

      requestServiceMock = sandbox.fake((uri: string) => {
        if (uri === 'file:///schemas/primary.json') {
          return Promise.resolve(JSON.stringify(primarySchema));
        }
        if (uri === 'file:///schemas/secondary.json') {
          return Promise.resolve(JSON.stringify(secondarySchema));
        }
        return Promise.reject<string>(`Resource ${uri} not found.`);
      });

      const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
      await service.getSchemaForResource('', yamlDock.documents[0]);

      const requestedUris = requestServiceMock.getCalls().map((call) => call.args[0]);
      expect(requestedUris).to.include('file:///schemas/primary.json');
      expect(requestedUris).to.include('file:///schemas/secondary.json');
      expect(requestedUris).to.not.include('https://example.com/schemas/secondary.json');
    });

    it('should resolve relative local sibling refs when the root $id basename differs from the local filename', async () => {
      const content =
        `# yaml-language-server: $schema=file:///schemas/repro_main_schema.json\n` +
        `members:\n` +
        `  - name: Alice\n` +
        `    age: 30`;
      const yamlDock = parse(content);

      const primarySchema = {
        $id: 'https://example.com/schemas/repro-main-v1',
        type: 'object',
        properties: {
          members: {
            type: 'array',
            items: {
              $ref: './repro_defs.json#/$defs/Person',
            },
          },
        },
        required: ['members'],
      };
      const defsSchema = {
        $id: 'https://example.com/schemas/repro-defs-v1',
        $defs: {
          Person: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' },
            },
            required: ['name'],
          },
        },
      };

      requestServiceMock = sandbox.fake((uri: string) => {
        if (uri === 'file:///schemas/repro_main_schema.json') {
          return Promise.resolve(JSON.stringify(primarySchema));
        }
        if (uri === 'file:///schemas/repro_defs.json') {
          return Promise.resolve(JSON.stringify(defsSchema));
        }
        return Promise.reject<string>(`Resource ${uri} not found.`);
      });

      const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      const requestedUris = requestServiceMock.getCalls().map((call) => call.args[0]);
      expect(requestedUris).to.include('file:///schemas/repro_main_schema.json');
      expect(requestedUris).to.include('file:///schemas/repro_defs.json');
      expect(requestedUris).to.not.include('https://example.com/schemas/repro_defs.json');
      expect(schema.errors).to.eql([]);
      expect(schema.schema.properties.members.items).to.deep.include({
        type: 'object',
        url: 'file:///schemas/repro_defs.json',
      });
    });

    it('should resolve nested local sibling refs relative to the loaded sibling schema file', async () => {
      const content = `# yaml-language-server: $schema=file:///schemas/primary.json\nitem: ok`;
      const yamlDock = parse(content);

      const primarySchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://example.com/schemas/primary-v1',
        $ref: './secondary.json',
      };
      const secondarySchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://example.com/schemas/secondary-v1',
        type: 'object',
        properties: {
          item: {
            $ref: './third.json',
          },
        },
        required: ['item'],
      };
      const thirdSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://example.com/schemas/third-v1',
        type: 'string',
        enum: ['ok'],
      };

      requestServiceMock = sandbox.fake((uri: string) => {
        if (uri === 'file:///schemas/primary.json') {
          return Promise.resolve(JSON.stringify(primarySchema));
        }
        if (uri === 'file:///schemas/secondary.json') {
          return Promise.resolve(JSON.stringify(secondarySchema));
        }
        if (uri === 'file:///schemas/third.json') {
          return Promise.resolve(JSON.stringify(thirdSchema));
        }
        return Promise.reject<string>(`Resource ${uri} not found.`);
      });

      const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
      const schema = await service.getSchemaForResource('', yamlDock.documents[0]);

      const requestedUris = requestServiceMock.getCalls().map((call) => call.args[0]);
      expect(requestedUris).to.include('file:///schemas/primary.json');
      expect(requestedUris).to.include('file:///schemas/secondary.json');
      expect(requestedUris).to.include('file:///schemas/third.json');
      expect(requestedUris).to.not.include('https://example.com/schemas/secondary.json');
      expect(requestedUris).to.not.include('https://example.com/schemas/third.json');
      expect(schema.errors).to.eql([]);
      expect(schema.schema.properties.item).to.deep.include({
        type: 'string',
        url: 'file:///schemas/third.json',
      });
    });

    it('should resolve absolute $ref via remote base and mapped local sibling path', async () => {
      const content = `# yaml-language-server: $schema=file:///dir/primary.json\nname: John\nage: -1`;
      const yamlDock = parse(content);

      const primarySchema = {
        $id: 'https://example.com/schemas/primary.json',
        $ref: '/schemas/secondary.json',
      };
      const secondarySchema = {
        $id: 'https://example.com/schemas/secondary.json',
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer', minimum: 0 },
        },
        required: ['name', 'age'],
      };

      requestServiceMock = sandbox.fake((uri: string) => {
        if (uri === 'file:///dir/primary.json') {
          return Promise.resolve(JSON.stringify(primarySchema));
        }
        if (uri === 'file:///dir/secondary.json') {
          return Promise.resolve(JSON.stringify(secondarySchema));
        }
        return Promise.reject<string>(`Resource ${uri} not found.`);
      });

      const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
      await service.getSchemaForResource('', yamlDock.documents[0]);

      const requestedUris = requestServiceMock.getCalls().map((call) => call.args[0]);
      expect(requestedUris).to.include('file:///dir/primary.json');
      expect(requestedUris).to.include('file:///dir/secondary.json');
      expect(requestedUris).to.not.include('file:///schemas/secondary.json');
      expect(requestedUris).to.not.include('https://example.com/schemas/secondary.json');
    });

    it('should fallback to remote $id target for absolute $ref when mapped local target is missing', async () => {
      const content = `# yaml-language-server: $schema=file:///dir/primary.json\nname: John\nage: -1`;
      const yamlDock = parse(content);

      const primarySchema = {
        $id: 'https://example.com/schemas/primary.json',
        $ref: '/schemas/secondary.json',
      };
      const secondarySchema = {
        $id: 'https://example.com/schemas/secondary.json',
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer', minimum: 0 },
        },
        required: ['name', 'age'],
      };

      requestServiceMock = sandbox.fake((uri: string) => {
        if (uri === 'file:///dir/primary.json') {
          return Promise.resolve(JSON.stringify(primarySchema));
        }
        if (uri === 'https://example.com/schemas/secondary.json') {
          return Promise.resolve(JSON.stringify(secondarySchema));
        }
        return Promise.reject<string>(`Resource ${uri} not found.`);
      });

      const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
      await service.getSchemaForResource('', yamlDock.documents[0]);

      const requestedUris = requestServiceMock.getCalls().map((call) => call.args[0]);
      expect(requestedUris).to.include('file:///dir/primary.json');
      expect(requestedUris).to.include('file:///dir/secondary.json');
      expect(requestedUris).to.include('https://example.com/schemas/secondary.json');
      expect(requestedUris).to.not.include('file:///schemas/secondary.json');
      expect(requestedUris.indexOf('file:///dir/secondary.json')).to.be.lessThan(
        requestedUris.indexOf('https://example.com/schemas/secondary.json')
      );
    });

    it('should reload local schema after local file change when resolving via local sibling path instead of remote $id', async () => {
      const content = `# yaml-language-server: $schema=file:///schemas/primary.json\nmode: stage`;
      const yamlDock = parse(content);

      const primarySchema = {
        $id: 'https://example.com/schemas/primary.json',
        type: 'object',
        properties: {
          mode: { $ref: 'secondary.json' },
        },
        required: ['mode'],
      };
      let secondarySchema = {
        $id: 'https://example.com/schemas/secondary.json',
        type: 'string',
        enum: ['dev', 'prod'],
      };

      requestServiceMock = sandbox.fake((uri: string) => {
        if (uri === 'file:///schemas/primary.json') {
          return Promise.resolve(JSON.stringify(primarySchema));
        }
        if (uri === 'file:///schemas/secondary.json') {
          return Promise.resolve(JSON.stringify(secondarySchema));
        }
        return Promise.reject<string>(`Resource ${uri} not found.`);
      });

      const service = new SchemaService.YAMLSchemaService(requestServiceMock, workspaceContext);
      await service.getSchemaForResource('', yamlDock.documents[0]);

      const requestedSecondaryUrisAfterFirstLoad = requestServiceMock
        .getCalls()
        .map((call) => call.args[0])
        .filter((uri) => uri === 'file:///schemas/secondary.json');
      expect(requestedSecondaryUrisAfterFirstLoad).to.have.length(1);

      secondarySchema = { ...secondarySchema, enum: ['dev', 'prod', 'stage'] };
      service.onResourceChange('file:///schemas/secondary.json');
      await service.getSchemaForResource('', yamlDock.documents[0]);

      const requestedSecondaryUrisAfterChange = requestServiceMock
        .getCalls()
        .map((call) => call.args[0])
        .filter((uri) => uri === 'file:///schemas/secondary.json');
      expect(requestedSecondaryUrisAfterChange).to.have.length(2);
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

    it('should handle nonstandard location for OpenShift crd', async () => {
      const documentContent = `apiVersion: route.openshift.io/v1
kind: Route
spec:
  to:
    kind: Service
    name: MyFirstService
    weight: 100`;
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
        'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/openshift/v4.15-strict/route_route.openshift.io_v1.json'
      );

      expect(requestServiceMock).calledWithExactly(KUBERNETES_SCHEMA_URL);
      expect(requestServiceMock).calledWithExactly('file:///_definitions.json');

      expect(requestServiceMock).calledWithExactly(
        'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/openshift/v4.15-strict/route_route.openshift.io_v1.json'
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
      expect(resolvedSchema.schema.url).eqls(
        BASE_KUBERNETES_SCHEMA_URL + '_definitions.json#/definitions/io.k8s.api.admissionregistration.v1.MutatingWebhook'
      );

      expect(requestServiceMock).calledWithExactly(KUBERNETES_SCHEMA_URL);
      expect(requestServiceMock).calledWithExactly('file:///_definitions.json');
      expect(requestServiceMock).calledWithExactly(
        BASE_KUBERNETES_SCHEMA_URL + '_definitions.json#/definitions/io.k8s.api.admissionregistration.v1.MutatingWebhook'
      );
      expect(requestServiceMock).calledWithExactly(BASE_KUBERNETES_SCHEMA_URL + '_definitions.json');
      expect(requestServiceMock.callCount).equals(4);
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
      expect(resolvedSchema.schema.url).eqls(
        BASE_KUBERNETES_SCHEMA_URL + '_definitions.json#/definitions/io.k8s.api.apps.v1.Deployment'
      );

      expect(requestServiceMock).calledWithExactly(KUBERNETES_SCHEMA_URL);
      expect(requestServiceMock).calledWithExactly('file:///_definitions.json');
      expect(requestServiceMock).calledWithExactly(
        BASE_KUBERNETES_SCHEMA_URL + '_definitions.json#/definitions/io.k8s.api.apps.v1.Deployment'
      );
      expect(requestServiceMock).calledWithExactly(BASE_KUBERNETES_SCHEMA_URL + '_definitions.json');
      expect(requestServiceMock.callCount).equals(4);
    });

    it('should not get schema from crd catalog for RBAC-related resources', async () => {
      const documentContent = 'apiVersion: rbac.authorization.k8s.io/v1\nkind: RoleBinding';
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
              "$ref": "_definitions.json#/definitions/io.k8s.api.rbac.v1.RoleBinding"
            }
          ]
        }
        `
      );
      const service = new SchemaService.YAMLSchemaService(requestServiceMock, undefined, undefined, settings);
      service.registerExternalSchema(KUBERNETES_SCHEMA_URL, ['*.yaml']);
      const resolvedSchema = await service.getSchemaForResource('test.yaml', yamlDock.documents[0]);
      expect(resolvedSchema.schema.url).eqls(
        BASE_KUBERNETES_SCHEMA_URL + '_definitions.json#/definitions/io.k8s.api.rbac.v1.RoleBinding'
      );

      expect(requestServiceMock).calledWithExactly(KUBERNETES_SCHEMA_URL);
      expect(requestServiceMock).calledWithExactly('file:///_definitions.json');
      expect(requestServiceMock).calledWithExactly(
        BASE_KUBERNETES_SCHEMA_URL + '_definitions.json#/definitions/io.k8s.api.rbac.v1.RoleBinding'
      );
      expect(requestServiceMock).calledWithExactly(BASE_KUBERNETES_SCHEMA_URL + '_definitions.json');
      expect(requestServiceMock.callCount).equals(4);
    });

    it('should use GVK to get correct schema', async () => {
      const documentContent = `
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: foo
spec:
  foo: bar
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: foo
  minReplicas: 2
  maxReplicas: 3
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 80`;
      const content = `${documentContent}`;
      const yamlDock = parse(content);

      const settings = new SettingsState();
      settings.schemaAssociations = {
        kubernetes: ['*.yaml'],
      };
      settings.kubernetesCRDStoreEnabled = true;
      requestServiceMock = sandbox.fake((uri) => {
        if (uri === KUBERNETES_SCHEMA_URL) {
          return Promise.resolve(`
{
  "oneOf": [
    {
      "$ref": "_definitions.json#/definitions/io.k8s.api.autoscaling.v1.HorizontalPodAutoscaler"
    },
    {
      "$ref": "_definitions.json#/definitions/io.k8s.api.autoscaling.v2.HorizontalPodAutoscaler"
    }
  ]
}
`);
        } else {
          return Promise.resolve(`
{
  "io.k8s.api.autoscaling.v1.HorizontalPodAutoscaler": {
    "description": "configuration of a horizontal pod autoscaler.",
    "properties": {
      "apiVersion": {
        "description": "APIVersion defines the versioned schema of this representation of an object. Servers should convert recognized schemas to the latest internal value, and may reject unrecognized values. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources",
        "type": "string"
      },
      "kind": {
        "description": "Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds",
        "type": "string",
        "enum": [
          "HorizontalPodAutoscaler"
        ]
      },
      "metadata": {
        "$ref": "#/definitions/io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta",
        "description": "Standard object metadata. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata"
      },
      "spec": {
        "$ref": "#/definitions/io.k8s.api.autoscaling.v1.HorizontalPodAutoscalerSpec",
        "description": "spec defines the behaviour of autoscaler. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#spec-and-status."
      },
      "status": {
        "$ref": "#/definitions/io.k8s.api.autoscaling.v1.HorizontalPodAutoscalerStatus",
        "description": "status is the current information about the autoscaler."
      }
    },
    "type": "object",
    "x-kubernetes-group-version-kind": [
      {
        "group": "autoscaling",
        "kind": "HorizontalPodAutoscaler",
        "version": "v1"
      }
    ]
  },
  "io.k8s.api.autoscaling.v2.HorizontalPodAutoscaler": {
    "description": "HorizontalPodAutoscaler is the configuration for a horizontal pod autoscaler, which automatically manages the replica count of any resource implementing the scale subresource based on the metrics specified.",
    "properties": {
      "apiVersion": {
        "description": "APIVersion defines the versioned schema of this representation of an object. Servers should convert recognized schemas to the latest internal value, and may reject unrecognized values. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources",
        "type": "string"
      },
      "kind": {
        "description": "Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds",
        "type": "string",
        "enum": [
          "HorizontalPodAutoscaler"
        ]
      },
      "metadata": {
        "$ref": "#/definitions/io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta",
        "description": "metadata is the standard object metadata. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata"
      },
      "spec": {
        "$ref": "#/definitions/io.k8s.api.autoscaling.v2.HorizontalPodAutoscalerSpec",
        "description": "spec is the specification for the behaviour of the autoscaler. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#spec-and-status."
      },
      "status": {
        "$ref": "#/definitions/io.k8s.api.autoscaling.v2.HorizontalPodAutoscalerStatus",
        "description": "status is the current information about the autoscaler."
      }
    },
    "type": "object",
    "x-kubernetes-group-version-kind": [
      {
        "group": "autoscaling",
        "kind": "HorizontalPodAutoscaler",
        "version": "v2"
      }
    ]
  }
}`);
        }
      });
      const service = new SchemaService.YAMLSchemaService(requestServiceMock, undefined, undefined, settings);
      service.registerExternalSchema(KUBERNETES_SCHEMA_URL, ['*.yaml']);
      const resolvedSchema = await service.getSchemaForResource('test.yaml', yamlDock.documents[0]);
      expect(resolvedSchema.schema.url).eqls(
        BASE_KUBERNETES_SCHEMA_URL + '_definitions.json#/definitions/io.k8s.api.autoscaling.v2.HorizontalPodAutoscaler'
      );
    });
  });
});
