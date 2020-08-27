#### 0.10.1

- Fix for cannot read property 'lineComments' of undefined Code: -32603 [redhat-developer/vscode-yaml#312](https://github.com/redhat-developer/vscode-yaml/issues/358)

#### 0.10.0

- Allows to declare a schema inside the yaml file through modeline `# yaml-language-server: $schema=<urlOfTheSchema>` [#280](https://github.com/redhat-developer/yaml-language-server/pull/280)
- Insert empty string instead of 'null' for string array completion [#277](https://github.com/redhat-developer/yaml-language-server/pull/277)
- Handle workspace/workspaceFolders event for multi root workspaces [#281](https://github.com/redhat-developer/yaml-language-server/pull/281)
- Provide default object as completion snippet [#291] https://github.com/redhat-developer/yaml-language-server/pull/291
- Add validation of date and time formats [#292](https://github.com/redhat-developer/yaml-language-server/pull/292)
- Fix document symbols computation if yaml has complex mappings [#293](https://github.com/redhat-developer/yaml-language-server/pull/293)

#### 0.9.0

- Improve Diagnostic positions [#260](https://github.com/redhat-developer/yaml-language-server/issues/260)
- Support `maxProperties` when providing completion [#269](https://github.com/redhat-developer/yaml-language-server/issues/269)
- Fix for required attributes are inserted with wrong level of indentation on first array item [redhat-developer/vscode-yaml#312](https://github.com/redhat-developer/vscode-yaml/issues/312)
- Use https endpoints for schemastore [#PR](https://github.com/redhat-developer/yaml-language-server/pull/264)

#### 0.8.0

- Start using yarn for everything instead of npm
- Allow for partial configurations in onDidChangeConfiguration [#256](https://github.com/redhat-developer/yaml-language-server/issues/256)
- Support for textDocument/findDefinition [#PR](https://github.com/redhat-developer/yaml-language-server/pull/257)
- Fix kubernetes schema back to 1.17.0 [#PR](https://github.com/redhat-developer/yaml-language-server/pull/236)
- Fix for @ symbol in relative path [#PR](https://github.com/redhat-developer/yaml-language-server/pull/254)
- Fix for null literals [#118](https://github.com/redhat-developer/yaml-language-server/issues/118)
- Fix for autocompletion on default values [#281](https://github.com/redhat-developer/vscode-yaml/issues/281)

#### 0.7.2

- Fix the way default snippets is handled when we have boolean values [#PR](https://github.com/redhat-developer/yaml-language-server/pull/234)

#### 0.7.1

- Allow contributor API to contribute multiple schemas for the same file [#PR](https://github.com/redhat-developer/yaml-language-server/pull/227)
- Fix issue with arrays in default snippets [#PR](https://github.com/redhat-developer/yaml-language-server/pull/226)

#### 0.7.0

- Updates kubernetes schema to 1.17.0 [#Commit](https://github.com/redhat-developer/yaml-language-server/commit/68d0f395ccc12abf9f180fa39ce49b77d52863ad)
- Added API for modifiying schemas in memory [#151](https://github.com/redhat-developer/yaml-language-server/issues/151)
- Updated yaml completion to use JSON 7 Parser [#150](https://github.com/redhat-developer/yaml-language-server/issues/150)
- Server side snippet support [#205](https://github.com/redhat-developer/yaml-language-server/issues/205)
- Fix issue with language server not issuing warnings on duplicate keys [#Commit](https://github.com/redhat-developer/yaml-language-server/commit/20a8b07cd8f054d1374cbab17ef479320ac5669c)
- Fix for collecting completion items if array contains objects [#PR](https://github.com/redhat-developer/yaml-language-server/pull/224)
- Fix for merge key error with JSON Schema [#PR](https://github.com/redhat-developer/yaml-language-server/pull/222)

#### 0.6.1

- Fix for setting kubernetes in yaml.schemas gives error [#202](https://github.com/redhat-developer/yaml-language-server/issues/202)

#### 0.6.0

- Fix for schema sequence custom property [#PR](https://github.com/redhat-developer/yaml-language-server/pull/197)
- Fix for obeying the initialization specification [#PR](https://github.com/redhat-developer/yaml-language-server/pull/193)

#### 0.5.8

- Remove document range formatter registration [#PR](https://github.com/redhat-developer/yaml-language-server/pull/179)
- Catch errors that happen when schema store schemas cannot be grabbed [#PR](https://github.com/redhat-developer/yaml-language-server/pull/183)

#### 0.5.7

- Fix for custom schema contributor API [#PR](https://github.com/redhat-developer/yaml-language-server/pull/177)
- Disable range formatter in initialize [#PR](https://github.com/redhat-developer/yaml-language-server/pull/178)

#### 0.5.6

- Include the package-lock.json

#### 0.5.5

- Fix for language server initialize erroring when rootURI is not set

#### 0.5.4

- Fix for autocompletion not working when there are multiple enums available
- Fix for showing the correct validation when a key has an associated null value for kubernetes
- Add Eclipse Wild Web Developer as client
- Fix for Array item properties being created with the wrong indent
- Update of various dependencies

#### 0.5.3

- Make prettier an optional dependency because of issues with webpack

#### 0.5.2

- Adds in custom kubernetes schema comparator

#### 0.5.1

- Adds in missing js-yaml dependency

#### 0.5.0

- Fixed offset of undefined when hovering [#162](https://github.com/redhat-developer/yaml-language-server/issues/162)
- Fixed relative path schema loading [#154](https://github.com/redhat-developer/yaml-language-server/issues/154)
- Realigned features of YAML Language Server with JSON Language Server [#142](https://github.com/redhat-developer/yaml-language-server/issues/142)

#### 0.4.1

- Updated the kubernetes schema to be an upstream one [#PR](https://github.com/redhat-developer/yaml-language-server/pull/108)

#### 0.4.0

- Allow custom tags to have multiple types [#77](https://github.com/redhat-developer/yaml-language-server/issues/77)
- Made the formatter respect the yaml.format.enable setting [#PR](https://github.com/redhat-developer/yaml-language-server/pull/126)
- yaml-language-server command is now executable [#PR](https://github.com/redhat-developer/yaml-language-server/pull/130)

#### 0.3.2

- Only set CompletionItem.textEdit if it encompasses a single line [#139](https://github.com/redhat-developer/vscode-yaml/issues/139)

#### 0.3.1

- Fixed custom tags crashing the language server [#112](https://github.com/redhat-developer/yaml-language-server/commit/4bcd36d629ef2c64641dc6edc948dbd02f35c437)
- Added setting yaml.schemaStore.enable to enable/disable the schema store [#115](https://github.com/redhat-developer/yaml-language-server/commit/4aa28a7dacadcc68126bd26e3b5311e046348799)
- Use the language server tab size when formatting [#116](https://github.com/redhat-developer/yaml-language-server/commit/1458e25926c7189cefc383141f4fad1d14a568b8)

#### 0.2.1

- Added fix for language server crashing when settings.yaml.format was not sent [#111](https://github.com/redhat-developer/yaml-language-server/issues/111)

#### 0.2.0

- Added fix for bracket spacing option in formatter [#Commit](https://github.com/redhat-developer/yaml-language-server/commit/3b79ef397dbd215744c4577da9227298b3447bad)
- Added fix for boolean type [#Commit](https://github.com/redhat-developer/yaml-language-server/commit/9351ef54348e0a967a672e7c0f45b091ed53c533)

#### 0.1.0

- Added a new formatter that uses prettier [#Commit](https://github.com/redhat-developer/yaml-language-server/commit/a5092e3d33a2e208bfea7941076518dedd2aba7b)
- Added a registration for custom schema provider extension [#Commit](https://github.com/redhat-developer/yaml-language-server/commit/c82830b2e1933fae6197d09e85b1e637b46b3896)
- Add ability to toggle hover and autocompletion [#Commit](https://github.com/redhat-developer/yaml-language-server/commit/0e4192cfacbbb5d442f817a7337d388ac3d01eff)

#### 0.0.19

- Support intellisense default value [#86](https://github.com/redhat-developer/yaml-language-server/pull/86)
- Fix intellisense doesn't work for array item [#85](https://github.com/redhat-developer/yaml-language-server/pull/85)

#### 0.0.18

- Fix handling scenario of multiple documents in single yaml file [#81](https://github.com/redhat-developer/yaml-language-server/commit/38da50092285aa499930d0e95fbbd7960b37b670)
- Support associate schemas with files in a regular expression [#Commit](https://github.com/redhat-developer/yaml-language-server/commit/d4a05e3dd72f55c53f1b0325c521a58f688839c9)

#### 0.0.15

- Fixed dynamic registration of formatter [#74](https://github.com/redhat-developer/yaml-language-server/issues/74)

#### 0.0.14

- Bumped to fix jenkins errors

#### 0.0.13

- Show errors if schema cannot be grabbed [#73](https://github.com/redhat-developer/yaml-language-server/issues/73)
- The validator should support null values [#72](https://github.com/redhat-developer/yaml-language-server/issues/72)
- Server returning nothing on things such as completion errors Eclipse Che [#66](https://github.com/redhat-developer/yaml-language-server/issues/66)
- Return promises that resolve to null [#PR-71](https://github.com/redhat-developer/yaml-language-server/pull/71)
- Remove unused dependency to deep-equal [#PR-70](https://github.com/redhat-developer/yaml-language-server/pull/70)
- Added custom tags to autocompletion [#Commit](https://github.com/redhat-developer/yaml-language-server/commit/73c244a3efe09ec4250def78068c54af3acaed58)

#### 0.0.12

- Support for custom tags [#59](https://github.com/redhat-developer/yaml-language-server/issues/59)
- Incorrect duplicate key registered when using YAML anchors [#82](https://github.com/redhat-developer/vscode-yaml/issues/82)
- Automatically insert colon on autocomplete [#78](https://github.com/redhat-developer/vscode-yaml/issues/78)

#### 0.0.11

- Fix for completion helper if it contains \r [#37](https://github.com/redhat-developer/yaml-language-server/issues/37)

#### 0.0.10

- Programmatically associate YAML files with schemas by other extensions [#61](https://github.com/redhat-developer/vscode-yaml/issues/61)
- Autocompletion not triggered while typing [#46](https://github.com/redhat-developer/vscode-yaml/issues/46)

#### 0.0.9

- Remove console.log from jsonSchemaService [#49](https://github.com/redhat-developer/yaml-language-server/issues/49)
- Change "Property {\$property_name} is not allowed" error message [#42](https://github.com/redhat-developer/yaml-language-server/issues/42)
- New Kubernetes Schema + Updated support for Kubernetes [#40](https://github.com/redhat-developer/yaml-language-server/issues/40)

#### 0.0.8

- Added Kedge back in as one of the default schemas
- Added file watch for json schema files in the workspace [#34](https://github.com/redhat-developer/yaml-language-server/issues/34)
- Multi root settings [#50](https://github.com/redhat-developer/vscode-yaml/issues/50)
- Fix for crashing yaml language server when !include is present [#52](https://github.com/redhat-developer/vscode-yaml/issues/52)
- Update tests to work on windows [#30](https://github.com/redhat-developer/yaml-language-server/issues/30)

#### 0.0.7

- Added validation toggle in settings [#20](https://github.com/redhat-developer/yaml-language-server/issues/20)
- YAML Schemas are pulled from JSON Schema Store [#15](https://github.com/redhat-developer/yaml-language-server/issues/15)
- YAML Diagnostics throw on a single line instead of the entire file [#19](https://github.com/redhat-developer/yaml-language-server/issues/19)
- Fix for getNodeFromOffset [#18](https://github.com/redhat-developer/yaml-language-server/issues/18)

#### 0.0.6

- Hotfix for making multiple schemas in the settings work again

#### 0.0.5

- Fixed Schema validation reports errors in valid YAML document [#42](https://github.com/redhat-developer/vscode-yaml/issues/42)
- Fixed Support for multiple YAML documents in single file [#43](https://github.com/redhat-developer/vscode-yaml/issues/43)

#### 0.0.4

- Fixed support for kubernetes files
- Fixed boolean notation for validation [#40](https://github.com/redhat-developer/vscode-yaml/issues/40)
- Fixed autocompletion for first new list item [#39](https://github.com/redhat-developer/vscode-yaml/issues/39)

#### 0.0.3

- Added new autocompletion service which is better for json schemas
- Added yamlValidation contribution point [#37](https://github.com/redhat-developer/vscode-yaml/issues/37)

#### 0.0.1

- Initial release with support for hover, document outlining, validation and auto completion
