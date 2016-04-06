var _ = require('lodash')
  , fs = require('fs')
  , JSONStream = require('JSONStream')
  , request = require('request')
  , highland = require('highland')
  , path = require('path')
  , Gpml2Pvjson = require('../lib/index')
  , url = require('url')
  , pathwayMetadataList = require('./pathways-list.json')
  ;

var concurrentLimit = 4;

var outputStream = highland([
    highland(pathwayMetadataList)
    .batch(concurrentLimit)
    .sequence()
])
.parallel(concurrentLimit)
.pipe(highland.pipeline(
  function(s) {
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
      .pipe(JSONStream.parse('elements.*')))
      .filter(function(element) {
        var points = element.points;
        return !!points && _.filter(points, function(point) {
          var anchor = point.anchor;
          return !!anchor && anchor.length > 4;
        }).length > 0;
      })
      .reduce('', function(accumulator, edge) {
        return accumulator += '\n  ' + edge.id;
      })
      .filter(function(edges) {
        return edges.length > 0;
      })
      .map(function(edges) {
        var result = '\n' + pathway.id + edges;
        return result;
      });

      return matchesStream;
    });
  }
))
.merge();

outputStream.fork().pipe(fs.createWriteStream('../test/output/matches.txt', {flags: 'a'}));
outputStream.fork().pipe(process.stdout);

