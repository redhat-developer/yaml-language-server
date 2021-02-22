/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { JSONSchema } from 'vscode-json-languageservice';
import { IProblem } from '../../parser/jsonParser07';
import { getSchemaRefTypeTitle } from '../schemaUtils';
import { Globals } from './globals';
import {
  char_gt,
  char_lt,
  createInstance,
  getFileInfo,
  Instantiable,
  tableColumnSeparator,
  toTsBlock,
  translateSectionTitleToLinkHeder,
} from './jigx-utils';

type S_SimpleType = 'array' | 'boolean' | 'integer' | 'null' | 'number' | 'object' | 'string';
type S_Properties = { [key: string]: Schema_AnyType };

export type Schema_ComplexType =
  | Schema_Object
  | Schema_ArrayTyped
  | Schema_ArrayGeneric
  | Schema_ObjectTyped
  | Schema_Enum
  | Schema_Const
  | Schema_AnyOf
  | Schema_SimpleAnyOf
  | Schema_Undefined;
export type Schema_AnyType = Schema_SimpleType | Schema_ComplexType;

export class Schema_TypeBase implements Instantiable {
  title?: string;
  description?: string;
  type?: any;
  propName?: string;
  isPropRequired?: boolean;
  problem?: IProblem;
  initialize(): void {
    //
  }

  getTypeStr(subSchemas: []): string {
    return this.type || 'undefined';
  }
  /**
   * Get section title: `name (type, required)`
   * @param octothorpes
   * @param subSchemas
   * @param isMD
   */
  getElementTitle(octothorpes: string, subSchemas: [], isMD = true, styleAsMd = false): string {
    const extra = [];
    let typeStr = this.getTypeStr(subSchemas);
    if (isMD && (this instanceof Schema_AnyOf || this instanceof Schema_ArrayGeneric || this instanceof Schema_ArrayTyped)) {
      typeStr = this.getTypeMD(subSchemas, true);
    }

    if (typeStr) {
      extra.push(typeStr);
    }
    // if (this.isPropRequired) {
    //   extra.push('required');
    // }
    const extraStr = extra.length ? ` ${extra.join(', ')}` : '';
    // const extraStr = extra.length ? ` (${extra.join(', ')})` : '';
    // const propNameQuoted = this.propName ? `\`${this.propName}\`` : '';
    const propNameQuoted = this.propName ? toTsBlock(this.propName + ':' + extraStr, octothorpes.length) : '';
    // const mdTitle = `${octothorpes} ${propNameQuoted}${extraStr}`;
    const mdTitle = `${octothorpes} ${propNameQuoted}`;
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
  initialize(): void {
    this.$ref = Schema_ObjectTyped.get$ref(this);
  }
  getTypeStr(subSchemas: []): string {
    const subType = subSchemas[this.$ref] ? subSchemas[this.$ref] : getSchemaRefTypeTitle(this.$ref);
    return `${subType}`;
  }
  getTypeMD(subSchemas: []): string {
    const subType = this.getTypeStr(subSchemas);
    if (Globals.enableLink) {
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
    } else {
      return subType;
    }
  }
  static get$ref(schema: any): string {
    return schema.$ref || schema._$ref;
  }
}
export class Schema_Object extends Schema_TypeBase implements Schema_HasPropertyTable {
  type: 'object';
  $id?: string;
  $ref?: string;
  properties: S_Properties;
  required?: string[];
  initialize(): void {
    this.$ref = Schema_ObjectTyped.get$ref(this);
  }
  getPropertyTable(octothorpes: string, schema: JSONSchema, subSchemas: []): string[] {
    const out = Object.keys(this.properties).map((key) => {
      const prop = this.properties[key];
      return key;
    });
    return out;
  }
  getTypeStr(subSchemas: []): string {
    //In this project Object is also used as ObjectTyped. yaml parser 'remove' information about $ref. parser puts here directly the object.
    // - but _$ref is re-added in yamlSchemaService to have class name
    //This is ok because we wont to show props from this object.
    //Only difference is that we need to show typed obj info.

    //note title is title of schema, so if type is defined inside the schema, title is useless
    //jigx-builder custom: try to build object title instead of 'object' string
    if (this.$id) {
      // return `${this.$id.replace('.schema.json', '')}`;
      const type = getSchemaRefTypeTitle(this.$id);
      return type;
    }
    if (this.$ref) {
      const type = getSchemaRefTypeTitle(this.$ref);
      return type;
    }
    //last try is to check with magic if there is some const type.
    const hasRequiredConst = Object.keys(this.properties || {})
      .filter((k) => this.required?.includes(k) && (this.properties[k] as Schema_Const).const)
      .map((k) => {
        return (this.properties[k] as Schema_Const).const;
      });
    if (hasRequiredConst.length) {
      return hasRequiredConst[0];
    }
    const typeStr = this.title || this.type; //object
    return typeStr;
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
      return `${subType}`;
    }
  }
  static getSchemaType(schema: JSONSchema): string {
    const schemaInst = createInstance(Schema_Object, schema);
    return schemaInst.getTypeStr([]);
  }
}
export class Schema_Enum extends Schema_TypeBase {
  type: S_SimpleType;
  enum: string[];
  getTypeStr(): string {
    return `Enum${char_lt}${this.type}${char_gt}`;
  }
}
export class Schema_Const extends Schema_TypeBase {
  type: 'const';
  const: string;
  getTypeStr(): string {
    return `\`${this.const}\``;
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
  additionalProperties?: Schema_AnyOf;
  get anyOfCombined(): Schema_AnyType[] {
    return [
      ...(this.anyOf || []),
      ...(this.additionalProperties && this.additionalProperties.anyOf ? this.additionalProperties.anyOf : []),
    ];
  }
  getTypeStr(subSchemas: []): string {
    const subType = this.anyOfCombined
      .map((item) => {
        item = SchemaTypeFactory.CreatePropTypeInstance(item);
        const subSubType = item.getTypeStr(subSchemas);
        return subSubType;
      })
      .join(tableColumnSeparator);
    return `${subType}`;
  }
  getTypeMD(subSchemas: [], isForElementTitle = false): string {
    const subType = this.anyOfCombined
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
      } else if (
        schema.type === 'object' &&
        schema.additionalProperties &&
        typeof schema.additionalProperties !== 'boolean' &&
        schema.additionalProperties &&
        schema.additionalProperties.anyOf
      ) {
        return createInstance(Schema_AnyOf, schema, { propName, isPropRequired });
      } else if (schema.const) {
        return createInstance(Schema_Const, schema, { propName, isPropRequired });
      } else if (Schema_ObjectTyped.get$ref(schema)) {
        //has to be also here because parser gives to some $ref types also real type automatically
        //in doc, this don't have to be there
        return createInstance(Schema_ObjectTyped, schema, { propName, isPropRequired });
      }
      return createInstance(Schema_SimpleType, schema, { propName, isPropRequired }); //schema.type
    } else if (Schema_ObjectTyped.get$ref(schema)) {
      //won't never used. Schema_Object is used instead - schema structure is little bit different
      //parser gives to some $ref types also real type automatically - so condition for schema.type is used
      return createInstance(Schema_ObjectTyped, schema, { propName, isPropRequired });
    } else if (schema.oneOf || schema.anyOf) {
      return createInstance(Schema_AnyOf, schema, { propName, isPropRequired });
      // return (schema.oneOf || schema.anyOf).map((i: any) => getActualTypeStr(i, subSchemas)).join(tableColumnSeparator);
    } else {
      return createInstance(Schema_Undefined, schema, { propName, isPropRequired });
    }
  }
}
