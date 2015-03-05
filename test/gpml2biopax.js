var pd = require('pretty-data').pd
  , fs = require('fs')
  , Cheerio = require('cheerio')
  , Gpml = require('../src/gpml')
  ;

var input = fs.readFileSync('./input/WP525_74871.gpml', {encoding: 'utf8'});

$ = Cheerio.load(input, {
  normalizeWhitespace: true,
  xmlMode: true,
  decodeEntities: true,
  lowerCaseTags: false
});

var pathwayMetadata = {};
pathwayMetadata.dbName = 'wikipathways';
pathwayMetadata.dbId = 'WP525';
pathwayMetadata.idVersion = '74871';

Gpml.toBiopaxjson($, pathwayMetadata, function(err, biopaxjson) {
    var biopaxjsonString = JSON.stringify(biopaxjson);
    var prettyBiopaxjson = pd.json(biopaxjsonString);
    console.log('prettyBiopaxjson');
    console.log(prettyBiopaxjson);
});
