/**
 * Module dependencies.
 */

var Autocomplete = require('../index');

var VEGETABLES = ['arugula', 'beet', 'broccoli', 'cauliflower', 'corn', 'cabbage', 'carrot'];
var autocomplete = new Autocomplete()
var data = []
autocomplete.initialize(VEGETABLES)
// Later...  When it's time to search:
var matches = autocomplete.search('ca');
var stringMatches = matches.map(function (match) {
  return match.key
})

// this will print:
// ['cauliflower', 'cabbage', 'carrot']
console.log(stringMatches);
