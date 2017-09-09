[![Build Status](https://travis-ci.org/redhat-developer/yaml-language-server.svg?branch=master)](https://travis-ci.org/redhat-developer/yaml-language-server)

# Yaml Language Server

## Features 
![screencast](https://github.com/redhat-developer/yaml-language-server/blob/master/images/demo.gif)

1. YAML validation:
    * Detects whether the entire file is valid yaml
2. Validation:
    * Detects errors such as:
        * Node is not found   
        * Node has an invalid key node type
        * Node has an invalid type
        * Node is not a valid child node
    * Detects warnings such as:
        * Node is an additional property of parent
3. Auto completion:
    * Auto completes on all commands
    * Scalar nodes autocomplete to schema's defaults if they exist
4. Hover support:
    * Hovering over a node shows description *if available*

# Language Server Settings
`yaml.schemas`: The entrance point for new schema.
```
yaml.schemas: {
    "url": "globPattern",
    "kedge": "globPattern",
    "kubernetes": "globPattern"
}
```
kedge and kubernetes are optional fields. They do not require a url as the language server will provide that. You just need the key word kedge/kubernetes and a glob pattern.

## Developer Support

### Getting started
1. Install prerequisites:
   * latest [Visual Studio Code](https://code.visualstudio.com/)
   * [Node.js](https://nodejs.org/) v6.0.0 or higher
2. Fork and clone this repository
3. `cd vscode-k8s`
4. Install the dependencies for server
	```bash
	cd server
	$ npm install
	```
5. Build the language server
	```bash
	npm run compile
	```
6. The new built server is now location in out/server/src/server.js.
	```bash
	node (Yaml Language Server Location)/out/server/src/server.js
	```
Refer to VS Code [documentation](https://code.visualstudio.com/docs/extensions/debugging-extensions) on how to run and debug the extension
