![CI](https://github.com/redhat-developer/yaml-language-server/workflows/CI/badge.svg) [![version](https://img.shields.io/npm/v/yaml-language-server.svg)](https://www.npmjs.com/package/yaml-language-server) [![Coverage Status](https://coveralls.io/repos/github/redhat-developer/yaml-language-server/badge.svg?branch=main)](https://coveralls.io/github/redhat-developer/yaml-language-server?branch=main)

# YAML Language Server

Provides YAML language features over the [Language Server Protocol](https://github.com/Microsoft/language-server-protocol) (LSP), including validation, completion, hover, formatting, document symbols, and schema-based intelligence.

Starting from version `1.0.0`, the language server uses [eemeli/yaml](https://github.com/eemeli/yaml) as its YAML parser, which strictly enforces the specified YAML spec version. The default YAML spec version is `1.2`. Set `yaml.yamlVersion` to `1.1` for compatibility with older YAML files.

Schema validation supports JSON Schema `draft-04`, `draft-07`, `2019-09`, and `2020-12`.

## Features

1. **YAML validation**:
   - Detects whether the entire file is valid YAML
   - Reports diagnostics such as:
     - Node is not found
     - Node has an invalid key node type
     - Node has an invalid type
     - Node is not a valid child node
     - Node is an additional property of its parent
2. **Document symbols**:
   - Provides hierarchical document symbols for YAML nodes
3. **Completion**:
   - Completes YAML keys, values, and structure based on the associated schema
   - Completes scalar nodes with schema defaults when defaults are available
4. **Hover**:
   - Shows schema descriptions for YAML nodes when descriptions are available
   - Shows anchor information when `yaml.hoverAnchor` is enabled
   - Shows schema source information when `yaml.hoverSchemaSource` is enabled
5. **Formatting**:
   - Formats YAML documents
   - Supports on-type formatting on newline, including automatic indentation for mappings and array items

Completion and hover content are schema-driven. See [Associating schemas](#associating-schemas) for configuration details.

## Language server settings

The server supports the following settings supplied by LSP clients:

- `yaml.yamlVersion`: Set default YAML spec version (`1.2` or `1.1`). Defaults to `1.2`.
- `yaml.maxItemsComputed`: The maximum number of document symbols and folding regions computed (limited for performance reasons). Defaults to `5000`.
- `yaml.format.enable`: Enable/disable the default YAML formatter. Defaults to `true`.
- `yaml.format.singleQuote`: Use single quotes instead of double quotes. Defaults to `false`.
- `yaml.format.bracketSpacing`: Print spaces between brackets in objects. Defaults to `true`.
- `yaml.format.proseWrap`: Control prose wrapping behavior. `always`: wrap prose if it exceeds the print width, `never`: never wrap the prose, `preserve`: wrap prose as-is. Defaults to `preserve`.
- `yaml.format.printWidth`: Specify the line length that the printer will wrap on. Defaults to `80`.
- `yaml.format.trailingComma`: Specify if trailing commas should be used in JSON-like segments of the YAML. Defaults to `true`.
- `yaml.validate`: Enable/disable validation feature. Defaults to `true`.
- `yaml.hover`: Enable/disable hover. Defaults to `true`.
- `yaml.hoverAnchor`: Enable/disable hover feature for anchors. Defaults to `true`.
- `yaml.hoverSchemaSource`: Enable/disable showing the schema source in hover tooltips. Defaults to `true`.
- `yaml.completion`: Enable/disable autocompletion. Defaults to `true`.
- `yaml.disableDefaultProperties`: Disable adding not required properties with default values into completion text. Defaults to `false`.
- `yaml.suggest.parentSkeletonSelectedFirst`: If true, the user must select some parent skeleton first before autocompletion starts to suggest the rest of the properties. When the YAML object is not empty, autocompletion ignores this setting and returns all properties and skeletons. Defaults to `false`.
- `yaml.schemas`: Associate schemas with files using glob patterns. See [Associating schemas](#associating-schemas) for details.
- `yaml.disableSchemaDetection`: Disable schema detection for YAML files matching the configured glob pattern or list of glob patterns. Modelines still apply.
- `yaml.schemaStore.enable`: Use the [SchemaStore](https://www.schemastore.org/) catalog to automatically associate schemas with common YAML file patterns. Defaults to `true`.
- `yaml.schemaStore.url`: URL of a schema store catalog to use when downloading schemas. Defaults to `https://www.schemastore.org/api/json/catalog.json`.
- `yaml.customTags`: Array of custom tags that the parser will validate against. It has three ways to be used. A tag without a type, such as "!Ref", is treated as a scalar tag. A tag with a node type, such as "!Ref sequence", specifies the YAML node type that the tag is written on. A tag with a node type and return type, such as "!FindInMap sequence:string", also specifies the schema type that the tagged value evaluates to. Supported node types are scalar, sequence, and mapping. Supported return types are string, number, integer, boolean, null, array, and object. The return type aliases scalar, sequence, and mapping are accepted as string, array, and object. See [Adding custom tags](#adding-custom-tags) for usage details.
- `yaml.disableAdditionalProperties`: Globally set `additionalProperties` to `false` for all objects. When enabled, no extra properties are allowed in YAML objects beyond those defined in the schema. Defaults to `false`.
- `yaml.kubernetesCRDStore.enable`: Enable/disable validation of Kubernetes custom resources using schemas from well-known Custom Resource Definitions (CRDs). Defaults to `true`.
- `yaml.kubernetesCRDStore.url`: The base URL for fetching well-known Custom Resource Definition (CRD) schemas. Defaults to `https://raw.githubusercontent.com/datreeio/CRDs-catalog/main`.
- `yaml.kubernetesVersion`: Kubernetes version used to build the schema URL when `yaml.schemas` maps files to the `kubernetes` keyword. If omitted, the language server uses its predefined default Kubernetes version.
- `yaml.style.flowMapping`: Control flow style mappings. Forbids flow style mappings if set to `forbid`. Defaults to `allow`.
- `yaml.style.flowSequence`: Control flow style sequences. Forbids flow style sequences if set to `forbid`. Defaults to `allow`.
- `yaml.keyOrdering`: Enforces alphabetical ordering of keys in mappings when set to `true`. Defaults to `false`.
- `http.proxy`: The URL of the proxy server that will be used when attempting to download a schema. If it is not set or it is undefined, no proxy server will be used.
- `http.proxyStrictSSL`: If true, the proxy server certificate should be verified against the list of supplied CAs. Defaults to `false`.
- `[yaml].editor.tabSize`: Number of spaces to use for YAML indentation. When provided, this setting is used for generated completion text. Defaults to `2`.
- `editor.tabSize`: Fallback indentation size when no YAML-specific tab size is provided. Defaults to `2`.
- `[yaml].editor.formatOnType`: Client/editor setting that controls whether on-type formatting requests are sent for YAML files. When enabled by the client, `yaml-language-server` can format YAML as the user types, such as adjusting indentation after a newline.

## Associating schemas

The language server uses [JSON Schema](https://json-schema.org/) to understand the shape of YAML files. Schema definitions can be written in JSON (`.json`) or YAML (`.yaml` or `.yml`) format.

Schemas can be associated with YAML files using a modeline, an inline `$schema` property, or the `yaml.schemas` setting. Integrations can also provide schemas through the [registered custom schema provider](#custom-schema-provider) or the [`json/schemaAssociations` notification](#jsonschemaassociations-notification).

When multiple schema sources or schema-disabling settings apply to the same file, see [Schema resolution priority](#schema-resolution-priority).

### Using a modeline

Specify a schema for a YAML file by adding a modeline comment at the top of the file:

```yaml
# yaml-language-server: $schema=<schema-url-or-path>
```

The IntelliJ-compatible `$schema` comment format is also supported:

```yaml
# $schema: <schema-url-or-path>
```

Relative paths in modelines are resolved from the YAML file's location, not the workspace root.

### Using an inline `$schema` property

Specify a schema for a YAML file by adding a top-level `$schema` property:

```yaml
$schema: <schema-url-or-path>
```

Relative paths in inline `$schema` properties are resolved from the YAML file's location, not the workspace root.

### Using `yaml.schemas`

Configure schema-to-file mappings in your LSP client settings using the `yaml.schemas` option.

Each entry maps a schema to one or more file patterns:

- **Key**: Schema URI, local file path, or the `kubernetes` keyword
- **Value**: A glob pattern or array of glob patterns

#### Remote schemas

Use a schema URL as the key:

```json
{
  "yaml.schemas": {
    "https://getcomposer.org/schema.json": "composer.yaml",
    "https://example.com/api-schema.json": ["api/*.yml", "api/*.yaml"]
  }
}
```

#### Local schemas

Use an absolute path, file URI, or relative path as the key.

In a single-folder workspace, relative schema paths are resolved from the workspace root.

On macOS or Linux:

```json
{
  "yaml.schemas": {
    "/home/user/custom_schema.json": "someFilePattern.yaml",
    "/home/user/custom_schema.yaml": "anotherPattern.yaml",
    "../relative/path/schema.json": ["filePattern1.yaml", "filePattern2.yaml"]
  }
}
```

On Windows:

```json
{
  "yaml.schemas": {
    "C:\\Users\\user\\Documents\\custom_schema.json": "someFilePattern.yaml",
    "file:///C:/Users/user/Documents/custom_schema.yaml": "anotherPattern.yaml",
    "../relative/path/schema.json": ["filePattern1.yaml", "filePattern2.yaml"]
  }
}
```

**Multi-root workspaces**

In multi-root workspaces, prefix schema paths with the workspace folder name that contains the schema.

Suppose the workspace contains two folders, `project-a` and `project-b`:

```shell
project-a/
├── test.yaml
└── schema.json
project-b/
├── test.yaml
└── schema.json
```

Use the workspace folder name at the start of each schema path key:

```json
{
  "yaml.schemas": {
    "project-a/schema.json": "project-a/test.yaml",
    "project-b/schema.json": "project-b/test.yaml"
  }
}
```

#### Kubernetes schemas

Use the reserved `kubernetes` keyword to validate Kubernetes YAML files. The language server resolves the keyword to a versioned Kubernetes schema URL based on `yaml.kubernetesVersion`.

```json
{
  "yaml.schemas": {
    "kubernetes": "k8s/*.yaml"
  }
}
```

Specify `yaml.kubernetesVersion` to choose the Kubernetes schema version:

```json
{
  "yaml.kubernetesVersion": "1.36.1",
  "yaml.schemas": {
    "kubernetes": "k8s/*.yaml"
  }
}
```

If `yaml.kubernetesVersion` is not set, the language server uses the default Kubernetes version.

## Suppressing diagnostics

To hide diagnostics for a specific YAML line, add a suppression comment immediately before that line. To disable schema validation for an entire file, see [Disabling schema validation](#disabling-schema-validation).

### Suppress all diagnostics on a line

Add `# yaml-language-server-disable` immediately before the line that produces the diagnostic:

```yaml
# yaml-language-server-disable
version: 123
```

### Suppress matching diagnostics

Add one or more comma-separated diagnostic message substrings after `# yaml-language-server-disable`. Only diagnostics whose messages contain a matching substring are suppressed; the rest are still reported. Matching is case-insensitive.

Single substring:

```yaml
# yaml-language-server-disable Incorrect type
version: 123
```

Multiple substrings:

```yaml
# yaml-language-server-disable Incorrect type, not accepted
version: 123
```

The substrings are matched against the diagnostic message text reported by the language server.

## Disabling schema validation

Disabling schema validation stops schema-based diagnostics. The file is still parsed as YAML, so YAML syntax errors can still be reported.

### Using a modeline

Disable schema validation for the current file by setting `$schema` to `none` in a modeline:

```yaml
# yaml-language-server: $schema=none
```

The IntelliJ-compatible `$schema` comment format is also supported:

```yaml
# $schema: none
```

### Using `yaml.disableSchemaDetection`

Prevent detected schemas from being applied to specific YAML files by configuring `yaml.disableSchemaDetection` with one or more glob patterns.

For one file pattern:

```json
{
  "yaml.disableSchemaDetection": "**/.github/workflows/*.yaml"
}
```

For multiple file patterns:

```json
{
  "yaml.disableSchemaDetection": [
    "some.yaml",
    "**/.github/workflows/*.yaml"
  ]
}
```

## Schema resolution priority

When multiple schema sources or schema-disabling mechanisms apply to the same YAML file, the language server uses the following priority order, from highest to lowest:

1. Modeline
2. Inline `$schema` property
3. Registered custom schema provider
4. `yaml.disableSchemaDetection`
5. `yaml.schemas`
6. `json/schemaAssociations` notification
7. SchemaStore

## Adding custom tags

YAML custom tags extend the language with application-specific syntax. Configure custom tags with the `yaml.customTags` setting.

Each entry supports one of these formats:

- `!Tag`: Treats the tag as a scalar tag
- `!Tag nodeType`: Specifies the YAML node type for the tagged value
- `!Tag nodeType:returnType`: Specifies the YAML node type and the schema type used during validation

Supported node types are `scalar`, `sequence`, and `mapping`.

Supported return types are `string`, `number`, `integer`, `boolean`, `null`, `array`, and `object`. The aliases `scalar`, `sequence`, and `mapping` are also accepted as `string`, `array`, and `object`.

For example:

```json
{
  "yaml.customTags": [
    "!Scalar-example",
    "!Seq-example sequence",
    "!Mapping-example mapping",
    "!Seq-as-string-example sequence:string"
  ]
}
```

These tags can then be used in YAML files:

```yaml
some_key: !Scalar-example some_value
some_sequence: !Seq-example
  - some_seq_key_1: some_seq_value_1
  - some_seq_key_2: some_seq_value_2
some_mapping: !Mapping-example
  some_mapping_key_1: some_mapping_value_1
  some_mapping_key_2: some_mapping_value_2
some_string: !Seq-as-string-example
  - value_1
  - value_2
```

In the last example, `!Seq-as-string-example` is written on a YAML sequence, but schema validation treats the tagged value as a string because its return type is `string`.

## Using the language server

The language server can be used through an existing LSP client or launched directly for integration with an editor, IDE, CLI, or another development tool.

### Existing clients

This repository only contains the server implementation. Here are some known clients consuming this server:

- [Eclipse Che](https://www.eclipse.org/che/)
- [vscode-yaml](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) for VS Code
- [coc-yaml](https://github.com/neoclide/coc-yaml) for [coc.nvim](https://github.com/neoclide/coc.nvim)
- [Eclipse Wild Web Developer](https://marketplace.eclipse.org/content/eclipse-wild-web-developer-web-development-eclipse-ide) for Eclipse IDE
- [lsp-mode](https://github.com/emacs-lsp/lsp-mode) for Emacs
- [vim-lsp](https://github.com/prabirshrestha/vim-lsp) for Vim
- [LSP-yaml](https://packagecontrol.io/packages/LSP-yaml) for Sublime Text
- [monaco-yaml](https://monaco-yaml.js.org) for Monaco editor
- [Vim-EasyComplete](https://github.com/jayli/vim-easycomplete) for Vim/NeoVim
- [nova-yaml](https://github.com/robb-j/nova-yaml/) for Nova
- [volar-service-yaml](https://github.com/volarjs/services/tree/master/packages/yaml) for Volar
- [Kate](https://kate-editor.org/)
- [yaml-schema-lint](https://github.com/X-Guardian/yaml-schema-lint), a CLI for schema linting YAML files

### Building a custom integration

To build a custom integration, run the server using one of the following options.

#### Using the npm package

Install yaml-language-server globally:

```sh
npm install -g yaml-language-server
```

Start the server with the communication channel required by your client:

```sh
yaml-language-server --stdio
yaml-language-server --socket=<port>
yaml-language-server --node-ipc
```

#### Using a local build

Clone this repository:

```sh
git clone https://github.com/redhat-developer/yaml-language-server.git
cd yaml-language-server
```

Install dependencies and build the server:

```bash
npm install
npm run build
```

The built server is located at `./out/server/src/server.js`.

Run the built server with the communication channel required by your client:

```sh
node ./out/server/src/server.js --stdio
node ./out/server/src/server.js --socket=<port>
node ./out/server/src/server.js --node-ipc
```

#### Using the container image

The container image is published at `quay.io/redhat-developer/yaml-language-server`.

To run the server over stdio:

```sh
docker run -i --rm quay.io/redhat-developer/yaml-language-server:latest
```

To run the server on a socket:

```sh
docker run --rm -p <port>:<port> quay.io/redhat-developer/yaml-language-server:latest --socket=<port>
```

## LSP extensions

The server uses `vscode-languageserver@^9.0.0` and implements [LSP 3.17](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/).

The following non-standard LSP extensions support schema association, custom schema providers, and schema selection.

### Schema association

#### `json/schemaAssociations` notification

Sent from the client to the server to associate schemas with YAML file patterns. This is useful when a client or editor extension owns a YAML file type and needs the server to apply a schema automatically.

Each notification replaces the schema associations previously provided through this method.

_Notification:_

- method: `json/schemaAssociations`
- params: `ISchemaAssociations | SchemaConfiguration[]`

```typescript
/**
 * Maps schema URIs to file patterns.
 */
type ISchemaAssociations = Record<string, string[]>;

interface SchemaConfiguration {
  /**
   * URI that identifies the schema.
   */
  uri: string;
  /**
   * File patterns associated with the schema.
   */
  fileMatch?: string[];
  /**
   * Optional inline schema content. When omitted, the server attempts to
   * load the schema identified by `uri`.
   */
  schema?: JSONSchema;
}
```

### Custom schema provider

These extensions let a client dynamically select schemas for a YAML document and provide content for schema URI schemes that the server cannot load directly.

#### `yaml/registerCustomSchemaRequest` notification

Sent from the client to the server to register the client as a custom schema provider. After registration, the server sends a `custom/schema/request` request when it needs schemas for a YAML document.

_Notification:_

- method: `yaml/registerCustomSchemaRequest`
- params: `void`

#### `custom/schema/request` request

Sent from the server to the registered custom schema provider to retrieve the schema URIs for a YAML document.

_Request:_

- method: `custom/schema/request`
- params: URI of the YAML document as a `string`

_Response:_

- result: Schema URI as a `string`, schema URIs as a `string[]`, or no result when the provider has no schema for the document

When the provider returns no schema URI or the request fails, the server continues with lower-priority schema sources.

#### `custom/schema/content` request

Sent from the server to the client when it needs to load a schema URI whose scheme it cannot handle directly.

_Request:_

- method: `custom/schema/content`
- params: Schema URI as a `string`

_Response:_

- result: Schema content as a `string`

### Schema selection

These extensions allow clients to discover schemas known to the server and determine which schemas apply to an open YAML document.

#### `yaml/supportSchemaSelection` notification

Sent from the client to the server to opt in to the schema-selection workflow.

_Notification:_

- method: `yaml/supportSchemaSelection`
- params: `void`

#### `yaml/schema/store/initialized` notification

Sent from the server to the client after Schema Store initialization finishes. The server sends this notification only after the client has sent `yaml/supportSchemaSelection`.

After receiving the notification, the client can request schema information from the server.

_Notification:_

- method: `yaml/schema/store/initialized`
- params: `{}`

#### `yaml/get/all/jsonSchemas` request

Sent from the client to the server to retrieve all known schemas. The server uses the supplied document URI to indicate which schemas apply to that document.

_Request:_

- method: `yaml/get/all/jsonSchemas`
- params: URI of an open YAML document as a `string`

_Response:_

- result: `JSONSchemaDescriptionExt[]`

#### `yaml/get/jsonSchema` request

Sent from the client to the server to retrieve the schemas that apply to an open YAML document. Clients can use this request to display the document's active schemas.

_Request:_

- method: `yaml/get/jsonSchema`
- params: URI of an open YAML document as a `string`

_Response:_

- result: `JSONSchemaDescription[]`

The schema-selection requests use the following response types:

```typescript
type SchemaVersions = { [version: string]: string };

interface JSONSchemaDescription {
  /**
   * Schema URI.
   */
  uri: string;
  /**
   * Schema name, when available.
   */
  name?: string;
  /**
   * Schema description, when available.
   */
  description?: string;
  /**
   * Available schema versions, when provided by the schema source.
   */
  versions?: SchemaVersions;
}

interface JSONSchemaDescriptionExt extends JSONSchemaDescription {
  /**
   * Whether the schema applies to the requested document.
   */
  usedForCurrentFile: boolean;
  /**
   * Whether the schema comes from Schema Store.
   */
  fromStore: boolean;
}
```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18.18.0 or higher
- npm

### Setup

Fork and clone this repository, then install dependencies:

```sh
cd yaml-language-server
npm install
```

### Build

Build the language server:

```sh
npm run build
```

The main server output is generated in `out/server/src`.

Use `npm test` to run tests.

### Module builds

Building YAML Language Server produces [CommonJS](http://www.commonjs.org/) output in the `out/server/src` directory. In addition, a build also produces [UMD](https://github.com/umdjs/umd) (Universal Module Definition) modules and [ES Modules](https://tc39.es/ecma262/#sec-modules) (ESM) in the `lib` directory. These module formats support different server-side module loaders and browser bundlers such as webpack.

### CI

GitHub Actions publish each change in the `main` branch to the [npm registry](https://www.npmjs.com/package/yaml-language-server) with the `next` tag.
Use the `next` version to adopt the latest changes into a project.
