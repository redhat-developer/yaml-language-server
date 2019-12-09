/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Parser from '../parser/jsonParser04';

export function determineNodeContext(node: Parser.ASTNode): string | undefined {
    if ((node.type === 'string' && node.getValue() === 'holder') || (node.type === 'property' && node.location === null)) {
        return 'object';
    } else  if (node.type === 'null' && node.parent && node.parent.type === 'object') {
        return 'scalar';
    } else if (node.type === 'array' && node.parent && node.parent.location === null) {
        return 'array';
    }
    return undefined;
}
