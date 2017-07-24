"use strict";
const autoCompletionProvider_1 = require("./providers/autoCompletionProvider");
const jsonSchemaService_1 = require("./services/jsonSchemaService");
const validationProvider_1 = require("./providers/validationProvider");
const hoverProvider_1 = require("./providers/hoverProvider");
function getLanguageService(schemaRequestService, workspaceContext, k8sSchemaOn, kedgeSchemaOn) {
    let schemaService = new jsonSchemaService_1.JSONSchemaService(schemaRequestService, workspaceContext);
    if (k8sSchemaOn) {
        schemaService.registerExternalSchema('http://central.maven.org/maven2/io/fabric8/kubernetes-model/1.1.0/kubernetes-model-1.1.0-schema.json', ['*.yml', '*.yaml']);
    }
    else if (kedgeSchemaOn) {
        schemaService.registerExternalSchema('https://raw.githubusercontent.com/surajssd/kedgeSchema/master/configs/appspec.json', ['*.yml', '*.yaml']);
    }
    else {
        schemaService.registerExternalSchema('http://central.maven.org/maven2/io/fabric8/kubernetes-model/1.1.0/kubernetes-model-1.1.0-schema.json', ['*.yml', '*.yaml']);
    }
    let completer = new autoCompletionProvider_1.autoCompletionProvider(schemaService);
    let validator = new validationProvider_1.validationProvider(schemaService);
    let hover = new hoverProvider_1.hoverProvider(schemaService);
    return {
        doComplete: completer.doComplete.bind(completer),
        doValidation: validator.doValidation.bind(validator),
        doHover: hover.doHover.bind(hover)
    };
}
exports.getLanguageService = getLanguageService;
//# sourceMappingURL=yamlLanguageService.js.map