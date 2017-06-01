[![Build Status](https://travis-ci.org/gorkem/vscode-k8s.svg?branch=master)](https://travis-ci.org/gorkem/vscode-k8s)

# Kubernetes extension for VS Code
VS Code extension that provides asssitance for authoring kubernetes 
and Openshift configuration.

## Features 
* YAML validation
* Kubernetes validation

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
