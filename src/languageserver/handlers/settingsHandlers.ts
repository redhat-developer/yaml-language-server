/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { xhr, configure as configureHttpRequests } from 'request-light';
import { DocumentFormattingRequest, Connection, DidChangeConfigurationNotification } from 'vscode-languageserver';
import { isRelativePath, relativeToAbsolutePath } from '../../languageservice/utils/paths';
import { checkSchemaURI, JSON_SCHEMASTORE_URL, KUBERNETES_SCHEMA_URL } from '../../languageservice/utils/schemaUrls';
import { LanguageService, LanguageSettings, SchemaPriority } from '../../languageservice/yamlLanguageService';
import { Settings, SettingsState } from '../../yamlSettings';
import { Telemetry } from '../telemetry';
import { ValidationHandler } from './validationHandlers';

export class SettingsHandler {
  constructor(
    private readonly connection: Connection,
    private readonly languageService: LanguageService,
    private readonly yamlSettings: SettingsState,
    private readonly validationHandler: ValidationHandler,
    private readonly telemetry: Telemetry
  ) {}

  async registerHandlers(): Promise<void> {
    if (this.yamlSettings.hasConfigurationCapability && this.yamlSettings.clientDynamicRegisterSupport) {
      try {
        // Register for all configuration changes.
        await this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
      } catch (err) {
        console.warn(err);
        this.telemetry.sendError('yaml.settings.error', { error: err });
      }
    }
    this.connection.onDidChangeConfiguration(() => this.pullConfiguration());
  }

  /**
   *  The server pull the 'yaml', 'http.proxy', 'http.proxyStrictSSL', '[yaml]' settings sections
   */
  async pullConfiguration(): Promise<void> {
    const config = await this.connection.workspace.getConfiguration([
      { section: 'yaml' },
      { section: 'http' },
      { section: '[yaml]' },
    ]);
    const settings: Settings = {
      yaml: config[0],
      http: {
        proxy: config[1]?.proxy ?? '',
        proxyStrictSSL: config[1]?.proxyStrictSSL ?? false,
      },
      yamlEditor: config[2],
    };
    this.setConfiguration(settings);
  }

  setConfiguration(settings: Settings): void {
    configureHttpRequests(settings.http && settings.http.proxy, settings.http && settings.http.proxyStrictSSL);

    this.yamlSettings.specificValidatorPaths = [];
    if (settings.yaml) {
      if (Object.prototype.hasOwnProperty.call(settings.yaml, 'schemas')) {
        this.yamlSettings.yamlConfigurationSettings = settings.yaml.schemas;
      }
      if (Object.prototype.hasOwnProperty.call(settings.yaml, 'validate')) {
        this.yamlSettings.yamlShouldValidate = settings.yaml.validate;
      }
      if (Object.prototype.hasOwnProperty.call(settings.yaml, 'hover')) {
        this.yamlSettings.yamlShouldHover = settings.yaml.hover;
      }
      if (Object.prototype.hasOwnProperty.call(settings.yaml, 'completion')) {
        this.yamlSettings.yamlShouldCompletion = settings.yaml.completion;
      }
      this.yamlSettings.customTags = settings.yaml.customTags ? settings.yaml.customTags : [];

      this.yamlSettings.maxItemsComputed = Math.trunc(Math.max(0, Number(settings.yaml.maxItemsComputed))) || 5000;

      if (settings.yaml.schemaStore) {
        this.yamlSettings.schemaStoreEnabled = settings.yaml.schemaStore.enable;
        if (settings.yaml.schemaStore.url.length !== 0) {
          this.yamlSettings.schemaStoreUrl = settings.yaml.schemaStore.url;
        }
      }

      if (settings.yaml.format) {
        this.yamlSettings.yamlFormatterSettings = {
          proseWrap: settings.yaml.format.proseWrap || 'preserve',
          printWidth: settings.yaml.format.printWidth || 80,
        };

        if (settings.yaml.format.singleQuote !== undefined) {
          this.yamlSettings.yamlFormatterSettings.singleQuote = settings.yaml.format.singleQuote;
        }

        if (settings.yaml.format.bracketSpacing !== undefined) {
          this.yamlSettings.yamlFormatterSettings.bracketSpacing = settings.yaml.format.bracketSpacing;
        }

        if (settings.yaml.format.enable !== undefined) {
          this.yamlSettings.yamlFormatterSettings.enable = settings.yaml.format.enable;
        }
      }
      this.yamlSettings.disableAdditionalProperties = settings.yaml.disableAdditionalProperties;
    }

    this.yamlSettings.schemaConfigurationSettings = [];

    if (settings.yamlEditor && settings.yamlEditor['editor.tabSize']) {
      this.yamlSettings.indentation = ' '.repeat(settings.yamlEditor['editor.tabSize']);
    }

    for (const uri in this.yamlSettings.yamlConfigurationSettings) {
      const globPattern = this.yamlSettings.yamlConfigurationSettings[uri];

      const schemaObj = {
        fileMatch: Array.isArray(globPattern) ? globPattern : [globPattern],
        uri: checkSchemaURI(this.yamlSettings.workspaceFolders, this.yamlSettings.workspaceRoot, uri, this.telemetry),
      };
      this.yamlSettings.schemaConfigurationSettings.push(schemaObj);
    }

    this.setSchemaStoreSettingsIfNotSet();
    this.updateConfiguration();

    // dynamically enable & disable the formatter
    if (this.yamlSettings.clientDynamicRegisterSupport) {
      const enableFormatter = settings && settings.yaml && settings.yaml.format && settings.yaml.format.enable;

      if (enableFormatter) {
        if (!this.yamlSettings.formatterRegistration) {
          this.yamlSettings.formatterRegistration = this.connection.client.register(DocumentFormattingRequest.type, {
            documentSelector: [{ language: 'yaml' }],
          });
        }
      } else if (this.yamlSettings.formatterRegistration) {
        this.yamlSettings.formatterRegistration.then((r) => {
          return r.dispose();
        });
        this.yamlSettings.formatterRegistration = null;
      }
    }
  }

  /**
   * This function helps set the schema store if it hasn't already been set
   * AND the schema store setting is enabled. If the schema store setting
   * is not enabled we need to clear the schemas.
   */
  public async setSchemaStoreSettingsIfNotSet(): Promise<void> {
    const schemaStoreIsSet = this.yamlSettings.schemaStoreSettings.length !== 0;
    let schemaStoreUrl = '';
    if (this.yamlSettings.schemaStoreUrl.length !== 0) {
      schemaStoreUrl = this.yamlSettings.schemaStoreUrl;
    } else {
      schemaStoreUrl = JSON_SCHEMASTORE_URL;
    }

    if (this.yamlSettings.schemaStoreEnabled && !schemaStoreIsSet) {
      try {
        const schemaStore = await this.getSchemaStoreMatchingSchemas(schemaStoreUrl);
        this.yamlSettings.schemaStoreSettings = schemaStore.schemas;
        this.updateConfiguration();
      } catch (err) {
        // ignore
      }
    } else if (!this.yamlSettings.schemaStoreEnabled) {
      this.yamlSettings.schemaStoreSettings = [];
      this.updateConfiguration();
    }
  }

  /**
   * When the schema store is enabled, download and store YAML schema associations
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getSchemaStoreMatchingSchemas(schemaStoreUrl: string): Promise<{ schemas: any[] }> {
    return xhr({ url: schemaStoreUrl }).then((response) => {
      const languageSettings = {
        schemas: [],
      };

      // Parse the schema store catalog as JSON
      const schemas = JSON.parse(response.responseText);

      for (const schemaIndex in schemas.schemas) {
        const schema = schemas.schemas[schemaIndex];

        if (schema && schema.fileMatch) {
          for (const fileMatch in schema.fileMatch) {
            const currFileMatch: string = schema.fileMatch[fileMatch];
            // If the schema is for files with a YAML extension, save the schema association
            if (currFileMatch.indexOf('.yml') !== -1 || currFileMatch.indexOf('.yaml') !== -1) {
              languageSettings.schemas.push({
                uri: schema.url,
                fileMatch: [currFileMatch],
                priority: SchemaPriority.SchemaStore,
              });
            }
          }
        }
      }

      return languageSettings;
    });
  }

  /**
   * Called when server settings or schema associations are changed
   * Re-creates schema associations and re-validates any open YAML files
   */
  public updateConfiguration(): void {
    let languageSettings: LanguageSettings = {
      validate: this.yamlSettings.yamlShouldValidate,
      hover: this.yamlSettings.yamlShouldHover,
      completion: this.yamlSettings.yamlShouldCompletion,
      schemas: [],
      customTags: this.yamlSettings.customTags,
      format: this.yamlSettings.yamlFormatterSettings.enable,
      indentation: this.yamlSettings.indentation,
      disableAdditionalProperties: this.yamlSettings.disableAdditionalProperties,
    };

    if (this.yamlSettings.schemaAssociations) {
      if (Array.isArray(this.yamlSettings.schemaAssociations)) {
        this.yamlSettings.schemaAssociations.forEach((association) => {
          languageSettings = this.configureSchemas(
            association.uri,
            association.fileMatch,
            association.schema,
            languageSettings,
            SchemaPriority.SchemaAssociation
          );
        });
      } else {
        for (const uri in this.yamlSettings.schemaAssociations) {
          const fileMatch = this.yamlSettings.schemaAssociations[uri];
          languageSettings = this.configureSchemas(uri, fileMatch, null, languageSettings, SchemaPriority.SchemaAssociation);
        }
      }
    }

    if (this.yamlSettings.schemaConfigurationSettings) {
      this.yamlSettings.schemaConfigurationSettings.forEach((schema) => {
        let uri = schema.uri;
        if (!uri && schema.schema) {
          uri = schema.schema.id;
        }
        if (!uri && schema.fileMatch) {
          uri = 'vscode://schemas/custom/' + encodeURIComponent(schema.fileMatch.join('&'));
        }
        if (uri) {
          if (isRelativePath(uri)) {
            uri = relativeToAbsolutePath(this.yamlSettings.workspaceFolders, this.yamlSettings.workspaceRoot, uri);
          }

          languageSettings = this.configureSchemas(
            uri,
            schema.fileMatch,
            schema.schema,
            languageSettings,
            SchemaPriority.Settings
          );
        }
      });
    }

    if (this.yamlSettings.schemaStoreSettings) {
      languageSettings.schemas = languageSettings.schemas.concat(this.yamlSettings.schemaStoreSettings);
    }

    this.languageService.configure(languageSettings);

    // Revalidate any open text documents
    this.yamlSettings.documents.all().forEach((document) => this.validationHandler.validate(document));
  }

  /**
   * Stores schema associations in server settings, handling kubernetes
   * @param uri string path to schema (whether local or online)
   * @param fileMatch file pattern to apply the schema to
   * @param schema schema id
   * @param languageSettings current server settings
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private configureSchemas(
    uri: string,
    fileMatch: string[],
    schema: unknown,
    languageSettings: LanguageSettings,
    priorityLevel: number
  ): LanguageSettings {
    uri = checkSchemaURI(this.yamlSettings.workspaceFolders, this.yamlSettings.workspaceRoot, uri, this.telemetry);

    if (schema === null) {
      languageSettings.schemas.push({ uri, fileMatch: fileMatch, priority: priorityLevel });
    } else {
      languageSettings.schemas.push({ uri, fileMatch: fileMatch, schema: schema, priority: priorityLevel });
    }

    if (fileMatch.constructor === Array && uri === KUBERNETES_SCHEMA_URL) {
      fileMatch.forEach((url) => {
        this.yamlSettings.specificValidatorPaths.push(url);
      });
    } else if (uri === KUBERNETES_SCHEMA_URL) {
      this.yamlSettings.specificValidatorPaths.push(fileMatch);
    }

    return languageSettings;
  }
}
