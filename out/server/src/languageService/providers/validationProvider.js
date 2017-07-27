"use strict";
const validationService_1 = require("../services/validationService");
class validationProvider {
    constructor(schemaService) {
        this.schemaService = schemaService;
    }
    doValidation(document, doc) {
        let result = {
            items: [],
            isIncomplete: false
        };
        return this.schemaService.getSchemaForResource(document.uri).then(schema => {
            if (schema && schema.schema) {
                let validator = new validationService_1.schemaValidator(schema.schema, document);
                validator.traverseBackToLocation(doc);
                result.items = validator.getErrorResults();
            }
            return result;
        });
    }
}
exports.validationProvider = validationProvider;
//# sourceMappingURL=validationProvider.js.map