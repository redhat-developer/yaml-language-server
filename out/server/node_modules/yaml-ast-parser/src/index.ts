
/**
 * Created by kor on 06/05/15.
 */

import loader = require('./loader');
import dumper = require('./dumper');
import Mark=require("./mark")
export class YAMLException {

    message:string
    reason:string
    name:string
    mark:Mark

    private static CLASS_IDENTIFIER = "yaml-ast-parser.YAMLException";

    public static isInstance(instance : any) : instance is YAMLException {
        if(instance != null && instance.getClassIdentifier
            && typeof(instance.getClassIdentifier) == "function"){

            for (let currentIdentifier of instance.getClassIdentifier()){
                if(currentIdentifier == YAMLException.CLASS_IDENTIFIER) return true;
            }
        }

        return false;
    }

    public getClassIdentifier() : string[] {
        var superIdentifiers = [];

        return superIdentifiers.concat(YAMLException.CLASS_IDENTIFIER);
    }

    constructor(reason:string, mark:Mark=null) {
        this.name = 'YAMLException';
        this.reason = reason;
        this.mark = mark;
        this.message = this.toString(false);
    }

    toString(compact:boolean=false){
        var result;

        result = 'JS-YAML: ' + (this.reason || '(unknown reason)');

        if (!compact && this.mark) {
            result += ' ' + this.mark.toString();
        }

        return result;

    }
}

export enum Kind{
    SCALAR,
    MAPPING,
    MAP,
    SEQ,
    ANCHOR_REF,
    INCLUDE_REF
}
export type Error = YAMLException
export interface YAMLDocument {
    startPosition:number
    endPosition:number
    errors:YAMLException[]
}
export interface YAMLNode extends YAMLDocument{
    startPosition:number
    endPosition:number
    kind:Kind
    anchorId?:string
    valueObject?:any
    parent:YAMLNode
    errors:YAMLException[]
    value?:any
    key?:any
    mappings?:any
}

export interface YAMLAnchorReference extends YAMLNode{
    referencesAnchor:string
    value:YAMLNode
}
export interface YAMLScalar extends YAMLNode{
    value:string
    doubleQuoted?:boolean
    plainScalar?:boolean
}

export interface YAMLMapping extends YAMLNode{
    key:YAMLScalar
    value:YAMLNode
}
export interface YAMLSequence extends YAMLNode{
    items:YAMLNode[]
}
export interface YamlMap extends YAMLNode{
    mappings:YAMLMapping[]
}
export function newMapping(key:YAMLScalar,value:YAMLNode):YAMLMapping{
    var end = (value ? value.endPosition : key.endPosition + 1); //FIXME.workaround, end should be defied by position of ':'
    //console.log('key: ' + key.value + ' ' + key.startPosition + '..' + key.endPosition + ' ' + value + ' end: ' + end);
    var node = {
        key: key,
        value: value,
        startPosition: key.startPosition,
        endPosition: end,
        kind: Kind.MAPPING,
        parent: null,
        errors: []
    };
    return node
}
export function newAnchorRef(key:string,start:number,end:number,value:YAMLNode):YAMLAnchorReference{
    return {
        errors:[],
        referencesAnchor:key,
        value:value,
        startPosition:start,
        endPosition:end,
        kind:Kind.ANCHOR_REF,
        parent:null
    }
}
export function newScalar(v:string=""):YAMLScalar{
    return {
        errors:[],
        startPosition:-1,
        endPosition:-1,
        value:v,
        kind:Kind.SCALAR,
        parent:null,
        doubleQuoted:false
    }
}
export function newItems():YAMLSequence{
    return {
        errors:[],
        startPosition:-1,
        endPosition:-1,
        items:[],
        kind:Kind.SEQ,
        parent:null
    }
}
export function newSeq():YAMLSequence{
    return newItems();
}
export function newMap(mappings?: YAMLMapping[]):YamlMap{
    return {
        errors:[],
        startPosition:-1,
        endPosition:-1,
        mappings: mappings ? mappings : [],
        kind:Kind.MAP,
        parent:null
    }
}


function deprecated(name) {
    return function () {
        throw new Error('Function ' + name + ' is deprecated and cannot be used.');
    };
}

export var load= loader.load;
export var loadAll             = loader.loadAll;
export var safeLoad            = loader.safeLoad;
export var dump                = dumper.dump;
export var safeDump            = dumper.safeDump;
