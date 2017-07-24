"use strict";
const vscode_languageserver_1 = require("vscode-languageserver");
const request_light_1 = require("request-light");
const yamlLanguageService_1 = require("../src/languageService/yamlLanguageService");
const Strings = require("../src/languageService/utils/strings");
const uri_1 = require("../src/languageService/utils/uri");
const URL = require("url");
const fs = require("fs");
const jsonSchemaService_1 = require("../src/languageService/services/jsonSchemaService");
var glob = require('glob');
var assert = require('assert');
var VSCodeContentRequest;
(function (VSCodeContentRequest) {
    VSCodeContentRequest.type = new vscode_languageserver_1.RequestType('vscode/content');
})(VSCodeContentRequest || (VSCodeContentRequest = {}));
const validationDelayMs = 250;
let pendingValidationRequests = {};
let validDocuments;
// Create a connection for the server.
let connection = null;
if (process.argv.indexOf('--stdio') == -1) {
    connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
}
else {
    connection = vscode_languageserver_1.createConnection();
}
// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
let workspaceRoot;
connection.onInitialize((params) => {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: vscode_languageserver_1.TextDocumentSyncKind.Full,
            // Tell the client that the server support code complete
            completionProvider: {
                resolveProvider: false
            }
        }
    };
});
let workspaceContext = {
    resolveRelativePath: (relativePath, resource) => {
        return URL.resolve(resource, relativePath);
    }
};
let schemaRequestService = (uri) => {
    if (Strings.startsWith(uri, 'file://')) {
        let fsPath = uri_1.default.parse(uri).fsPath;
        return new Promise((c, e) => {
            fs.readFile(fsPath, 'UTF-8', (err, result) => {
                err ? e('') : c(result.toString());
            });
        });
    }
    else if (Strings.startsWith(uri, 'vscode://')) {
        return connection.sendRequest(VSCodeContentRequest.type, uri).then(responseText => {
            return responseText;
        }, error => {
            return error.message;
        });
    }
    return request_light_1.xhr({ url: uri, followRedirects: 5 }).then(response => {
        return response.responseText;
    }, (error) => {
        return Promise.reject(error.responseText || request_light_1.getErrorStatusDescription(error.status) || error.toString());
    });
};
exports.languageService = yamlLanguageService_1.getLanguageService(schemaRequestService, workspaceContext);
exports.schemaService = new jsonSchemaService_1.JSONSchemaService(schemaRequestService, workspaceContext);
//TODO: maps schemas from settings.
exports.schemaService.registerExternalSchema('http://central.maven.org/maven2/io/fabric8/kubernetes-model/1.0.65/kubernetes-model-1.0.65-schema.json', ['*.yml', '*.yaml']);
//# sourceMappingURL=testHelper.js.map