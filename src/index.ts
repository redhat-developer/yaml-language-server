export * from './languageservice/yamlLanguageService.ts';
import { getLanguageService } from 'vscode-json-languageservice';
const getJSONLanguageService = getLanguageService;
export { getJSONLanguageService };
export * from 'vscode-languageserver-types';
