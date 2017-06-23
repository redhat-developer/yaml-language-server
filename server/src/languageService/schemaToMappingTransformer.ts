
import { ASTVisitor } from './utils/astServices';
import { YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference } from 'yaml-ast-parser-beta';
import { JSONSchema } from "./jsonSchema";

export class SchemaToMappingTransformer {

    private kuberSchema : JSONSchema;
    private mappedKuberSchema : JSONSchema;
    private autoCompletionSchema: JSONSchema;
    private kuberSchemaUnchanged: JSONSchema;

    constructor(kuberSchema: JSONSchema){
        this.kuberSchemaUnchanged = kuberSchema;
        this.kuberSchema = kuberSchema;
        this.mappedKuberSchema = this.buildCommandMapFromKuberProperties();
        //this.autoCompletionSchema = this.buildAutocompletionFromKuberProperties();
    }

    private buildCommandMapFromKuberProperties(){
        let mappingKuberSchema = {};
        mappingKuberSchema["rootNodes"] = {};
        for(let api_obj in this.kuberSchema.properties){
            for(let prop in this.kuberSchema.properties[api_obj]["properties"]){

                if(!mappingKuberSchema["rootNodes"].hasOwnProperty(prop)){
                   mappingKuberSchema["rootNodes"][prop] = [];
                }

                this.kuberSchema.properties[api_obj]["properties"][prop]["rootObj"] = api_obj;
                if(this.kuberSchema.properties[api_obj]["properties"][prop]["items"]){
                
                    let children = this.kuberSchema.properties[api_obj]["properties"][prop]["items"]["properties"];
                    this.kuberSchema.properties[api_obj]["properties"][prop]["children"] = [];
                    
                    for(let keys in children){
                        this.kuberSchema.properties[api_obj]["properties"][prop]["children"].push(keys);
                    }
                
                }else if(this.kuberSchema.properties[api_obj]["properties"][prop]["properties"]){
                    
                    let children = this.kuberSchema.properties[api_obj]["properties"][prop]["properties"];
                    this.kuberSchema.properties[api_obj]["properties"][prop]["children"] = [];

                    for(let keys in children){
                        this.kuberSchema.properties[api_obj]["properties"][prop]["children"].push(keys);
                    }
                    
                }else{
                    this.kuberSchema.properties[api_obj]["properties"][prop]["children"] = [];
                }

                mappingKuberSchema["rootNodes"][prop].push(this.kuberSchema.properties[api_obj]["properties"][prop]);


            }
        }

        mappingKuberSchema["childrenNodes"] = {};
        for(let api_obj in this.kuberSchema.definitions){

           for(let prop in this.kuberSchema.definitions[api_obj]["properties"]){
         
              if(!mappingKuberSchema["childrenNodes"].hasOwnProperty(prop)){
                   mappingKuberSchema["childrenNodes"][prop] = [];
              }
        
              this.kuberSchema.definitions[api_obj]["properties"][prop]["rootObj"] = api_obj;

              if(this.kuberSchema.definitions[api_obj]["properties"][prop]["items"]){
                
                let children = this.kuberSchema.definitions[api_obj]["properties"][prop]["items"]["properties"];
                this.kuberSchema.definitions[api_obj]["properties"][prop]["children"] = [];
                this.kuberSchema.definitions[api_obj]["properties"][prop]["childRef"] = this.kuberSchema.definitions[api_obj]["properties"][prop]["items"]["$ref"];

                for(let keys in children){
                    this.kuberSchema.definitions[api_obj]["properties"][prop]["children"].push(keys);
                }
                
              }else if(this.kuberSchema.definitions[api_obj]["properties"][prop]["properties"]){
                
                let children = this.kuberSchema.definitions[api_obj]["properties"][prop]["properties"];
                this.kuberSchema.definitions[api_obj]["properties"][prop]["children"] = [];
                this.kuberSchema.definitions[api_obj]["properties"][prop]["childRef"] = this.kuberSchema.definitions[api_obj]["properties"][prop]["$ref"];

                for(let keys in children){
                    this.kuberSchema.definitions[api_obj]["properties"][prop]["children"].push(keys);
                }
                
              }else{
                  this.kuberSchema.definitions[api_obj]["properties"][prop]["children"] = [];
                  this.kuberSchema.definitions[api_obj]["properties"][prop]["childRef"] = this.kuberSchema.definitions[api_obj]["properties"][prop]["$ref"];
              }

              mappingKuberSchema["childrenNodes"][prop].push(this.kuberSchema.definitions[api_obj]["properties"][prop]);              
           
            }
    
        }

        return mappingKuberSchema;
    
    }

    public getSchema(){
        return this.mappedKuberSchema;
    }

    public getKuberSchema(){
        return this.kuberSchema;
    }

}