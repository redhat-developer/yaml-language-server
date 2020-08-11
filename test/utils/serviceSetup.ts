/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LanguageSettings } from '../../src/languageservice/yamlLanguageService';

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
  };

  withValidate() {
    this.languageSettings.validate = true;
    return this;
  }

  withHover() {
    this.languageSettings.hover = true;
    return this;
  }

  withCompletion() {
    this.languageSettings.completion = true;
    return this;
  }

  withFormat() {
    this.languageSettings.format = true;
    return this;
  }

  withKubernetes() {
    this.languageSettings.isKubernetes = true;
    return this;
  }

  withSchemaFileMatch(schemaFileMatch: { uri: string; fileMatch: string[] }) {
    this.languageSettings.schemas.push(schemaFileMatch);
    return this;
  }

  withCustomTags(customTags: string[]) {
    this.languageSettings.customTags = customTags;
    return this;
  }
}
