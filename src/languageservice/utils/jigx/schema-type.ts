/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { JSONSchema } from 'vscode-json-languageservice';
import {
  char_gt,
  char_lt,
  createInstance,
  getFileInfo,
  getSchemaRefTypeTitle,
  tableColumnSeparator,
  translateSectionTitleToLinkHeder,
} from './jigx-utils';
import { Globals } from './globals';

type S_SimpleType = 'array' | 'boolean' | 'integer' | 'null' | 'number' | 'object' | 'string';
type S_Properties = { [key: string]: Schema_AnyType };

export type Schema_ComplexType =
  | Schema_Object
  | Schema_ArrayTyped
  | Schema_ArrayGeneric
  | Schema_ObjectTyped
  | Schema_Enum
  | Schema_AnyOf
  | Schema_SimpleAnyOf
  | Schema_Undefined;
export type Schema_AnyType = Schema_SimpleType | Schema_ComplexType;

export class Schema_TypeBase {
  title?: string;
  description?: string;
  type?: any;
  propName?: string;
  isPropRequired?: boolean;
  getTypeStr(subSchemas: []): string {
    return this.type || 'undefined';
  }
  /**
   * Get section title: `name (type, required)`
   * @param octothorpes
   * @param subSchemas
   * @param isMD
   */
  getElementTitle(octothorpes: string, subSchemas: [], isMD = true): string {
    const extra = [];
    let typeStr = this.getTypeStr(subSchemas);
    if (isMD && (this instanceof Schema_AnyOf || this instanceof Schema_ArrayGeneric || this instanceof Schema_ArrayTyped)) {
      typeStr = this.getTypeMD(subSchemas, true);
    }

    if (typeStr) {
      extra.push(typeStr);
    }
    if (this.isPropRequired) {
      extra.push('required');
    }
    const extraStr = extra.length ? ` (${extra.join(', ')})` : '';
    const propNameQuoted = this.propName ? `\`${this.propName}\`` : '';
    const mdTitle = `${octothorpes} ${propNameQuoted}${extraStr}`;
    // if we need custom section link...
    // const htmlTitle = `\<h${octothorpes.length} id="${this.propName}" \>${this.propName ? `\<code\>${this.propName}\</code\>` : ''}${extraStr}\</h${octothorpes.length}\>`;
    return mdTitle;
  }
  getTypeMD(subSchemas: []): string {
    return this.getTypeStr(subSchemas);
  }
}

export class Schema_SimpleType extends Schema_TypeBase {
  type: 'boolean' | 'integer' | 'null' | 'number' | 'string';
  const?: string;
}

export function hasTypePropertyTable(obj: any): obj is Schema_HasPropertyTable {
  return obj.getPropertyTable;
}
export interface Schema_HasPropertyTable {
  getPropertyTable: (octothorpes: string, schema: JSONSchema, subSchemas: []) => string[];
}
export class Schema_ObjectTyped extends Schema_TypeBase {
  $ref: string;
  getTypeStr(subSchemas: []): string {
    const subType = subSchemas[this.$ref] ? subSchemas[this.$ref] : getSchemaRefTypeTitle(this.$ref);
    return `${subType}`;
  }
  getTypeMD(subSchemas: []): string {
    const subType = this.getTypeStr(subSchemas);
    // let link = this.propName ? `${this.propName} (${subType})` : subType;
    let link = this.getElementTitle('', subSchemas, false);

    if (this.$ref.includes('.schema.json')) {
      const fileInfo = getFileInfo(subType);
      link = `${fileInfo.navigationPath + fileInfo.componentId}`;
      const linkSubType = this.$ref.match(/.schema.json#\/definitions\/(.*)$/);
      if (linkSubType) {
        link += translateSectionTitleToLinkHeder(linkSubType[1]) + '-object';
      }
    } else {
      link = translateSectionTitleToLinkHeder(link);
    }

    const typeProcessed = `[${subType}](${link})`;
    return typeProcessed;
  }
}
export class Schema_Object extends Schema_TypeBase implements Schema_HasPropertyTable {
  type: 'object';
  properties: S_Properties;
  getPropertyTable(octothorpes: string, schema: JSONSchema, subSchemas: []): string[] {
    const out = Object.keys(this.properties).map((key) => {
      const prop = this.properties[key];
      return key;
    });
    return out;
  }
  getTypeStr(subSchemas: []): string {
    return `${this.type}`;
  }
  getTypeMD(subSchemas: [], isForElementTitle = false): string {
    const subType = this.getTypeStr(subSchemas);
    if (Globals.enableLink) {
      let link = this.getElementTitle('', subSchemas, false);

      link = translateSectionTitleToLinkHeder(link);
      link = SchemaTypeFactory.EnsureUniqueLink(link, isForElementTitle);
      const typeProcessed = `[${subType}](${link})`;
      return typeProcessed;
    } else {
      return `\`${subType}\``;
    }
  }
}
export class Schema_Enum extends Schema_TypeBase {
  type: S_SimpleType;
  enum: string[];
  getTypeStr(): string {
    return `enum${char_lt}${this.type}${char_gt}`;
  }
}

export class Schema_ArrayTyped extends Schema_TypeBase {
  type: 'array';
  items: Schema_AnyType;
  getTypeStr(subSchemas: []): string {
    const item = SchemaTypeFactory.CreatePropTypeInstance(this.items);
    const subType = item.getTypeStr(subSchemas);
    return `${subType}[]`;
  }
  getTypeMD(subSchemas: [], isForElementTitle = false): string {
    const item = SchemaTypeFactory.CreatePropTypeInstance(
      this.items,
      this.propName,
      this.isPropRequired /* jc-line-chart:series(object[])required */
    );
    const subType = item.getTypeMD(subSchemas, isForElementTitle);
    return `${subType}[]`;
  }
}

export class Schema_SimpleAnyOf extends Schema_TypeBase {
  type: S_SimpleType[];
  getTypeStr(subSchemas: []): string {
    const subType = this.type.join(tableColumnSeparator);
    return `${subType}`;
  }
}

export class Schema_AnyOf extends Schema_TypeBase {
  type: undefined;
  anyOf: Schema_AnyType[];
  getTypeStr(subSchemas: []): string {
    const subType = this.anyOf
      .map((item) => {
        item = SchemaTypeFactory.CreatePropTypeInstance(item);
        const subSubType = item.getTypeStr(subSchemas);
        return subSubType;
      })
      .join(tableColumnSeparator);
    return `${subType}`;
  }
  getTypeMD(subSchemas: [], isForElementTitle = false): string {
    const subType = this.anyOf
      .map((item) => {
        item = SchemaTypeFactory.CreatePropTypeInstance(item, this.propName);
        let subSubType = item.getTypeMD(subSchemas, isForElementTitle);
        subSubType = subSubType.replace('-required', ''); //if anyOf type, section title don't have required parameter
        return subSubType;
      })
      .join(tableColumnSeparator);
    return `${subType}`;
  }
}

export class Schema_Undefined extends Schema_TypeBase {
  getTypeStr(subSchemas: []): string {
    return '';
  }
}

export class Schema_ArrayGeneric extends Schema_TypeBase {
  type: 'array';
  items: {
    anyOf: Schema_AnyType[];
  };
  getTypeStr(subSchemas: []): string {
    const subType = this.items.anyOf
      .map((item) => {
        item = SchemaTypeFactory.CreatePropTypeInstance(item);
        const subSubType = item.getTypeStr(subSchemas);
        return subSubType;
      })
      .join(tableColumnSeparator);
    return `Array${char_lt}${subType}${char_gt}`;
  }
  getTypeMD(subSchemas: [], isForElementTitle = false): string {
    const subType = this.items.anyOf
      .map((item) => {
        item = SchemaTypeFactory.CreatePropTypeInstance(item, this.propName);
        const subSubType = item.getTypeMD(subSchemas, isForElementTitle);
        return subSubType;
      })
      .join(tableColumnSeparator);
    return `Array${char_lt}${subType}${char_gt}`;
  }
}

export class SchemaType {
  '$schema': string;
  '$id': string;
  title: string;
  description: string;
  //$comment, $ref, default,readonly,...
  definitions: unknown;
  properties: S_Properties;
}
export class SchemaTypeFactory {
  //when type is 'object | object | object' it's need to add index to link
  public static UniqueLinks: { link: string; index?: number; isForElementTitle: boolean }[];
  public static EnsureUniqueLink(link: string, isForElementTitle: boolean): string {
    const lastNotUniqueType = this.UniqueLinks.filter((tu) => tu.link == link && tu.isForElementTitle == isForElementTitle).slice(
      -1
    )[0]; //get last equal link
    let newIndex = undefined;
    if (lastNotUniqueType) {
      newIndex = (lastNotUniqueType.index || 0) + 1;
    }
    this.UniqueLinks.push({ link: link, index: newIndex, isForElementTitle });
    return link + (newIndex ? '-' + newIndex : '');
  }

  public static CreatePropTypeInstance(schema: JSONSchema, propName?: string, isPropRequired?: boolean): Schema_AnyType {
    isPropRequired =
      isPropRequired !== undefined ? isPropRequired : (schema.required && schema.required.indexOf(propName) >= 0) || false;
    if (schema.type) {
      if (schema.type == 'array' && schema.items) {
        // const arrStr = getActualTypeStr(schema.items, subSchemas) + '[]';
        // let arrType = getActualTypeStr(schema.items, subSchemas);
        if ((<JSONSchema>schema.items).anyOf) {
          return createInstance(Schema_ArrayGeneric, schema, { propName, isPropRequired }); // `Array<${arrType}>`;
        }
        return createInstance(Schema_ArrayTyped, schema, { propName, isPropRequired }); //  arrType + '[]';
      } else if (schema.type instanceof Array) {
        return createInstance(Schema_SimpleAnyOf, schema, { propName, isPropRequired }); // schema.type.join(tableColumnSeparator);
      } else if (schema.enum) {
        return createInstance(Schema_Enum, schema, { propName, isPropRequired });
      } else if (schema.type === 'object' && schema.properties) {
        return createInstance(Schema_Object, schema, { propName, isPropRequired });
      }
      return createInstance(Schema_SimpleType, schema, { propName, isPropRequired }); //schema.type
    } else if (schema['$ref']) {
      return createInstance(Schema_ObjectTyped, schema, { propName, isPropRequired });
      // if (subSchemas[schema['$ref']]) {
      // 	return subSchemas[schema['$ref']]
      // } else {
      // 	return getSchemaRefTypeTitle(schema.$ref);
      // }
    } else if (schema.oneOf || schema.anyOf) {
      return createInstance(Schema_AnyOf, schema, { propName, isPropRequired });
      // return (schema.oneOf || schema.anyOf).map((i: any) => getActualTypeStr(i, subSchemas)).join(tableColumnSeparator);
    } else {
      return createInstance(Schema_Undefined, schema, { propName, isPropRequired });
    }
  }
}
