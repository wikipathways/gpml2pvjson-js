/**
 * Test public APIs
 */

var expect = require('chai').expect;
var fs = require('fs');
var sinon = require('sinon');
var sologger = require('../sologger.js');

var pd = require('pretty-data').pd;
var Cheerio = require('cheerio');

process.env.NODE_ENV = 'development';

// Run tests
describe('Public API', function() {
  var Gpml2Pvjson;

  before(function() {
    Gpml2Pvjson = require('../../index.js') || window.Gpml2Pvjson;
  });

  it('should create instance', function() {
    var gpml2PvjsonInstance = new Gpml2Pvjson();
    expect(gpml2PvjsonInstance).to.be.instanceof(Gpml2Pvjson);
    expect(gpml2PvjsonInstance).to.respondTo('toPvjson');
  });

  it('should convert WP554 (DOM-based)', function(done) {
    var test = this;
    var input = fs.readFileSync(__dirname + '/../inputs/WP1_73346.gpml', {encoding: 'utf8'});
    test.expectedPath = __dirname + '/../expecteds/WP1_73346.json';
    var expected = require(test.expectedPath);

    $ = Cheerio.load(input, {
      normalizeWhitespace: true,
      xmlMode: true,
      decodeEntities: true,
      lowerCaseTags: false
    });
    var gpmlPathwaySelection = $('Pathway');

    var pathwayMetadata = {};
    pathwayMetadata.dbName = 'wikipathways';
    pathwayMetadata.dbId = 'WP1046';
    pathwayMetadata.version = '63315';

    var gpml2PvjsonInstance = new Gpml2Pvjson();
    var pvjson = gpml2PvjsonInstance.toPvjson(
        gpmlPathwaySelection,
        pathwayMetadata,
        function(err, actual) {
          if (err) {
            return done(err);
          }
          var actualString = JSON.stringify(actual, null, '  ');
          var expectedString = JSON.stringify(expected, null, '  ');
          if (actualString !== expectedString) {
            var actualPretty = pd.json(actualString);
            console.log('actualPretty');
            console.log(actualPretty);
            /*
            fs.writeFileSync(
                test.expectedPath,
                actualString,
                {
                  encoding: 'utf8'
                }
            );
            //*/
          }
          expect(actualString).to.eql(expectedString);
          // TODO we can't use the test below, because actual
          // has several properties with functions as values.
          // Do we want to add the getSetEntityReference properties?
          //expect(actual).to.eql(expected);
          done();
        }
    );
  });

});
