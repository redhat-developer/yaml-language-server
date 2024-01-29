import * as ebuilderComponentSchema from './ebuilder.component.schema.json';
import * as ebuilderConfigsAppSchema from './ebuilder.configs.app.schema.json';
import * as ebuilderConfigsConstantSchema from './ebuilder.configs.constant.schema.json';
import * as ebuilderConfigsSecuritySchema from './ebuilder.configs.security.schema.json';
import * as ebuilderConfigsSqlSchema from './ebuilder.configs.sql.schema.json';
import * as ebuilderConfigsTaskSchema from './ebuilder.configs.task.schema.json';
import * as ebuilderConfigsUiSchema from './ebuilder.configs.ui.schema.json';
import * as ebuilderLocaleSchema from './ebuilder.locale.schema.json';

const schemas = {
  'ebuilder.component.schema.json': ebuilderComponentSchema,
  'ebuilder.configs.app.schema.json': ebuilderConfigsAppSchema,
  'ebuilder.configs.constant.schema.json': ebuilderConfigsConstantSchema,
  'ebuilder.configs.security.schema.json': ebuilderConfigsSecuritySchema,
  'ebuilder.configs.sql.schema.json': ebuilderConfigsSqlSchema,
  'ebuilder.configs.task.schema.json': ebuilderConfigsTaskSchema,
  'ebuilder.configs.ui.schema.json': ebuilderConfigsUiSchema,
  'ebuilder.locale.schema.json': ebuilderLocaleSchema,
};

export { schemas };
