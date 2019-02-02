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
5. Document outlining:
    * Shows a complete document outline of all nodes in the document

## Language Server Settings

The following settings are supported:
* `yaml.format.enable`: Enable/disable default YAML formatter (requires restart)
* `yaml.format.singleQuote`: Use single quotes instead of double quotes
* `yaml.format.bracketSpacing`: Print spaces between brackets in objects
* `yaml.format.proseWrap`: Always: wrap prose if it exeeds the print width, Never: never wrap the prose, Preserve: wrap prose as-is
* `yaml.validate`: Enable/disable validation feature
* `yaml.hover`: Enable/disable hover
* `yaml.completion`: Enable/disable autocompletion
* `yaml.schemas`: Helps you associate schemas with files in a glob pattern
* `yaml.customTags`: Array of custom tags that the parser will validate against. It has two ways to be used. Either an item in the array is a custom tag such as "!Ref" and it will automatically map !Ref to scalar or you can specify the type of the object !Ref should be e.g. "!Ref sequence". The type of object can be either scalar (for strings and booleans), sequence (for arrays), map (for objects).

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
    "http://json.schemastore.org/composer": "/myYamlFile.yaml"
}
```

and that will associate the composer schema with myYamlFile.yaml.

## More examples of schema association:

When associating a schema it should follow the format below
```
yaml.schemas: {
    "url": "globPattern",
    "Kubernetes": "globPattern",
    "kedge": "globPattern"
}
```

e.g.
```
yaml.schemas: {
    "http://json.schemastore.org/composer": "/*"
}
```

e.g.

```
yaml.schemas: {
    "kubernetes": "/myYamlFile.yaml"
}
```
e.g.
```
yaml.schemas: {
    "kedge": "/myKedgeApp.yaml"
}
```

e.g.
```
yaml.schemas: {
    "http://json.schemastore.org/composer": "/*",
    "kubernetes": "/myYamlFile.yaml"
}
```

`yaml.schemas` extension allows you to specify json schemas that you want to validate against the yaml that you write. Kubernetes and kedge are optional fields. They do not require a url as the language server will provide that. You just need the keywords kubernetes/kedge and a glob pattern.

## Clients
This repository only contains the server implementation. Here are some known clients consuming this server:

* [Eclipse Che](https://www.eclipse.org/che/)
* [vscode-yaml](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) for VSCode
* [ide-yaml](https://atom.io/packages/ide-yaml) for Atom editor
* [coc-yaml](https://github.com/neoclide/coc-yaml) for [coc.nvim](https://github.com/neoclide/coc.nvim)

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
