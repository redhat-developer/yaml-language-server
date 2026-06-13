/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { configure as configureHttpRequests, xhr } from 'request-light';
import type { Connection } from 'vscode-languageserver';
import { DidChangeConfigurationNotification, DocumentFormattingRequest } from 'vscode-languageserver';
import { CodeLensRefreshRequest } from 'vscode-languageserver-protocol';
import { isRelativePath, relativeToAbsolutePath } from '../../languageservice/utils/paths';
import { checkSchemaURI, EMPTY_SCHEMA_URL, isKubernetes, JSON_SCHEMASTORE_URL } from '../../languageservice/utils/schemaUrls';
import { equals } from '../../languageservice/utils/objects';
import type { LanguageService, LanguageSettings, SchemasSettings } from '../../languageservice/yamlLanguageService';
import { SchemaPriority } from '../../languageservice/yamlLanguageService';
import { SchemaSelectionRequests } from '../../requestTypes';
import type { Settings, SettingsState } from '../../yamlSettings';
import type { Telemetry } from '../../languageservice/telemetry';
import type { ValidationHandler } from './validationHandlers';

export class SettingsHandler {
  private schemaSettings: SchemasSettings[] | undefined;

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
        await this.connection.client.register(DidChangeConfigurationNotification.type);
      } catch (err) {
        this.telemetry.sendError('yaml.settings.error', err);
      }
    }
    this.connection.onDidChangeConfiguration(() => this.pullConfiguration());
  }

  /**
   *  The server pull the 'yaml', 'http.proxy', 'http.proxyStrictSSL', '[yaml]' settings sections
   */
  pullConfiguration(): Promise<void> {
    const configurationPullPromise = this.doPullConfiguration();
    this.yamlSettings.configurationPullPromise = configurationPullPromise.catch(() => undefined);
    return configurationPullPromise;
  }

  private async doPullConfiguration(): Promise<void> {
    const config = await this.connection.workspace.getConfiguration([
      { section: 'yaml' },
      { section: 'http' },
      { section: '[yaml]' },
      { section: 'editor' },
      { section: 'files' },
    ]);
    const settings: Readonly<Settings> = {
      yaml: config[0],
      http: {
        proxy: config[1]?.proxy ?? '',
        proxyStrictSSL: config[1]?.proxyStrictSSL ?? false,
      },
      yamlEditor: config[2],
      vscodeEditor: config[3],
      files: config[4],
    };
    await this.setConfiguration(settings);
  }

  private async setConfiguration(settings: Settings): Promise<void> {
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
      if (Object.prototype.hasOwnProperty.call(settings.yaml, 'hoverAnchor')) {
        this.yamlSettings.yamlShouldHoverAnchor = settings.yaml.hoverAnchor;
      }
      if (Object.prototype.hasOwnProperty.call(settings.yaml, 'completion')) {
        this.yamlSettings.yamlShouldCompletion = settings.yaml.completion;
      }
      if (Object.prototype.hasOwnProperty.call(settings.yaml, 'hoverSchemaSource')) {
        this.yamlSettings.yamlHoverSchemaSource = settings.yaml.hoverSchemaSource;
      }
      if (Object.prototype.hasOwnProperty.call(settings.yaml, 'kubernetesVersion')) {
        const match =
          typeof settings.yaml.kubernetesVersion === 'string'
            ? /^v?(\d+)\.(\d+)\.(\d+)$/i.exec(settings.yaml.kubernetesVersion.trim())
            : undefined;
        this.yamlSettings.kubernetesVersion = match ? `v${match[1]}.${match[2]}.${match[3]}` : undefined;
      }
      this.yamlSettings.yamlDisableSchemaDetection = Array.isArray(settings.yaml.disableSchemaDetection)
        ? settings.yaml.disableSchemaDetection
        : settings.yaml.disableSchemaDetection
          ? [settings.yaml.disableSchemaDetection]
          : [];
      this.yamlSettings.customTags = settings.yaml.customTags ? settings.yaml.customTags : [];

      this.yamlSettings.maxItemsComputed = Math.trunc(Math.max(0, Number(settings.yaml.maxItemsComputed))) || 5000;

      if (settings.yaml.schemaStore) {
        this.yamlSettings.schemaStoreEnabled = settings.yaml.schemaStore.enable;
        if (settings.yaml.schemaStore.url) {
          this.yamlSettings.schemaStoreUrl = settings.yaml.schemaStore.url;
        }
      }

      if (settings.yaml.kubernetesCRDStore) {
        this.yamlSettings.kubernetesCRDStoreEnabled = settings.yaml.kubernetesCRDStore.enable;
        if (settings.yaml.kubernetesCRDStore.url?.length !== 0) {
          this.yamlSettings.kubernetesCRDStoreUrl = settings.yaml.kubernetesCRDStore.url;
        }
      }

      if (settings.files?.associations) {
        for (const [ext, languageId] of Object.entries(settings.files.associations)) {
          if (languageId === 'yaml') {
            this.yamlSettings.fileExtensions.push(ext);
          }
        }
      }
      this.yamlSettings.yamlVersion = settings.yaml.yamlVersion ?? '1.2';

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

        if (settings.yaml.format.trailingComma !== undefined) {
          this.yamlSettings.yamlFormatterSettings.trailingComma = settings.yaml.format.trailingComma;
        }

        if (settings.yaml.format.enable !== undefined) {
          this.yamlSettings.yamlFormatterSettings.enable = settings.yaml.format.enable;
        }
      }
      this.yamlSettings.disableAdditionalProperties = settings.yaml.disableAdditionalProperties;
      this.yamlSettings.disableDefaultProperties = settings.yaml.disableDefaultProperties;

      if (settings.yaml.suggest) {
        this.yamlSettings.suggest.parentSkeletonSelectedFirst = settings.yaml.suggest.parentSkeletonSelectedFirst;
      }
      this.yamlSettings.style = {
        flowMapping: settings.yaml.style?.flowMapping ?? 'allow',
        flowSequence: settings.yaml.style?.flowSequence ?? 'allow',
      };
      this.yamlSettings.keyOrdering = settings.yaml.keyOrdering ?? false;
    }

    this.yamlSettings.schemaConfigurationSettings = [];

    let tabSize = 2;
    if (settings.vscodeEditor) {
      tabSize =
        !settings.vscodeEditor['detectIndentation'] && settings.yamlEditor ? settings.yamlEditor['editor.tabSize'] : tabSize;
    }

    if (settings.yamlEditor && settings.yamlEditor['editor.tabSize']) {
      this.yamlSettings.indentation = ' '.repeat(tabSize);
    }

    for (const uri in this.yamlSettings.yamlConfigurationSettings) {
      const globPattern = this.yamlSettings.yamlConfigurationSettings[uri];

      const schemaObj = {
        fileMatch: Array.isArray(globPattern) ? globPattern : [globPattern],
        uri,
      };
      this.yamlSettings.schemaConfigurationSettings.push(schemaObj);
    }

    await this.setSchemaStoreSettingsIfNotSet();
    this.updateConfiguration();
    if (this.yamlSettings.useSchemaSelectionRequests) {
      this.connection.sendNotification(SchemaSelectionRequests.schemaStoreInitialized, {});
    }

    // dynamically enable & disable the formatter
    if (this.yamlSettings.clientDynamicRegisterSupport) {
      const enableFormatter = settings && settings.yaml && settings.yaml.format && settings.yaml.format.enable;

      if (enableFormatter) {
        if (!this.yamlSettings.formatterRegistration) {
          this.yamlSettings.formatterRegistration = this.connection.client.register(DocumentFormattingRequest.type, {
            documentSelector: [
              { language: 'yaml' },
              { language: 'yaml-textmate' },
              { language: 'yaml-tmlanguage' },
              { language: 'ansible' },
              { language: 'azure-pipelines' },
              { language: 'dockercompose' },
              { language: 'github-actions-workflow' },
              { language: 'home-assistant' },
              { language: 'manifest-yaml' },
              { language: 'spring-boot-properties-yaml' },
            ],
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
  private async setSchemaStoreSettingsIfNotSet(): Promise<void> {
    const schemaStoreIsSet = this.yamlSettings.schemaStoreSettings.length !== 0;
    const schemaStoreUrl = this.yamlSettings.schemaStoreUrl || JSON_SCHEMASTORE_URL;

    if (this.yamlSettings.schemaStoreEnabled && !schemaStoreIsSet) {
      try {
        const schemaStore = await this.getSchemaStoreMatchingSchemas(schemaStoreUrl);
        this.yamlSettings.schemaStoreSettings = schemaStore.schemas;
      } catch {
        // ignore
      }
    } else if (!this.yamlSettings.schemaStoreEnabled) {
      this.yamlSettings.schemaStoreSettings = [];
    }
  }

  /**
   * When the schema store is enabled, download and store YAML schema associations
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getSchemaStoreMatchingSchemas(schemaStoreUrl: string): Promise<{ schemas: any[] }> {
    const response = await xhr({ url: schemaStoreUrl });

    const languageSettings = {
      schemas: [],
    };

    // Parse the schema store catalog as JSON
    const schemas = JSON.parse(response.responseText);

    for (const schemaIndex in schemas.schemas) {
      const schema = schemas.schemas[schemaIndex];
      if (!schema.url) {
        continue;
      }
      const fileMatches = schema.fileMatch ?? [];
      if (fileMatches.length === 0) {
        languageSettings.schemas.push({
          uri: schema.url,
          fileMatch: [],
          priority: SchemaPriority.SchemaStore,
          name: schema.name,
          description: schema.description,
          versions: schema.versions,
        });
      } else {
        for (const currFileMatch of fileMatches) {
          // If the schema is for files with a YAML extension, save the schema association
          if (
            this.yamlSettings.fileExtensions.findIndex((value) => {
              return currFileMatch.indexOf(value) > -1;
            }) > -1
          ) {
            languageSettings.schemas.push({
              uri: schema.url,
              fileMatch: [currFileMatch],
              priority: SchemaPriority.SchemaStore,
              name: schema.name,
              description: schema.description,
              versions: schema.versions,
            });
          }
        }
      }
    }
    return languageSettings;
  }

  /**
   * Called when server settings or schema associations are changed
   * Re-creates schema associations and re-validates any open YAML files
   */
  private updateConfiguration(): void {
    let languageSettings: LanguageSettings = {
      validate: this.yamlSettings.yamlShouldValidate,
      hover: this.yamlSettings.yamlShouldHover,
      hoverAnchor: this.yamlSettings.yamlShouldHoverAnchor,
      completion: this.yamlSettings.yamlShouldCompletion,
      schemas: [],
      customTags: this.yamlSettings.customTags,
      format: this.yamlSettings.yamlFormatterSettings.enable,
      indentation: this.yamlSettings.indentation,
      disableAdditionalProperties: this.yamlSettings.disableAdditionalProperties,
      disableDefaultProperties: this.yamlSettings.disableDefaultProperties,
      parentSkeletonSelectedFirst: this.yamlSettings.suggest.parentSkeletonSelectedFirst,
      flowMapping: this.yamlSettings.style?.flowMapping,
      flowSequence: this.yamlSettings.style?.flowSequence,
      yamlVersion: this.yamlSettings.yamlVersion,
      keyOrdering: this.yamlSettings.keyOrdering,
      hoverSchemaSource: this.yamlSettings.yamlHoverSchemaSource,
    };

    if (this.yamlSettings.yamlDisableSchemaDetection) {
      if (Array.isArray(this.yamlSettings.yamlDisableSchemaDetection)) {
        languageSettings = this.configureSchemas(
          EMPTY_SCHEMA_URL,
          this.yamlSettings.yamlDisableSchemaDetection,
          true,
          languageSettings,
          SchemaPriority.SchemaDetectionDisabled
        );
      }
    }

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

    const shouldRefreshCodeLens = this.schemaSettings !== undefined && !equals(this.schemaSettings, languageSettings.schemas);
    this.schemaSettings = languageSettings.schemas;
    if (shouldRefreshCodeLens) {
      this.refreshCodeLens();
    }
    // Revalidate any open text documents
    this.yamlSettings.documents.all().forEach((document) => this.validationHandler.validate(document));
  }

  private refreshCodeLens(): void {
    if (!this.yamlSettings.hasCodeLensRefreshSupport) {
      return;
    }
    this.connection
      .sendRequest(CodeLensRefreshRequest.type)
      .catch((err) => this.telemetry.sendError('yaml.codeLens.refresh.error', err));
  }

  /**
   * Stores schema associations in server settings, handling kubernetes
   * @param uri string path to schema (whether local or online)
   * @param fileMatch file pattern to apply the schema to
   * @param schema schema id
   * @param languageSettings current server settings
   */
  private configureSchemas(
    uri: string,
    fileMatch: string[],
    schema: unknown,
    languageSettings: LanguageSettings,
    priorityLevel: number
  ): LanguageSettings {
    uri = checkSchemaURI(
      this.yamlSettings.workspaceFolders,
      this.yamlSettings.workspaceRoot,
      uri,
      this.telemetry,
      this.yamlSettings.kubernetesVersion
    );

    if (schema === null) {
      languageSettings.schemas.push({ uri, fileMatch: fileMatch, priority: priorityLevel });
    } else {
      languageSettings.schemas.push({ uri, fileMatch: fileMatch, schema: schema, priority: priorityLevel });
    }

    if (isKubernetes(uri)) {
      if (Array.isArray(fileMatch)) {
        fileMatch.forEach((pattern) => {
          this.yamlSettings.specificValidatorPaths.push(pattern);
        });
      } else {
        this.yamlSettings.specificValidatorPaths.push(fileMatch);
      }
    }

    return languageSettings;
  }
}
