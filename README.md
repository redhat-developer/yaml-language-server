[![Build Status](https://travis-ci.org/redhat-developer/yaml-language-server.svg?branch=master)](https://travis-ci.org/redhat-developer/yaml-language-server) [![version](https://img.shields.io/npm/v/yaml-language-server.svg)](https://www.npmjs.com/package/yaml-language-server) [![Coverage Status](https://coveralls.io/repos/github/redhat-developer/yaml-language-server/badge.svg?branch=master)](https://coveralls.io/github/redhat-developer/yaml-language-server?branch=master)

# YAML Language Server

## Features

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

## Language Server Settings
`yaml.schemas`: The entrance point for new schema.
```
yaml.schemas: {
    "url": "globPattern",
    "kubernetes": "globPattern",
    "kedge": "globPattern"
}
```
kubernetes and kedge are optional fields. They do not require URLs as the language server will provide that. You just need the keywords kubernetes/kedge and a glob pattern.

## Clients
This repository only contains the server implementation. Here are some known clients consuming this server:

* [Eclipse Che](https://www.eclipse.org/che/)
* [vscode-yaml](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) for VSCode
* [ide-yaml](https://atom.io/packages/ide-yaml) for Atom editor

## Developer Support

### Getting started
1. Install prerequisites:
   * latest [Visual Studio Code](https://code.visualstudio.com/)
   * [Node.js](https://nodejs.org/) v6.0.0 or higher
2. Fork and clone this repository
3. Install the dependencies
	```bash
    cd yaml-language-server
	$ npm install
	```
4. Build the language server
	```bash
	$ npm run compile
	```
5. The new built server is now location in out/server/src/server.js.
	```bash
	node (Yaml Language Server Location)/out/server/src/server.js [--stdio]
	```

### Connecting to the language server via stdio
We have included the option to connect to the language server via [stdio](https://github.com/redhat-developer/yaml-language-server/blob/681985b5a059c2cb55c8171235b07e1651b6c546/src/server.ts#L46-L51) to help with intergrating the language server into different clients.