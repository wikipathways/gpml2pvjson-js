#!/usr/bin/env node

var fs = require('fs');
var Gpml2Pvjson = require('../index.js');
var npmPackage = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));
var program = require('commander');

// TODO finish this. it's currently non-functional and only part-way done.
function enableCommandLine(Wikipathways) {
  function list(val) {
    return val.split(',');
  }

  program
    .version(npmPackage.version);

  program
    .command('convert-to-json <wikpathways-id>')
    .description('Convert GPML to JSON.')
    .action(function(gpml) {

      // haven't figured out how to go from command line to input args
      var gpmlPathwaySelection = gpml;
      var pathwayMetadata = 'something';

      var gpml2pvjson = new Gpml2Pvjson();
      gpml2pvjson.toPvjson(gpmlPathwaySelection, pathwayMetadata, function(err, pathway) {
        if (err) {
          console.log(err);
          process.exit(1);
        }
        console.log(JSON.stringify(pathway, null, '\t'));
        process.exit(0);
      });
    });

  program
    .command('*')
    .description('deploy the given env')
    .action(function(env) {
      console.log('deploying "%s"', env);
    });

  program.parse(process.argv);

  if (program.listPathways) {
    console.log('List of pathways of type %s', program.listPathways);
  }
}
