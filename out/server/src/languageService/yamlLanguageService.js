"use strict";
const autoCompletionProvider_1 = require("./providers/autoCompletionProvider");
const jsonSchemaService_1 = require("./services/jsonSchemaService");
const validationProvider_1 = require("./providers/validationProvider");
const hoverProvider_1 = require("./providers/hoverProvider");
const configuration_1 = require("./services/configuration");
function getLanguageService(schemaRequestService, workspaceContext) {
    let schemaService = new jsonSchemaService_1.JSONSchemaService(schemaRequestService, workspaceContext);
    schemaService.setSchemaContributions(configuration_1.schemaContributions);
    let completer = new autoCompletionProvider_1.autoCompletionProvider(schemaService);
    let validator = new validationProvider_1.validationProvider(schemaService);
    let hover = new hoverProvider_1.hoverProvider(schemaService);
    return {
        configure: (settings) => {
            schemaService.clearExternalSchemas();
            if (settings.schemas) {
                settings.schemas.forEach(settings => {
                    schemaService.registerExternalSchema(settings.uri, settings.fileMatch, settings.schema);
                });
            }
        },
        doComplete: completer.doComplete.bind(completer),
        doValidation: validator.doValidation.bind(validator),
        doHover: hover.doHover.bind(hover)
    };
}
exports.getLanguageService = getLanguageService;
//# sourceMappingURL=yamlLanguageService.js.map