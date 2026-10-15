/* --------------------------------------------------------------------------------------------
 * Copyright (c) Red Hat, Inc. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

//check package.json do not have dependency with 'next' version

/* eslint-disable no-undef */

import packageConfig from '../package.json' with { type: 'json' };

const dependencies = packageConfig.dependencies;

for (const dep in dependencies) {
  if (Object.prototype.hasOwnProperty.call(dependencies, dep)) {
    const version = dependencies[dep];
    if (version === 'next') {
      console.error(`Dependency ${dep} has "${version}" version, please change it to fixed version`);
      process.exit(1);
    }
  }
}
