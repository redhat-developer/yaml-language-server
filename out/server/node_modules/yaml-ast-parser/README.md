# yaml-ast-parser

[![Build Status](https://travis-ci.org/mulesoft-labs/yaml-ast-parser.svg?branch=master)](https://travis-ci.org/mulesoft-labs/yaml-ast-parser)

This is a fork of JS-YAML which supports parsing of YAML into AST.

In additional to parsing YAML to AST, it has following features:

* restoration after the errors and reporting errors as a part of AST nodes.
* built-in support for `!include` tag used in RAML


`load` method can be used to load the tree and returns `YAMLNode` root.

`YAMLNode` class is an ancestor for all node kinds.
It's `kind` field determine node kind, one of `Kind` enum: `SCALAR`, `MAPPING`, `MAP`, `SEQ`, `ANCHOR_REF` or `INCLUDE_REF`. After node kind is determined, it can be casted to one of the `YAMLNode` descendants: `YAMLScalar`, `YAMLMapping`, `YamlMap`, `YAMLSequence` or `YAMLAnchorReference`.

`startPosition` and `endPosition` of `YAMLNode` class provide node range.

`YAMLScalar` has string `value` field.

`YAMLMapping` has `YAMLScalar` `key` and `YAMLNode` `value` fields.

`YAMLSequence` has `YAMLNode[]` `items` field.

`YamlMap` has `YAMLMapping[]` `mappings` field.

`YAMLAnchorReference` has string `referencesAnchor` and `YAMLNode` `value`.



