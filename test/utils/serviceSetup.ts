/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LanguageSettings, SchemasSettings } from '../../src/languageservice/yamlLanguageService';

export class ServiceSetup {
  /*
   * By default the service setup is going to have everything disabled
   * and each test is going to enable a feature with a with function call
   */
  languageSettings: LanguageSettings = {
    validate: false,
    hover: false,
    completion: false,
    format: false,
    isKubernetes: false,
    schemas: [],
    customTags: [],
    indentation: undefined,
  };

  withValidate(): ServiceSetup {
    this.languageSettings.validate = true;
    return this;
  }

  withHover(): ServiceSetup {
    this.languageSettings.hover = true;
    return this;
  }

  withCompletion(): ServiceSetup {
    this.languageSettings.completion = true;
    return this;
  }

  withFormat(): ServiceSetup {
    this.languageSettings.format = true;
    return this;
  }

  withKubernetes(allow = true): ServiceSetup {
    this.languageSettings.isKubernetes = allow;
    return this;
  }

  withSchemaFileMatch(schemaFileMatch: SchemasSettings): ServiceSetup {
    this.languageSettings.schemas.push(schemaFileMatch);
    return this;
  }

  withCustomTags(customTags: string[]): ServiceSetup {
    this.languageSettings.customTags = customTags;
    return this;
  }

  withIndentation(indentation: string): ServiceSetup {
    this.languageSettings.indentation = indentation;
    return this;
  }
}
