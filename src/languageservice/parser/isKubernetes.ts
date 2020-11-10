import * as Parser from './jsonParser07';

export function setKubernetesParserOption(jsonDocuments: Parser.JSONDocument[], option: boolean): void {
  for (const jsonDoc of jsonDocuments) {
    jsonDoc.isKubernetes = option;
  }
}
