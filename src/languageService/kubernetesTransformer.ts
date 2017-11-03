export class KubernetesTransformer {

    public static doTransformation(resolve_kubernetes_schema){

        if(resolve_kubernetes_schema.anyOfMatching === undefined){
            let props = resolve_kubernetes_schema.properties;
            resolve_kubernetes_schema.anyOfMatching = [];

            for(let prop in props){
                let currProps = props[prop];
                resolve_kubernetes_schema.anyOfMatching.push(currProps);
            }

            resolve_kubernetes_schema.properties = {};
            
            return resolve_kubernetes_schema;
        }

        return resolve_kubernetes_schema;
        
    }

}