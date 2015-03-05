var _ = require('lodash')
  , diff = require('deep-diff').diff
  , pd = require('pretty-data').pd
  , fs = require('fs')
  , JSONStream = require('JSONStream')
  , EventEmitter = require('events').EventEmitter
  , request = require('request')
  , highland = require('highland')
  , path = require('path')
  , Gpml2Pvjson = require('../lib/index')
  , url = require('url')
  , pathwayMetadataList = require('./pathways-list.json')
  ;

var pathwayMetadataStream = highland(pathwayMetadataList);
var truncatedPathwayMetadataStream = highland([pathwayMetadataStream.fork().take(40)]);

var pvjsonStreams = truncatedPathwayMetadataStream.parallel(4)
.pipe(highland.pipeline(function(s) {
  return s.map(function(pathway) {
    var pvjsonInput = 'http://test2.wikipathways.org/v2/pathways/' + pathway.id + '/.json';

    var matchesStream = highland(request({
      url: pvjsonInput
      , headers: {
        'Accept': 'application/json'
      }
    })
    //.pipe(JSONStream.parse('elements..points..anchor')))
    /*
    .pipe(JSONStream.parse(['elements', true, 'points', true, 'anchor'], function(anchor) {
      //console.log('anchor');
      //console.log(anchor);
      return anchor.length > 4;
    })))
    .pipe(JSONStream.parse(['elements', true, 'points', true, 'anchor'])))
    .filter(function(anchor) {
      return anchor.length > 4;
    })
    //*/
    .pipe(JSONStream.parse(['elements', true, 'points', true, 'anchor'])))
    .filter(function(anchor) {
      return anchor.length > 4;
    })
    .map(function(data) {
      console.log('data');
      console.log(data);
      console.log('Pathway ' + pathway.id + ' ' + pathway.idVersion + ' above matches the desired values.');
      s.destroy();
      return pathway.id + '\n';
    })
    .head();
    matchesStream.fork().pipe(fs.createWriteStream('../test/output/matches.txt', {flags: 'a'}));
    matchesStream.fork().pipe(process.stdout);
  });
}))
.each(function(value) {
});


