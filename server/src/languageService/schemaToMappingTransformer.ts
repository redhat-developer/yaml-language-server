
import { ASTVisitor } from './utils/astServices';
import { YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference } from 'yaml-ast-parser';
import { JSONSchema } from "./jsonSchema";

export class SchemaToMappingTransformer {

    private kuberSchema : JSONSchema;
    private mappingKuberSchema : JSONSchema;

    constructor(kuberSchema: JSONSchema){
        this.kuberSchema = kuberSchema;
        this.mappingKuberSchema = {};
        this.buildCommandMapFromKuberProperties(this.kuberSchema);
    }

    private buildCommandMapFromKuberProperties(kuberSchema: JSONSchema){
        this.mappingKuberSchema["rootNodes"] = {};
        for(let api_obj in this.kuberSchema.properties){
            for(let prop in this.kuberSchema.properties[api_obj]["properties"]){

                if(!this.mappingKuberSchema["rootNodes"].hasOwnProperty(prop)){
                   this.mappingKuberSchema["rootNodes"][prop] = [];
                }
                
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

                this.mappingKuberSchema["rootNodes"][prop].push(this.kuberSchema.properties[api_obj]["properties"][prop]);


            }
        }

        this.mappingKuberSchema["childrenNodes"] = {};
        for(let api_obj in this.kuberSchema.definitions){

           for(let prop in this.kuberSchema.definitions[api_obj]["properties"]){
         
              if(!this.mappingKuberSchema["childrenNodes"].hasOwnProperty(prop)){
                   this.mappingKuberSchema["childrenNodes"][prop] = [];
              }
        
              if(this.kuberSchema.definitions[api_obj]["properties"][prop]["items"]){
                
                let children = this.kuberSchema.definitions[api_obj]["properties"][prop]["items"]["properties"];
                this.kuberSchema.definitions[api_obj]["properties"][prop]["children"] = [];

                for(let keys in children){
                    this.kuberSchema.definitions[api_obj]["properties"][prop]["children"].push(keys);
                }
                
              }else if(this.kuberSchema.definitions[api_obj]["properties"][prop]["properties"]){
                
                let children = this.kuberSchema.definitions[api_obj]["properties"][prop]["properties"];
                this.kuberSchema.definitions[api_obj]["properties"][prop]["children"] = [];

                for(let keys in children){
                    this.kuberSchema.definitions[api_obj]["properties"][prop]["children"].push(keys);
                }
                
              }else{
                  this.kuberSchema.definitions[api_obj]["properties"][prop]["children"] = [];
              }

              this.mappingKuberSchema["childrenNodes"][prop].push(this.kuberSchema.definitions[api_obj]["properties"][prop]);
               
           
            }
       
        }
    
    }

    public getSchema(){
        return this.mappingKuberSchema;
    }

    public getKuberSchema(){
        return this.kuberSchema;
    }

}