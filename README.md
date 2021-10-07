![CI](https://github.com/redhat-developer/yaml-language-server/workflows/CI/badge.svg) [![Build Status](https://travis-ci.org/redhat-developer/yaml-language-server.svg?branch=main)](https://travis-ci.org/redhat-developer/yaml-language-server) [![version](https://img.shields.io/npm/v/yaml-language-server.svg)](https://www.npmjs.com/package/yaml-language-server) [![Coverage Status](https://coveralls.io/repos/github/redhat-developer/yaml-language-server/badge.svg?branch=main)](https://coveralls.io/github/redhat-developer/yaml-language-server?branch=main)

# YAML Language Server

Supports JSON Schema 7 and below.
Starting from `1.0.0` the language server uses [eemeli/yaml](https://github.com/eemeli/yaml) as the new YAML parser, which strictly enforces the specified YAML spec version. Default YAML spec version is `1.2`, it can be changed with `yaml.yamlVersion` setting.

## Features

1. YAML validation:
   - Detects whether the entire file is valid yaml
2. Validation:
   - Detects errors such as:
     - Node is not found
     - Node has an invalid key node type
     - Node has an invalid type
     - Node is not a valid child node
   - Detects warnings such as:
     - Node is an additional property of parent
3. Auto completion:
   - Auto completes on all commands
   - Scalar nodes autocomplete to schema's defaults if they exist
4. Hover support:
   - Hovering over a node shows description _if available_
5. Document outlining:
   - Shows a complete document outline of all nodes in the document

## Language Server Settings

The following settings are supported:

- `yaml.yamlVersion`: Set default YAML spec version (1.2 or 1.1)
- `yaml.format.enable`: Enable/disable default YAML formatter (requires restart)
- `yaml.format.singleQuote`: Use single quotes instead of double quotes
- `yaml.format.bracketSpacing`: Print spaces between brackets in objects
- `yaml.format.proseWrap`: Always: wrap prose if it exeeds the print width, Never: never wrap the prose, Preserve: wrap prose as-is
- `yaml.format.printWidth`: Specify the line length that the printer will wrap on
- `yaml.validate`: Enable/disable validation feature
- `yaml.hover`: Enable/disable hover
- `yaml.completion`: Enable/disable autocompletion
- `yaml.schemas`: Helps you associate schemas with files in a glob pattern
- `yaml.schemaStore.enable`: When set to true the YAML language server will pull in all available schemas from [JSON Schema Store](https://www.schemastore.org/json/)
- `yaml.schemaStore.url`: URL of a schema store catalog to use when downloading schemas.
- `yaml.customTags`: Array of custom tags that the parser will validate against. It has two ways to be used. Either an item in the array is a custom tag such as "!Ref" and it will automatically map !Ref to scalar or you can specify the type of the object !Ref should be e.g. "!Ref sequence". The type of object can be either scalar (for strings and booleans), sequence (for arrays), map (for objects).
- `yaml.maxItemsComputed`: The maximum number of outline symbols and folding regions computed (limited for performance reasons).
- `[yaml].editor.tabSize`: the number of spaces to use when autocompleting. Takes priority over editor.tabSize.
- `editor.tabSize`: the number of spaces to use when autocompleting. Default is 2.
- `http.proxy`: The URL of the proxy server that will be used when attempting to download a schema. If it is not set or it is undefined no proxy server will be used.
- `http.proxyStrictSSL`: If true the proxy server certificate should be verified against the list of supplied CAs. Default is false.
- `[yaml].editor.formatOnType`: Enable/disable on type indent and auto formatting array

##### Adding custom tags

In order to use the custom tags in your YAML file you need to first specify the custom tags in the setting of your code editor. For example, we can have the following custom tags:

```YAML
"yaml.customTags": [
    "!Scalar-example scalar",
    "!Seq-example sequence",
    "!Mapping-example mapping"
]
```

The !Scalar-example would map to a scalar custom tag, the !Seq-example would map to a sequence custom tag, the !Mapping-example would map to a mapping custom tag.

We can then use the newly defined custom tags inside our YAML file:

```YAML
some_key: !Scalar-example some_value
some_sequence: !Seq-example
  - some_seq_key_1: some_seq_value_1
  - some_seq_key_2: some_seq_value_2
some_mapping: !Mapping-example
  some_mapping_key_1: some_mapping_value_1
  some_mapping_key_2: some_mapping_value_2
```

##### Associating a schema to a glob pattern via yaml.schemas:

yaml.schemas applies a schema to a file. In other words, the schema (placed on the left) is applied to the glob pattern on the right. Your schema can be local or online. Your schema path must be relative to the project root and not an absolute path to the schema.

For example:
If you have project structure

myProject

&nbsp;&nbsp;&nbsp;> myYamlFile.yaml

you can do

```
yaml.schemas: {
    "https://json.schemastore.org/composer": "/myYamlFile.yaml"
}
```

and that will associate the composer schema with myYamlFile.yaml.

## More examples of schema association:

### Using yaml.schemas settings

#### Single root schema association:

When associating a schema it should follow the format below

```json
yaml.schemas: {
    "url": "globPattern",
    "Kubernetes": "globPattern"
}
```

e.g.

```json
yaml.schemas: {
    "https://json.schemastore.org/composer": "/*"
}
```

e.g.

```json
yaml.schemas: {
    "kubernetes": "/myYamlFile.yaml"
}
```

e.g.

```json
yaml.schemas: {
    "https://json.schemastore.org/composer": "/*",
    "kubernetes": "/myYamlFile.yaml"
}
```

On Windows with full path:

```json
yaml.schemas: {
    "C:\\Users\\user\\Documents\\custom_schema.json": "someFilePattern.yaml",
}
```

On Mac/Linux with full path:

```json
yaml.schemas: {
    "/home/user/custom_schema.json": "someFilePattern.yaml",
}
```

Since `0.11.0` YAML Schemas can be used for validation:

```json
 "/home/user/custom_schema.yaml": "someFilePattern.yaml"
```

A schema can be associated with multiple globs using a json array, e.g.

```json
yaml.schemas: {
    "kubernetes": ["filePattern1.yaml", "filePattern2.yaml"]
}
```

e.g.

```json
"yaml.schemas": {
    "http://json.schemastore.org/composer": ["/*"],
    "file:///home/johnd/some-schema.json": ["some.yaml"],
    "../relative/path/schema.json": ["/config*.yaml"],
    "/Users/johnd/some-schema.json": ["some.yaml"],
}
```

e.g.

```json
"yaml.schemas": {
    "kubernetes": ["/myYamlFile.yaml"]
}
```

e.g.

```json
"yaml.schemas": {
    "http://json.schemastore.org/composer": ["/*"],
    "kubernetes": ["/myYamlFile.yaml"]
}
```

#### Multi root schema association:

You can also use relative paths when working with multi root workspaces.

Suppose you have a multi root workspace that is laid out like:

```
My_first_project:
   test.yaml
   my_schema.json
My_second_project:
   test2.yaml
   my_schema2.json
```

You must then associate schemas relative to the root of the multi root workspace project.

```
yaml.schemas: {
    "My_first_project/my_schema.json": "test.yaml",
    "My_second_project/my_schema2.json": "test2.yaml"
}
```

`yaml.schemas` allows you to specify json schemas that you want to validate against the yaml that you write. Kubernetes is an optional field. It does not require a url as the language server will provide that. You just need the keyword kubernetes and a glob pattern.

### Using inlined schema

It is possible to specify a yaml schema using a modeline.

```yaml
# yaml-language-server: $schema=<urlToTheSchema>
```

Also it is possible to use relative path in a modeline:

```yaml
# yaml-language-server: $schema=../relative/path/to/schema
```

or absolute path:

```yaml
# yaml-language-server: $schema=/absolute/path/to/schema
```

## Containerized Language Server
An image is provided for users who would like to use the YAML language server without having to install dependencies locally.

The image is located at `quay.io/redhat-developer/yaml-language-server`

To run the image you can use:
```
docker run -it quay.io/redhat-developer/yaml-language-server:latest
```

## Language Server Protocol version

`yaml-language-server` use `vscode-languageserver@7.0.0` which implements [LSP 3.16](https://github.com/Microsoft/language-server-protocol/blob/gh-pages/_specifications/specification-3-16.md)

## Clients

This repository only contains the server implementation. Here are some known clients consuming this server:

- [Eclipse Che](https://www.eclipse.org/che/)
- [vscode-yaml](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) for VSCode
- [ide-yaml](https://atom.io/packages/ide-yaml) for Atom editor
- [coc-yaml](https://github.com/neoclide/coc-yaml) for [coc.nvim](https://github.com/neoclide/coc.nvim)
- [Eclipse Wild Web Developer](https://marketplace.eclipse.org/content/eclipse-wild-web-developer-web-development-eclipse-ide) for Eclipse IDE
- [lsp-mode](https://github.com/emacs-lsp/lsp-mode) for Emacs
- [vim-lsp](https://github.com/prabirshrestha/vim-lsp) for Vim
- [LSP-yaml](https://packagecontrol.io/packages/LSP-yaml) for Sublime Text
- [monaco-yaml](https://monaco-yaml.js.org) for Monaco editor

## Developer Support

### Getting started

1. Install prerequisites:
   - latest [Visual Studio Code](https://code.visualstudio.com/)
   - [Node.js](https://nodejs.org/) v12.0.0 or higher
2. Fork and clone this repository
3. Install the dependencies
   ```bash
   cd yaml-language-server
   $ yarn install
   ```
4. Build the language server
   ```bash
   $ yarn run build
   ```
5. The new built server is now located in ./out/server/src/server.js.
   ```bash
   node (Yaml Language Server Location)/out/server/src/server.js [--stdio]
   ```

### Connecting to the language server via stdio

We have included the option to connect to the language server via [stdio](https://github.com/redhat-developer/yaml-language-server/blob/681985b5a059c2cb55c8171235b07e1651b6c546/src/server.ts#L46-L51) to help with intergrating the language server into different clients.

### ESM and UMD Modules

Building the YAML Language Server produces [CommonJS](http://www.commonjs.org/) modules in the `/out/server/src` directory. In addition, a build also produces [UMD](https://github.com/umdjs/umd) (Universal Module Definition) modules and [ES Modules](https://tc39.es/ecma262/#sec-modules) (ESM) in the `/lib` directory. That gives you choices in using the YAML Language Server with different module loaders on the server side and in the browser with bundlers like webpack.

### CI

We use a GitHub Action to publish each change in the `main` branch to [npm registry](https://www.npmjs.com/package/yaml-language-server) with the `next` tag.
You may use the `next` version to adopt the latest changes into your project.
