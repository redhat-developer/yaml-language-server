/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const contents: { [name: string]: string } = {};

export const loadLibrary = (name: string, rootDir: string): string => {
  let content = contents[name];
  if (typeof content !== 'string') {
    try {
      if (name.startsWith('lib.') && name.endsWith('.d.ts')) {
        // ts lib
        const libPath = join(rootDir, './node_modules/typescript/lib', name);
        content = readFileSync(libPath).toString();
      } else if (existsSync(name)) {
        content = readFileSync(name).toString();
      } else {
        content = '';
      }
    } catch (e) {
      console.log(`Unable to load library ${name}`);
      content = '';
    }
  }

  contents[name] = content;

  return content;
};
