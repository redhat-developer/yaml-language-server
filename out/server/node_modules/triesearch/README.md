# Node Autocomplete

Modernized Trie-search based on [Node Autocomplete](https://www.github.com/marccampbell/node-autocomplete) is an autocomplete library for [node.js](http://nodejs.org).

**TODO**: Cleanup test suite, use chai. Add all them missing semi-colons...

## Installation

```bash
npm install triesearch
```

## Features

  - in memory, in process, not redis dependent
  - internal [trie](http://en.wikipedia.org/wiki/Trie) data structure to store the strings
  - super fast for adding, removing and lookups
  - performance tested for string lists of 500,000 words
  - high level of tests


## Usage

```javascript
var data = ['fruit', 'app', 'apple', 'banana']
// instatiate a new autocomplete object
var Autocomplete = require('autocomplete')
var auto = new Autocomplete()
auto.initialize(data)
// results will be an array with 0 or more elements
var results = auto.search('ap')

// here results will be an array of key-value pairs
console.dir(results)
```

## Output
The output of the search is an array of objects with key and value properties. In the example above, `results` looks like
```javascript
[
  {
    key: 'app',
    value: 'app'
  },
  {
    key: 'apple',
    value: 'apple',
  }
]
```

If you are just searching for strings you can get an array of matching strings by mapping the results and returning just the key
```javascript
var data = ['fruit', 'app', 'apple', 'banana']
// instatiate a new autocomplete object
var Autocomplete = require('autocomplete')
var auto = new Autocomplete()
auto.initialize(data)
// results will be an array with 0 or more elements
var results = auto.search('ap')

// here results will be an array of key-value pairs
console.dir(results)
var stringMatches = results.map(function (result) {
  return result.key
})
// stringMatches is ['app', 'apple']
console.dir(stringMatches)
```


## Adding
You can add to the list of candidate elements after the autocomplete object has been initialized
```javascript
var Autocomplete = require('autocomplete')
var auto = new Autocomplete()
var data = []
auto.initialize(data)
auto.addElement('cheeseburger')
```

## Removing
You can remove from the list of candidate elements after the autocomplete object has been initialized
```javascript
var Autocomplete = require('autocomplete')
var auto = new Autocomplete()
var data = ['app', 'apple', 'apples']
auto.initialize(data)
auto.removeElement('apple')
```

## Object Elements
You can also add key value pairs as an array of 2 elements

```javascript
var Autocomplete = require('autocomplete')
var auto = new Autocomplete()
var data = ['app', 'apple', ['apples', 'yummy'], 'banana' ]
auto.initialize(data)
var results = app.search('ap')
// in the results, there will be an element with the key *apples* and the value *yummy*
console.dir(results)
```

In the example above, `results` looks like

```javascript
[
  { key: 'app', value: 'app' },
  { key: 'apple', value: 'apple' },
  { key: 'apples', value: 'yummy' }
]
```
## Running Tests

Install development dependencies:

```bash
npm install
```

Then:

```bash
npm test
```

Actively tested with node:

  - 0.8.22

## Authors

  * Noah Isaacson
  * Marc Campbell

Original source code based on [https://github.com/marccampbell/node-autocomplete](https://github.com/marccampbell/node-autocomplete)
## License

(The MIT License)

Copyright (c) 2011 Marc Campbell &lt;marc.e.campbell@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
