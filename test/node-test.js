var pd = require('pretty-data').pd;
var fs = require('fs');
var Cheerio = require('cheerio');
var Gpml2Json = require('../index.js');
var request = require('request');

/*
request('http://www.wikipathways.org/wpi/wpi.php?action=downloadFile&type=gpml&pwTitle=Pathway:WP1266', function (error, response, input) {
  if (!error && response.statusCode === 200) {
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
    pathwayMetadata.idVersion = '63315';

    var pvjson = Gpml2Json.toPvjson(gpmlPathwaySelection, pathwayMetadata, function(err, pvjson) {
        var pvjsonString = JSON.stringify(pvjson);
        var prettyPvjson = pd.json(pvjsonString);
        console.log('prettyPvjson');
        console.log(prettyPvjson);
    });
  }
});
//*/

//*
var input = fs.readFileSync(__dirname + '/input/WP1_73346.gpml', {encoding: 'utf8'});
//var input = fs.readFileSync('./input/playground.gpml', {encoding: 'utf8'});

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
pathwayMetadata.idVersion = '63315';

var gpml2PvjsonInstance = new Gpml2Json();
var pvjson = gpml2PvjsonInstance.toPvjson(gpmlPathwaySelection, pathwayMetadata, function(err, pvjson) {
    var pvjsonString = JSON.stringify(pvjson);
    var prettyPvjson = pd.json(pvjsonString);
    console.log('prettyPvjson');
    console.log(prettyPvjson);
});
//*/
