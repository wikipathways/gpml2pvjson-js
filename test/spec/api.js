/**
 * Test public APIs
 */

//var _ = require('lodash');
var expect = require('chai').expect;
var Gpml2Pvjson = require('../../index.js');
//var RxNode = require('../../index.js');
var sinon = require('sinon');
var sologger = require('../sologger.js');

//process.env.NODE_ENV = 'development';

// Run tests
describe('Public API', function() {

  it('should create instance', function() {
    var gpml2PvjsonInstance = new Gpml2Pvjson();
    expect(gpml2PvjsonInstance).to.be.instanceof(Gpml2Pvjson);
    expect(gpml2PvjsonInstance).to.respondTo('toPvjson');
  });

//  describe('thenable (Promise)', function() {
//    it('should work on success', function(done) {
//      Rx.Observable.range(1, 3)
//      .then(function(result) {
//        expect(result).to.eql([1, 2, 3]);
//        done();
//      }, done);
//    });
//
//    it('should work on error', function(done) {
//      var message = 'placeholder error';
//      Rx.Observable.range(1, 3)
//      .concat(Rx.Observable.throw(new Error(message)))
//      .then(function(result) {
//        done(new Error('expected onError to be called, not onNext'));
//      }, function(err) {
//        expect(err.message).to.eql(message);
//        done();
//      });
//    });
//  });

});
