require('pretty-error').start(); // to make errors more readable
var _ = require('lodash');
var diff = require('deep-diff').diff;
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var gpml2pvjson = require('../index.js');
var highland = require('highland');
var JSONStream = require('JSONStream');
var path = require('path');
var pathwayMetadataList = require('./pathways-to-test.json');
var pd = require('pretty-data').pd;
var request = require('request');
var Rx = require('rx-extra');
var strcase = require('tower-strcase');
var url = require('url');
var VError = require('verror');

var filename = 'gpml2pvjson-js/test/node-test-streaming.js';

var pathwayRetryCounts = {};
var httpRetryLimit = 2;
var httpRetryDelay = 3000;

Rx.Observable.from(pathwayMetadataList)
  .first()
  .flatMap(function(pathway) {

    console.log('pathway');
    console.log(pathway);

    /*
    if (muteConsole) {
      //console.log('Disabling console logging...');
      delete global.console;
      global.console = {};
      global.console.log = global.console.warn = global.console.error = function() {};
    }
    //*/

    var identifier = pathway.identifier;
    var version = pathway.version || 0;

    /*
    var gpmlLocation = 'http://www.wikipathways.org/wpi/wpi.php' +
        '?action=downloadFile&type=gpml&pwTitle=Pathway:' +
        identifier + '&oldid=' + version;
    var gpmlChunkStream = highland(request(gpmlLocation));
    //*/
    //*
    //var gpmlLocation = path.join('input', 'WP1046_63315.gpml');
    var gpmlLocation = path.join(__dirname, 'input', 'WP106.gpml');
    var gpmlChunkStream = Rx.Observable.fromNodeReadableStream(fs.createReadStream(gpmlLocation, {
      encoding: 'utf8'
    }));
    //*/
    return gpml2pvjson.transformGpmlToPvjson(gpmlChunkStream)
      .do(null, function(err) {
        var err2 = new VError(err, 'error (after?) converting GPML to ' +
                              'pvjson in "%s"', filename);
        console.error(err2.stack);
      })
      /*
      .map(function(data) {
        if (muteConsole) {
          global.console = defaultConsole;
          //console.log('console logging re-enabled...');
        }
        return data;
      })
      //*/
      .map(function(pvjson) {
        var pathwayIri = !!identifier ?
            'http://identifiers.org/wikipathways/' +
            identifier : gpmlLocation;
        pvjson.id = pathwayIri;
        pvjson.version = version;

        pvjson['@context'].filter(function(contextElement) {
          return contextElement.hasOwnProperty('@base');
        })
        .map(function(baseElement) {
          baseElement['@base'] = pathwayIri + '/';
        });

        return pvjson;
      })
      .do(null, function(err) {
        var err2 = new VError(err, 'error (after?) converting GPML to ' +
                              'pvjson in "%s"', filename);
        console.error(err2.stack);
      });
  })
  .subscribe(function(result) {
    console.log('onNext result');
    console.log(result);
  }, function(err) {
    var err2 = new VError(err, 'Error in pathwayMetadataList Observable in "%s"', filename);
    throw err2;
  }, function() {
    console.log('Done');
  });
