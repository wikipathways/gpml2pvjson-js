var _ = require('lodash')
  , strcase = require('tower-strcase')
  , diff = require('deep-diff').diff
  , pd = require('pretty-data').pd
  , fs = require('fs')
  , JSONStream = require('JSONStream')
  , EventEmitter = require('events').EventEmitter
  , request = require('request-enhanced')
  , highland = require('highland')
  , path = require('path')
  , Gpml2013aPvjson10Converter = require('../lib/index')
  , url = require('url')
  , pathways = require('./pathways-to-test.json')
  , pathwaysCompleted = require('./pathways-completed.json') || []
  ;

//highland([{id: 'WP1218', idVersion: '68743'}])
//highland([ highland([{id: 'WP525', idVersion: '74871'}]) ])
//highland([ highland([{id: 'WP525', idVersion: '74871'}, {id: 'WP524', idVersion: '72112'}]) ]).sequence()
//highland([ highland(pathways) ]).sequence()
//highland([ pathways ]).sequence()

var pathwaysStream = highland(pathways)
.filter(function(pathway) {
  return pathwaysCompleted.indexOf('http://identifiers.org/wikipathways/' + pathway.id) === -1;
});

var newPvjsonPathwayStream = highland([pathwaysStream.fork()]);

/*
var input = 'http://www.wikipathways.org/wpi/wpi.php?action=downloadFile&type=gpml&pwTitle=Pathway:WP1218&oldid=0';
request.get({
  url: input
}, function(err, data) {
  console.log(data);
});
//*/

//*
var input = 'http://www.wikipathways.org/wpi/wpi.php?action=downloadFile&type=gpml&pwTitle=Pathway:WP1218&oldid=0';
highland(request.get({
  url: input
}))
.apply(function(data, body) {
  console.log('data');
  console.log(data);
  console.log('body');
  console.log(body);
})
.each(function(value) {
  console.log('value');
  console.log(value);
});
//*/

/*
var newPvjsonStream = newPvjsonPathwayStream.parallel(4)
.pipe(highland.pipeline(function(s) {
  return s.map(function(pathway) {
    var dbId = pathway.id;
    var idVersion = pathway.idVersion || 0;

    var input = 'http://www.wikipathways.org/wpi/wpi.php?action=downloadFile&type=gpml&pwTitle=Pathway:' + dbId + '&oldid=' + idVersion;
    return highland(request.get({
      url: input
    }))
    .pipe(highland.pipeline(
      Gpml2013aPvjson10Converter.streamGpmlToPvjson,
      function(s) {
        return s.map(function(data) {
          var pvjson = JSON.parse(data);

          var pathwayIri = !!dbId ? 'http://identifiers.org/wikipathways/' + dbId : input;
          pvjson.id = pathwayIri;
          pvjson.idVersion = idVersion;

          pvjson['@context'].filter(function(contextElement) {
            return contextElement.hasOwnProperty('@base');
          })
          .map(function(baseElement) {
            baseElement['@base'] = pathwayIri + '/';
          });

          return JSON.stringify(pvjson);
        });
      }
    ));
    //.pipe(process.stdout);

    //.pipe(fs.createWriteStream('../test/output/' + dbId + '-' + idVersion + '.gpml'));
    //.pipe(process.stdout);
  });
}))
.pipe(process.stdout);
//*/
