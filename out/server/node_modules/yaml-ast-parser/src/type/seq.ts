

'use strict';

import Type = require('../type');

export = new Type('tag:yaml.org,2002:seq', {
  kind: 'sequence',
  construct: function (data) { return null !== data ? data : []; }
});
