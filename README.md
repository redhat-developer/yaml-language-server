[![Build Status](https://travis-ci.org/gorkem/vscode-k8s.svg?branch=master)](https://travis-ci.org/gorkem/vscode-k8s)

# Kubernetes extension for VS Code
VS Code extension that provides assistance for authoring kubernetes and Openshift configurations.

## Features 
![screencast](https://github.com/JPinkney/vscode-k8s/blob/master/images/demo.gif)

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
4. Snippets:
    * Snippets for creating deployment, deployment config, route, config map, persistent volume claim. *specifically for kubernetes*
5. Hover support:
    * Hovering over a node shows description *if available*
6. Additional Commands:
    * Commands for allowing the user to turn on/off validation of the specific yaml file they are working on

## Supported VS Code Configuration Settings
`k8s.filesNotValidating` : List of files you DO NOT want to validate

`k8s.k8sSchemaOn` : Whether the files are being validated against kubernetes schema

`k8s.kedgeSchemaOn` : Whether the files are being validated against kedge schema

NOTE: If both k8sSchemaOn and kedgeSchemaOn are true it defaults to only kubernetes schema so they do not clash. Additionally, if k8sSchemaOn and kedgeSchemaOn are both false it defaults to kubernetes schema. If you want to turn off schema specific features then use the commands for keybindings `extension.k8s.disableValidation`

## Supported VS Code Commands for Keybindings
`extension.k8s.enableValidation` : Enable Kubernetes Validation for the file you are on
`extension.k8s.disableValidation` : Disable Kubernetes Validation for the file you are on

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
5. Install the dependencies for client
  ```bash
  cd ../client
  $ npm install
  ```
6. Open client on VS Code
  ```bash
  cd ..
  code ./client
  ```
7. Open server on VS Code
  ```bash
  code ./server
  ```
  Refer to VS Code [documentation](https://code.visualstudio.com/docs/extensions/debugging-extensions) on how to run and debug the extension
