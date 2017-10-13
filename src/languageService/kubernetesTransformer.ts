export class KubernetesTransformer {

    public static doTransformation(resolve_kubernetes_schema){

        if(resolve_kubernetes_schema.anyOf === undefined){
            let props = resolve_kubernetes_schema.properties;
            resolve_kubernetes_schema.anyOf = [];

            for(let prop in props){
                let currProps = props[prop];
                resolve_kubernetes_schema.anyOf.push(currProps);
            }

            resolve_kubernetes_schema.properties = {};
            
            return resolve_kubernetes_schema;
        }

        return resolve_kubernetes_schema;
        
    }

}