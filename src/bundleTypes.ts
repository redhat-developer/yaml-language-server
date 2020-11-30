export interface YAMLLanguageServerBundle {
  name: string;
  version: string;
  commandFunctions: Map<string, Function>;
}
