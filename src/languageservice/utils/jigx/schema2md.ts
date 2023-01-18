/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { JSONSchema } from 'vscode-json-languageservice';
import { IProblem, JSONSchemaWithProblems } from '../../parser/jsonParser07';
import { getSchemaRefTypeTitle } from '../schemaUtils';
import { Globals } from './globals';
import { char_gt, char_lt, getDescription, getIndent, isJSONSchema, tableColumnSeparator, toCodeSingleLine } from './jigx-utils';
import { SchemaTypeFactory, Schema_ArrayGeneric, Schema_ArrayTyped, Schema_Object, Schema_ObjectTyped } from './schema-type';

export class Schema2Md {
  isDebug = false;
  dontPrintSimpleTypes = true;
  disableLinks = true;
  startOctothorpes = '##';
  maxLevel = 0;
  hideText = {
    enum: true,
    objectPropTitle: true,
    union: true,
  };
  propTable = {
    linePrefix: '',
  };
  constructor() {
    SchemaTypeFactory.UniqueLinks = [];
  }
  public configure(): void {
    //
  }

  public generateMd(schema: any, propName?: string): string {
    let componentId = schema.properties && schema.properties.componentId && schema.properties.componentId.const;
    if (!componentId) {
      componentId = Globals.ComponentPrefix + getSchemaRefTypeTitle(schema.url || '');
    }

    const subSchemaTypes = Object.keys(schema.definitions || {}).reduce(function (map: any, subSchemaTypeName) {
      map['#/definitions/' + subSchemaTypeName] = subSchemaTypeName;
      return map;
    }, {});

    let text: string[] = [];
    const octothorpes = this.startOctothorpes;
    // octothorpes += '#';

    if (schema.type === 'object') {
      // don't add description at the first level - it's added by yamlHover
      // if (schema.description) {
      //   text.push(schema.description);
      // }
      // if (!this.propTable.linePrefix) {
      //   text.push('Object properties:');
      // }
      let textTmp: string[] = [];
      this.generatePropertySection(0, octothorpes, schema, subSchemaTypes).forEach(function (section) {
        textTmp = textTmp.concat(section);
      });
      const propTable = this.generatePropTable(octothorpes, propName || 'root', false, schema, subSchemaTypes);
      text.push(propTable);
      text = text.concat(textTmp);
    } else {
      text = text.concat(this.generateSchemaSectionText(0, /*'#' +*/ octothorpes, propName || '', false, schema, subSchemaTypes));
    }
    return text
      .filter(function (line) {
        return !!line;
      })
      .join('\n\n');
  }

  public generateSchemaSectionText(
    indent: number,
    octothorpes: string,
    name: string,
    isRequired: boolean,
    schema: any,
    subSchemas: []
  ): string[] {
    if (indent > this.maxLevel) {
      return [];
    }

    if (schema.deprecationMessage) {
      return [];
    }

    const schemaType = this.getActualType(schema, subSchemas);
    // const sectionTitle = generateElementTitle(octothorpes, name, schemaType, isRequired, schema);

    const schemaTypeTyped = SchemaTypeFactory.CreatePropTypeInstance(schema, name, isRequired);
    let text = [schemaTypeTyped.getElementTitle('', subSchemas, true, false)];

    const offset = getIndent(octothorpes.length, false);
    text[0] = text[0].replace(/^(.*)$/gm, offset + '$1');
    const schemaDescription = schema.markdownDescription || schema.description;
    // root description is added in yamlHover service, so skip it here inside the section
    if (schemaDescription && indent !== 0) {
      const description = offset + '*' + schemaDescription.replace(/\n\n/g, '\n\n' + offset) + '*';
      // put description to the end of the title after the block
      text[0] = text[0].replace(/```$/, '```\n' + description);
    }

    //TODO refactor
    if (schemaType === 'object' || schemaTypeTyped instanceof Schema_Object || schemaTypeTyped instanceof Schema_ObjectTyped) {
      if (schema.properties) {
        const nameWithQuat = name ? '`' + name + '`' : '';
        if (!this.hideText.objectPropTitle) {
          text.push(offset + 'Properties of the ' + nameWithQuat + ' object:');
        }
        let textTmp: string[] = [];
        this.generatePropertySection(indent, octothorpes, schema, subSchemas).forEach((section) => {
          textTmp = textTmp.concat(section);
        });
        const propTable = this.generatePropTable(octothorpes, name, isRequired, schema, subSchemas);
        text.push(propTable);
        text = text.concat(textTmp);
      }
    } else if (
      schemaType === 'array' ||
      schemaTypeTyped instanceof Schema_ArrayTyped ||
      schemaTypeTyped instanceof Schema_ArrayGeneric
    ) {
      let itemsType = schema.items && schema.items.type;

      if (!itemsType && schema.items['$ref']) {
        itemsType = this.getActualType(schema.items, subSchemas);
      }

      if (itemsType && name) {
        !this.hideText.union && text.push(offset + 'Array with all elements of the type `' + itemsType + '`.');
      } else if (itemsType) {
        !this.hideText.union && text.push(offset + 'Array with all elements of the type `' + itemsType + '`.');
      } else {
        let validationItems = [];

        if (schema.items.allOf) {
          !this.hideText.union && text.push(offset + 'The elements of the array must match *all* of the following properties:');
          validationItems = schema.items.allOf;
        } else if (schema.items.anyOf) {
          !this.hideText.union &&
            text.push(offset + 'The elements of the array must match *at least one* of the following properties:');
          validationItems = schema.items.anyOf;
        } else if (schema.items.oneOf) {
          !this.hideText.union &&
            text.push(offset + 'The elements of the array must match *exactly one* of the following properties:');
          validationItems = schema.items.oneOf;
        } else if (schema.items.not) {
          !this.hideText.union && text.push(offset + 'The elements of the array must *not* match the following properties:');
          validationItems = schema.items.not;
        }

        if (validationItems.length > 0) {
          validationItems.forEach((item: any) => {
            text = text.concat(this.generateSchemaSectionText(indent + 1, octothorpes, name, false, item, subSchemas));
          });
        }
      }

      if (itemsType === 'object') {
        !this.hideText.union && text.push(offset + 'The array object has the following properties:');
        let textTmp: string[] = [];
        this.generatePropertySection(indent, octothorpes, schema.items, subSchemas).forEach((section) => {
          textTmp = textTmp.concat(section);
        });
        const propTable = this.generatePropTable(octothorpes, name, isRequired, schema.items, subSchemas);
        text.push(propTable);
        text = text.concat(textTmp);
      }
    } else if (schema.oneOf) {
      !this.hideText.union && text.push(offset + 'The object must be one of the following types:');
      const oneOfArr = schema.oneOf.map((oneOf: any) => {
        return this.generateSchemaSectionText(indent + 1, octothorpes, name, false, oneOf, subSchemas);
      });
      oneOfArr.forEach((type: string) => {
        text = text.concat(type);
      });
    } else if (schema.anyOf) {
      !this.hideText.union && text.push(offset + 'The object must be any of the following types:');
      const anyOfArr = schema.anyOf.map((anyOf: any) => {
        return this.generateSchemaSectionText(indent + 1, octothorpes, name, false, anyOf, subSchemas);
      });
      anyOfArr.forEach((type: string) => {
        text = text.concat(type);
      });
    } else if (schema.enum) {
      if (!this.hideText.enum) {
        text.push(offset + 'This element must be one of the following enum values:');
      }
      if (schema.enum.length > 50) {
        text.push(offset + '`' + schema.enum.join(' | ') + '`');
      } else {
        text.push(schema.enum.map((enumItem) => '* `' + enumItem + '`').join('\n'));
      }
    } else if (schema.const) {
      // const is already in text from the beginning
      if (this.dontPrintSimpleTypes) {
        return [];
      }
    } else {
      if (this.dontPrintSimpleTypes) {
        return [];
      }
    }

    if (schema.default !== undefined) {
      if (schema.default === null || ['boolean', 'number', 'string'].indexOf(typeof schema.default) !== -1) {
        text.push('Default: `' + JSON.stringify(schema.default) + '`');
      } else {
        text.push('Default:');
        text.push('```\n' + JSON.stringify(schema.default, null, 2) + '\n```');
      }
    }

    const restrictions = undefined; //this.generatePropertyRestrictions(schema);

    if (restrictions) {
      text.push(offset + 'Additional restrictions:');
      text.push(restrictions);
    }
    return text;
  }

  public generatePropertySection(indent: number, octothorpes: string, schema: JSONSchema, subSchemas: []): any {
    if (schema.properties) {
      const sections = Object.keys(schema.properties).map((propertyKey) => {
        const property = schema.properties[propertyKey];
        if (isJSONSchema(property) && property.deprecationMessage) {
          return [];
        }
        const propertyIsRequired = schema.required && schema.required.indexOf(propertyKey) >= 0;
        const sectionText = this.generateSchemaSectionText(
          indent + 1,
          octothorpes + '#',
          propertyKey,
          propertyIsRequired,
          property,
          subSchemas
        );
        return sectionText;
      });
      return sections;
    } else if (schema.oneOf || schema.anyOf) {
      const oneOfList = (schema.oneOf || schema.anyOf)
        .map((innerSchema: JSONSchema) => {
          return '* `' + this.getActualType(innerSchema, subSchemas) + '`';
        })
        .join('\n');
      return ['This property must be one of the following types:', oneOfList];
    } else {
      return [];
    }
  }

  private getActualType(schema: JSONSchema, subSchemas: []): string {
    if (schema.type) {
      if (schema.type == 'array' && schema.items) {
        // const arrStr = getActualTypeStr(schema.items, subSchemas) + '[]';
        const arrType = this.getActualType(<JSONSchema>schema.items, subSchemas);
        if ((<JSONSchema>schema.items).anyOf) {
          return `Array${char_lt}${arrType}${char_gt}`;
        }
        return arrType + '[]';
      } else if (schema.type && schema.type instanceof Array) {
        return schema.type.join(tableColumnSeparator);
      }
      return schema.type.toString();
    } else if (schema['$ref']) {
      if (subSchemas[schema['$ref']]) {
        return subSchemas[schema['$ref']];
      } else {
        // return schema['$ref'];
        return getSchemaRefTypeTitle(schema.$ref);
      }
    } else if (schema.oneOf || schema.anyOf) {
      return (schema.oneOf || schema.anyOf).map((i: JSONSchema) => this.getActualType(i, subSchemas)).join(tableColumnSeparator);
    } else {
      return '';
    }
  }

  private isPropertyRequired(schema: JSONSchema, propertyKey: string): boolean {
    const propertyIsRequired = schema.required && schema.required.indexOf(propertyKey) >= 0;
    return propertyIsRequired;
  }

  readonly tsBlockTmp = '{\n{rows}\n}';
  readonly requiredTmp = (r: boolean, problem: IProblem): string => (problem ? '❗' : r ? '❕' : '');
  // readonly tsBlockTmp = '\n```ts\n{prop}{required}: {type} {description}\n```\n';
  readonly tsBlockRowTmp = '  {prop}{required}: {type} {description}';

  /**
   *
   * @param octothorpes
   * @param name
   * @param isRequired has to be sent from parent element
   * @param schema
   * @param subSchemas
   */
  generatePropTable(
    octothorpes: string,
    name: string,
    isRequired: boolean,
    schema: JSONSchemaWithProblems,
    subSchemas: []
  ): string {
    // auto indent property table by 1 level
    octothorpes = octothorpes + '#';
    const type = SchemaTypeFactory.CreatePropTypeInstance(schema, name, isRequired);
    // if (hasTypePropertyTable(type)) {
    if (type instanceof Schema_Object) {
      let propTableTmp = [
        this.isDebug ? '| Property | Type | Required | Description |' : '| Property | Type | Required | Description |',
        this.isDebug ? '| -------- | ---- | -------- | ----------- |' : '| -------- | ---- | -------- | ----------- |',
        // ...type.getPropertyTable(octothorpes, schema, subSchemas)
      ];

      const props = Object.keys(type.properties).map((key) => {
        const prop = type.properties[key];
        if (prop.deprecationMessage) {
          return;
        }
        const isRequired = this.isPropertyRequired(schema, key);
        prop.problem = schema.problems && schema.problems.find((p) => p.problemArgs.includes(key));
        const propType = SchemaTypeFactory.CreatePropTypeInstance(prop, key, isRequired);
        // const propTypeStr = propType.getTypeStr(subSchemas);
        const propTypeMD = propType.getTypeMD(subSchemas);
        const requiredStr = this.requiredTmp(propType.isPropRequired, prop.problem);

        const description = getDescription(prop);
        const row = [key, toCodeSingleLine(propTypeMD), requiredStr, description];
        return (this.isDebug ? '' : '') + '| ' + row.join(' | ') + ' |';
      });
      propTableTmp = propTableTmp.concat(props.filter<string>((prop): prop is string => typeof prop === 'string'));
      const indent = getIndent(octothorpes.length);

      const ret = propTableTmp.reduce((p, n) => `${p}${indent}${this.propTable.linePrefix}${n}\n`, ''); // '\n' + propTableTmp.join('\n');
      return ret;
    }
    return '';
  }
}
