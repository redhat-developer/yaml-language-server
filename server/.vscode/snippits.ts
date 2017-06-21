export let snippits = {
    "deployment": {
        "prefix": "deployment",
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
    "deployment config": {
        "prefix": "deployment config",
        "body": [
            "apiVersion: v1",
            "kind: DeploymentConfig",
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
    "route": {
        "prefix": "route",
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
    "config map": {
        "prefix": "config map",
        "body": [
            "kind: ConfigMap",
            "metadata:",
            "  name: ${TM_FILENAME}",
            "  namespace: default",
            "data:"
        ],
        "description": "Generate config map"
    },
    "persistent volume claim": {
        "prefix": "persistent volume claim",
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