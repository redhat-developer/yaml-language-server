var Autocomplete = require('../index');
var should = require('should');
var path = require('path');
var fs = require('fs');

describe('Basic', function () {
  var auto;

  var data = [
    'fruit',
    'banana',
    'orange',
    'kiwi',
    'app',
    'orange juice',
    'apple',
    'apple pie'
  ];

  before(function () {
    auto = new Autocomplete()
    auto.initialize(data);
  })

  it('should find multiple elements from a given prefix ' ,function (done) {
    var desiredNumElements = 3
    var results = auto.search('ap')
    results.length.should.eql(desiredNumElements)
    done()
  })

  it('should match key-value array elements ' ,function (done) {
    var data = {
      app: 'app',
      apples: 'yummy',
      apple: 'yummy',
      banana: {name: 'banana', id: 5}
    }
    var autocomplete = new Autocomplete()
    autocomplete.initialize(data)
    var desiredNumElements = 3;
    var results = autocomplete.search('ap')
    results.length.should.eql(desiredNumElements)
    var applesResults = results.filter(function (result) {
      return result.key === 'apples'
    })
    applesResults.length.should.eql(1)
    var applesResult = applesResults[0]
    applesResult.key.should.eql('apples')
    applesResult.value.should.eql('yummy')
    done()
  })

  it('should get an array of strings  from a given prefix ' ,function (done) {
    var data = [
      'app',
      'apple',
      'banana'
    ]
    var autocomplete = new Autocomplete()
    autocomplete.initialize(data)
    var desiredNumElements = 2
    var results = autocomplete.search('ap')
    results.length.should.eql(desiredNumElements)
    var stringMatches = results.map(function (result) {
      return result.key
    })
    stringMatches.should.eql(['app', 'apple'])
    done()
  })

  it('should find a single element from a given prefix ' ,function (done) {
    var desiredNumElements = 1
    var result = auto.search('bana')
    result.length.should.eql(desiredNumElements)
    done()
  })

  it('should find no elements from a given prefix ' ,function (done) {
    var desiredNumElements = 0
    var result = auto.search('cheese')
    result.length.should.eql(desiredNumElements)
    done()
  })

  it('should add an element and then find it with a matching prefix ' ,function (done) {
    var query = 'cheese'
    var desiredNumElementsPreAdd = 0
    var desiredNumElementsPostAdd = 1
    var resultPreAdd = auto.search(query)
    resultPreAdd.length.should.eql(desiredNumElementsPreAdd)
    auto.addElement('cheeseburger')
    var resultPostAdd = auto.search(query)
    resultPostAdd.length.should.eql(desiredNumElementsPostAdd)
    done()
  })

  it('should remove an element and then no longer find it with a matching prefix ' ,function (done) {
    var query = 'ap'
    var desiredNumElementsPreRemove = 3
    var desiredNumElementsPostRemove = 2
    var resultPreRemove = auto.search(query)
    resultPreRemove.length.should.eql(desiredNumElementsPreRemove)
    auto.removeElement('apple')
    var resultPostRemove = auto.search(query)
    resultPostRemove.length.should.eql(desiredNumElementsPostRemove)
    done()
  })

})

describe('Large', function () {
  var auto, words
  before(function () {
  	this.timeout(60000);
    var filePath = path.join(__dirname,'words.txt')
    var text = fs.readFileSync(filePath, 'utf8')
    words = text.split(/\n/);
    auto = new Autocomplete()
    auto.initialize(words)
  })

  it('should find multiple elements from a given prefix ' ,function () {
  	this.timeout(60000);
    var start = Date.now();
    var matches = auto.search('mon');
    var duration = Date.now() - start; 
    console.log('Took ' + duration + 'ms to find ' + matches.length + ' matches from a set of ' + words.length + ' words');
    matches.length.should.eql(663);
  })
})
