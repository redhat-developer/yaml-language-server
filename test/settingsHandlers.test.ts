/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SettingsHandler } from '../src/languageserver/handlers/settingsHandlers';
import * as sinon from 'sinon';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
import { Connection } from 'vscode-languageserver';
import { SettingsState } from '../src/yamlSettings';
import { ValidationHandler } from '../src/languageserver/handlers/validationHandlers';
import { LanguageService } from '../src';
import * as request from 'request-light';

const expect = chai.expect;
chai.use(sinonChai);

describe('Settings Handlers Tests', () => {
  const sandbox = sinon.createSandbox();
  let connectionStub: sinon.SinonMockStatic;
  let languageService: sinon.SinonMockStatic;
  let settingsState: SettingsState;
  let validationHandler: sinon.SinonMock;
  let xhrStub: sinon.SinonStub;

  beforeEach(() => {
    connectionStub = sandbox.mock();
    languageService = sandbox.mock();
    settingsState = new SettingsState();
    validationHandler = sandbox.mock(ValidationHandler);
    xhrStub = sandbox.stub(request, 'xhr');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('SettingsHandler should modify file match patters', async () => {
    xhrStub.resolves({
      responseText: `{"schemas": [
      {
        "name": ".adonisrc.json",
        "description": "AdonisJS configuration file",
        "fileMatch": [
          ".adonisrc.yaml"
        ],
        "url": "https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json"
      }]}`,
    });
    const settingsHandler = new SettingsHandler(
      (connectionStub as unknown) as Connection,
      (languageService as unknown) as LanguageService,
      settingsState,
      (validationHandler as unknown) as ValidationHandler
    );

    sandbox.stub(settingsHandler, 'updateConfiguration').returns();

    await settingsHandler.setSchemaStoreSettingsIfNotSet();

    expect(settingsState.schemaStoreSettings).deep.include({
      uri: 'https://raw.githubusercontent.com/adonisjs/application/master/adonisrc.schema.json',
      fileMatch: ['/.adonisrc.yaml'],
    });
  });
});
