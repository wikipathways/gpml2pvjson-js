/**
 * Test public APIs
 */

var expect = require('chai').expect;
var fs = require('fs');
var jsdom = require('mocha-jsdom');
var sinon = require('sinon');
var sologger = require('../sologger.js');

//process.env.NODE_ENV = 'development';

// Run tests
describe('Public API', function() {
  var $;
  var Gpml2Pvjson;
  var parsedGpml;

  //jsdom();

//  before(function(done) {
//    jsdom.env({
//      file: __dirname + '/../input-data/WP554_84372.gpml',
//      parsingMode: 'xml',
//      done: function(err, window) {
//        if (err) {
//          return done(err);
//        }
//        parsedGpml = window.document.querySelector('Pathway');
//        //console.log('parsedGpml');
//        //console.log(parsedGpml);
//        done();
//      }
//    });
//    Gpml2Pvjson = require('../../index.js') || window.Gpml2Pvjson;
//    //$ = require('jquery');
//  });

//  before(function() {
//    Gpml2Pvjson = require('../../index.js') || window.Gpml2Pvjson;
//    $ = require('jquery');
//    var inputGpml = fs.readFileSync(__dirname + '/../input-data/WP554_84372.gpml', 'utf8');
//    parsedGpml = $(inputGpml);
//  });

  before(function() {
    //Gpml2Pvjson = require('../../index.js') || window.Gpml2Pvjson;
    $ = require('jquery');
    var inputGpml = fs.readFileSync(__dirname + '/../input-data/WP554_84372.gpml', 'utf8');
    jsdom({
      file: __dirname + '/../input-data/WP554_84372.gpml',
      parsingMode: 'xml',
      src: [
        fs.readFileSync(__dirname + '/../../node_modules/jquery/src/jquery.js', 'utf-8'),
        fs.readFileSync(__dirname + '/../../index.js', 'utf-8')
      ]
    });
    Gpml2Pvjson = require('../../index.js');
    //Gpml2Pvjson = require('../../index.js') || window.Gpml2Pvjson;
    //parsedGpml = $(inputGpml);
  });

  it('should create instance', function() {
    var gpml2PvjsonInstance = new Gpml2Pvjson();
    expect(gpml2PvjsonInstance).to.be.instanceof(Gpml2Pvjson);
    expect(gpml2PvjsonInstance).to.respondTo('toPvjson');
  });

  it('should convert WP554 (streaming)', function(done) {
    var inputGpml = fs.readFileSync(__dirname + '/../input-data/WP554_84372.gpml', 'utf8');
    console.log(inputGpml);
    var gpml2PvjsonInstance = new Gpml2Pvjson();
    gpml2PvjsonInstance.toPvjsonSource(inputGpml, {
      '@id': 'http://identifiers.org/wikipathways/WP554',
      version: 0
    })
    .subscribe(function(pvjson) {
      console.log('pvjson');
      console.log(pvjson);
      done();
    }, done);
  });

//  it('should convert WP554', function(done) {
//    var gpml2PvjsonInstance = new Gpml2Pvjson();
//    gpml2PvjsonInstance.toPvjson(parsedGpml, {
//      '@id': 'http://identifiers.org/wikipathways/WP554',
//      version: 0
//    }, function(err, pvjson) {
//      if (err) {
//        throw err;
//      }
//      console.log('pvjson');
//      console.log(pvjson);
//      done();
//    });
//  });

  it('should convert WP554', function(done) {
    var gpml2PvjsonInstance = new Gpml2Pvjson();
    gpml2PvjsonInstance.toPvjson(parsedGpml, {
      '@id': 'http://identifiers.org/wikipathways/WP554',
      version: 0
    }, function(err, pvjson) {
      if (err) {
        throw err;
      }
      console.log('pvjson');
      console.log(pvjson);
      done();
    });
  });

});
