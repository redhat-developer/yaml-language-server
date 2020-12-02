/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { JSONSchema } from 'vscode-json-languageservice';
import { char_gt, char_lt, getSchemaRefTypeTitle, replaceSpecialCharsInDescription, tableColumnSeparator } from './jigx-utils';
import { Globals } from './globals';
import { SchemaTypeFactory, Schema_ArrayGeneric, Schema_ArrayTyped, Schema_Object, Schema_ObjectTyped } from './schema-type';

export class Schema2Md {
  isDebug = false;
  dontPrintSimpleTypes = true;
  disableLinks = true;
  startOctothorpes = '#';
  maxLevel = this.startOctothorpes.length + 2;
  propTableLinePrefix = '';
  hideText = {
    enum: true,
  };
  constructor() {
    SchemaTypeFactory.UniqueLinks = [];
  }

  public generateMd(schema: any): string {
    let componentId = schema.properties && schema.properties.componentId && schema.properties.componentId.const;
    if (!componentId) {
      componentId = Globals.ComponentPrefix + getSchemaRefTypeTitle(schema.url);
    }

    const subSchemaTypes = Object.keys(schema.definitions || {}).reduce(function (map: any, subSchemaTypeName) {
      map['#/definitions/' + subSchemaTypeName] = subSchemaTypeName;
      return map;
    }, {});

    let text: string[] = [];
    let octothorpes = this.startOctothorpes;

    // const componentIdStr = componentId.replace('@', '');
    // text.push('---');
    // text.push('id: ' + componentIdStr.replace('/', '_'));
    // text.push('title: ' + componentIdStr);
    // text.push('---');

    octothorpes += '#';
    // text.push(octothorpes + ' Component: ' + componentId)

    if (schema.type === 'object') {
      if (schema.description) {
        text.push(schema.description);
      }
      // if (!this.propTableLinePrefix) {
      //   text.push('Object properties:');
      // }
      let textTmp: string[] = [];
      this.generatePropertySection(octothorpes, schema, subSchemaTypes).forEach(function (section) {
        textTmp = textTmp.concat(section);
      });
      const propTable = this.generatePropTable(octothorpes, 'root', false, schema, subSchemaTypes);
      text.push(propTable);
      text = text.concat(textTmp);
    } else {
      text = text.concat(this.generateSchemaSectionText('#' + octothorpes, '', false, schema, subSchemaTypes));
    }
    return text
      .filter(function (line) {
        return !!line;
      })
      .join('\n\n');
  }

  public generateSchemaSectionText(
    octothorpes: string,
    name: string,
    isRequired: boolean,
    schema: any,
    subSchemas: []
  ): string[] {
    if (octothorpes.length > this.maxLevel) {
      return [];
    }
    const schemaType = this.getActualType(schema, subSchemas);
    // const sectionTitle = generateElementTitle(octothorpes, name, schemaType, isRequired, schema);

    const schemaTypeTyped = SchemaTypeFactory.CreatePropTypeInstance(schema, name, isRequired);
    let text = [/*sectionTitle,*/ schemaTypeTyped.getElementTitle(octothorpes, subSchemas)];
    if (schema.description) {
      text.push(schema.description);
    }

    //TODO refactor
    if (schemaType === 'object' || schemaTypeTyped instanceof Schema_Object || schemaTypeTyped instanceof Schema_ObjectTyped) {
      if (schema.properties) {
        const nameWithQuat = name ? '`' + name + '`' : '';
        text.push('Properties of the ' + nameWithQuat + ' object:');
        let textTmp: string[] = [];
        this.generatePropertySection(octothorpes, schema, subSchemas).forEach((section) => {
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
        text.push('The object is an array with all elements of the type `' + itemsType + '`.');
      } else if (itemsType) {
        text.push('The schema defines an array with all elements of the type `' + itemsType + '`.');
      } else {
        let validationItems = [];

        if (schema.items.allOf) {
          text.push('The elements of the array must match *all* of the following properties:');
          validationItems = schema.items.allOf;
        } else if (schema.items.anyOf) {
          text.push('The elements of the array must match *at least one* of the following properties:');
          validationItems = schema.items.anyOf;
        } else if (schema.items.oneOf) {
          text.push('The elements of the array must match *exactly one* of the following properties:');
          validationItems = schema.items.oneOf;
        } else if (schema.items.not) {
          text.push('The elements of the array must *not* match the following properties:');
          validationItems = schema.items.not;
        }

        if (validationItems.length > 0) {
          validationItems.forEach((item: any) => {
            text = text.concat(this.generateSchemaSectionText(octothorpes, item.title || name, false, item, subSchemas));
          });
        }
      }

      if (itemsType === 'object') {
        text.push('The array object has the following properties:');
        let textTmp: string[] = [];
        this.generatePropertySection(octothorpes, schema.items, subSchemas).forEach((section) => {
          textTmp = textTmp.concat(section);
        });
        const propTable = this.generatePropTable(octothorpes, name, isRequired, schema.items, subSchemas);
        text.push(propTable);
        text = text.concat(textTmp);
      }
    } else if (schema.oneOf) {
      text.push('The object must be one of the following types:');
      const oneOfArr = schema.oneOf.map((oneOf: any) => {
        return this.generateSchemaSectionText(octothorpes + '#', name, false, oneOf, subSchemas);
      });
      oneOfArr.forEach((type: string) => {
        text = text.concat(type);
      });
    } else if (schema.anyOf) {
      text.push('The object must be any of the following types:');
      const anyOfArr = schema.anyOf.map((anyOf: any) => {
        return this.generateSchemaSectionText(octothorpes + '#', name, false, anyOf, subSchemas);
      });
      anyOfArr.forEach((type: string) => {
        text = text.concat(type);
      });
    } else if (schema.enum) {
      if (!this.hideText.enum) {
        text.push('This element must be one of the following enum values:');
      }
      text.push(
        schema.enum
          .map((enumItem: string) => {
            return '* `' + enumItem + '`';
          })
          .join('\n')
      );
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
      text.push('Additional restrictions:');
      text.push(restrictions);
    }
    return text;
  }

  public generatePropertySection(octothorpes: string, schema: JSONSchema, subSchemas: []): any {
    if (schema.properties) {
      const sections = Object.keys(schema.properties).map((propertyKey) => {
        const propertyIsRequired = schema.required && schema.required.indexOf(propertyKey) >= 0;
        const sectionText = this.generateSchemaSectionText(
          octothorpes + '#',
          propertyKey,
          propertyIsRequired,
          schema.properties[propertyKey],
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
  /**
   *
   * @param octothorpes
   * @param name
   * @param isRequired has to be sent from parent element
   * @param schema
   * @param subSchemas
   */
  generatePropTable(octothorpes: string, name: string, isRequired: boolean, schema: JSONSchema, subSchemas: []): string {
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
        const isRequired = this.isPropertyRequired(schema, key);
        const propType = SchemaTypeFactory.CreatePropTypeInstance(prop, key, isRequired);
        // const propTypeStr = propType.getTypeStr(subSchemas);
        const propTypeMD = propType.getTypeMD(subSchemas);

        const description = prop.description ? replaceSpecialCharsInDescription(prop.description) : '';
        const row = [key, propTypeMD, propType.isPropRequired ? 'required' : '', description];
        return (this.isDebug ? '' : '') + '| ' + row.join(' | ') + ' |';
      });
      propTableTmp = propTableTmp.concat(props);
      const ret = propTableTmp.reduce((p, n) => `${p}${this.propTableLinePrefix}${n}\n`, '\n'); // '\n' + propTableTmp.join('\n');
      return ret;
    }
    return '';
  }
}
