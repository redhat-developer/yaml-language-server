export * from './languageservice/yamlLanguageService.js';
import { getLanguageService } from 'vscode-json-languageservice';
const getJSONLanguageService = getLanguageService;
export { getJSONLanguageService };
export * from 'vscode-languageserver-types';
