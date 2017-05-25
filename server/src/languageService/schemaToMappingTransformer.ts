
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
        
        for(let api_obj in this.kuberSchema.definitions){

           for(let prop in this.kuberSchema.definitions[api_obj]["properties"]){
         
              if(!this.mappingKuberSchema.hasOwnProperty(prop)){
                   this.mappingKuberSchema[prop] = [];
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

              this.mappingKuberSchema[prop].push(this.kuberSchema.definitions[api_obj]["properties"][prop]);
               
           
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