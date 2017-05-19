import { ASTVisitor } from '../utils/astServices';
import { YAMLNode, Kind, YAMLScalar, YAMLSequence, YAMLMapping, YamlMap, YAMLAnchorReference } from 'yaml-ast-parser';
import { JSONSchema } from "../jsonSchema";

export class YAMLSChemaValidator extends ASTVisitor {
  private schema: JSONSchema;

  constructor(schema: JSONSchema) {
    super();
    this.schema = schema;
  }

  public visit(node: YAMLNode): boolean {
    switch(node.kind){
      case Kind.SCALAR :
        this.validateScalar(<YAMLScalar>node);
        break;

    }
    return true;
  };

  public endVisit(node: YAMLNode): void {

  };

  private validateScalar(node:YAMLScalar){
    node.value;
  }

}
