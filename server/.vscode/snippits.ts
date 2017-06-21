export let snippits = {
    "Deployment": {
        "prefix": "Deployment",
        "body": [
            "kind: Deployment",
            "metadata:",
            "  name: ${TM_FILENAME}",
            "  labels:",
            "    app: ${TM_FILENAME}",
            "    version: 1.0.0",
            "spec:",
            "  replicas: 1",
            "  template:",
            "    spec:",
            "      containers:",
            "      - name: main"
        ],
        "description": "Generate deployment"
    },
    "Deployment Config": {
        "prefix": "Deployment Config",
        "body": [
            "kind: DeploymentConfig",
            "apiVersion: v1",
            "metadata:",
            "  name: ${TM_FILENAME}",
            "spec:",
            "  template:",
            "    metadata:",
            "      labels:",
            "        name: ${TM_FILENAME}",
            "    spec:",
            "      containers:",
            "      - name: hello world",
            "        image: example",
            "        ports:",
            "        - containerPort: 8080",
            "          protocol: TCP"
        ],
        "description": "Generate deployment config"
    },
    "Route": {
        "prefix": "Route",
        "body": [
            "apiVersion: v1",
            "kind: Route",
            "metadata:",
            "  name: ${TM_FILENAME}",
            "spec:",
            "  host:",
            "  to:",
            "    kind: Service",
            "    name:"
        ],
        "description": "Generate route"
    },
    "Config Map": {
        "prefix": "Config Map",
        "body": [
            "kind: ConfigMap",
            "metadata:",
            "  name: ${TM_FILENAME}",
            "  namespace: default",
            "data:"
        ],
        "description": "Generate config map"
    },
    "Persistent Volume Claim": {
        "prefix": "Persistent Volume Claim",
        "body": [
            "kind: PersistentVolumeClaim",
            "metadata:",
            "  name: claim",
            "spec:",
            "  accessModes:",
            "  - \"ReadWriteOnce\"",
            "  resources:",
            "    requests:",
            "      storage: 1Gi",
            "  volumeName: pv0001"
        ],
        "description": "Generate Persistent Volume Claim"
    }
}