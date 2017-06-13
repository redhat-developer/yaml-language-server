[![Build Status](https://travis-ci.org/gorkem/vscode-k8s.svg?branch=master)](https://travis-ci.org/gorkem/vscode-k8s)

# Kubernetes extension for VS Code
VS Code extension that provides asssitance for authoring kubernetes 
and Openshift configuration.

## Features 
![screencast](https://github.com/JPinkney/vscode-k8s/blob/master/images/demo.gif)

YAML validation:

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Detects whether the entire file is valid yaml

Kubernetes validation:

&nbsp;&nbsp;&nbsp;&nbsp;Detects errors such as:

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Child node does not exist

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Command not found in kubernetes

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Incorrect type of value

Kubernetes auto completion:

&nbsp;&nbsp;&nbsp;&nbsp;Auto completes on all commands and resorts to defaults for the value if found

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
  
### Configuring the extension for testing
In order to configure the extension for autocompletion you need to change edit.quickSuggestions.strings to true

1. Open up your settings.json file by going to VS code settings
2. Under the editor tab scroll down until you find "editor.quickSuggestions"
3. Edit this and make sure that "strings" is set to true (otherwise autocomplete will not work)
