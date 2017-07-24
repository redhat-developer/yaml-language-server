
0.4.0 / 2017-02-23
==================
  * fix for `getLocation`. Now `getLocation` inside an object will always return a property from inside that property. Can be empty string if the object has no properties or if the offset is before a actual property  `{ "a": { | }} will return location ['a', ' ']`

0.3.0 / 2017-01-17
==================
  * Updating to typescript 2.0