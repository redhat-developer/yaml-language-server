import {
  NullASTNodeImpl,
  PropertyASTNodeImpl,
  StringASTNodeImpl,
  ObjectASTNodeImpl,
  NumberASTNodeImpl,
  ArrayASTNodeImpl,
  BooleanASTNodeImpl,
} from './jsonParser07';
import * as Yaml from 'yaml-language-server-parser';
import { ASTNode } from '../jsonASTTypes';
import { parseYamlBoolean } from './scalar-type';

const maxRefCount = 1000;
let refDepth = 0;
export default function recursivelyBuildAst(parent: ASTNode, node: Yaml.YAMLNode): ASTNode {
  if (!node) {
    return;
  }
  if (!parent) {
    // first invocation
    refDepth = 0;
  }

  if (refDepth > maxRefCount && node.kind === Yaml.Kind.ANCHOR_REF) {
    // document contains excessive aliasing
    return;
  }

  switch (node.kind) {
    case Yaml.Kind.MAP: {
      const instance = <Yaml.YamlMap>node;

      const result = new ObjectASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);

      for (const mapping of instance.mappings) {
        result.properties.push(<PropertyASTNodeImpl>recursivelyBuildAst(result, mapping));
      }

      return result;
    }
    case Yaml.Kind.MAPPING: {
      const instance = <Yaml.YAMLMapping>node;
      const key = instance.key;

      const result = new PropertyASTNodeImpl(
        parent as ObjectASTNodeImpl,
        instance.startPosition,
        instance.endPosition - instance.startPosition
      );

      // Technically, this is an arbitrary node in YAML
      // I doubt we would get a better string representation by parsing it
      const keyNode = new StringASTNodeImpl(result, key.startPosition, key.endPosition - key.startPosition);
      keyNode.value = key.value;

      const valueNode = instance.value
        ? recursivelyBuildAst(result, instance.value)
        : new NullASTNodeImpl(parent, instance.endPosition, 0);
      valueNode.location = key.value;

      result.keyNode = keyNode;
      result.valueNode = valueNode;

      return result;
    }
    case Yaml.Kind.SEQ: {
      const instance = <Yaml.YAMLSequence>node;

      const result = new ArrayASTNodeImpl(parent, instance.startPosition, instance.endPosition - instance.startPosition);

      const count = 0;
      for (const item of instance.items) {
        if (item === null && count === instance.items.length - 1) {
          break;
        }

        // Be aware of https://github.com/nodeca/js-yaml/issues/321
        // Cannot simply work around it here because we need to know if we are in Flow or Block
        const itemNode = item === null ? new NullASTNodeImpl(parent, instance.endPosition, 0) : recursivelyBuildAst(result, item);

        // itemNode.location = count++;
        result.children.push(itemNode);
      }

      return result;
    }
    case Yaml.Kind.SCALAR: {
      const instance = <Yaml.YAMLScalar>node;
      const type = Yaml.determineScalarType(instance);

      const value = instance.value;

      //This is a patch for redirecting values with these strings to be boolean nodes because its not supported in the parser.
      const possibleBooleanValues = [
        'y',
        'Y',
        'yes',
        'Yes',
        'YES',
        'n',
        'N',
        'no',
        'No',
        'NO',
        'on',
        'On',
        'ON',
        'off',
        'Off',
        'OFF',
      ];
      if (instance.plainScalar && possibleBooleanValues.indexOf(value.toString()) !== -1) {
        return new BooleanASTNodeImpl(parent, parseYamlBoolean(value), node.startPosition, node.endPosition - node.startPosition);
      }

      switch (type) {
        case Yaml.ScalarType.null: {
          return new NullASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
        }
        case Yaml.ScalarType.bool: {
          return new BooleanASTNodeImpl(
            parent,
            Yaml.parseYamlBoolean(value),
            node.startPosition,
            node.endPosition - node.startPosition
          );
        }
        case Yaml.ScalarType.int: {
          const result = new NumberASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
          result.value = Yaml.parseYamlInteger(value);
          result.isInteger = true;
          return result;
        }
        case Yaml.ScalarType.float: {
          const result = new NumberASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
          result.value = Yaml.parseYamlFloat(value);
          result.isInteger = false;
          return result;
        }
        case Yaml.ScalarType.string: {
          const result = new StringASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
          result.value = node.value;
          return result;
        }
      }

      break;
    }
    case Yaml.Kind.ANCHOR_REF: {
      const instance = (<Yaml.YAMLAnchorReference>node).value;
      refDepth++;
      return (
        recursivelyBuildAst(parent, instance) ||
        new NullASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition)
      );
    }
    case Yaml.Kind.INCLUDE_REF: {
      const result = new StringASTNodeImpl(parent, node.startPosition, node.endPosition - node.startPosition);
      result.value = node.value;
      return result;
    }
  }
}
