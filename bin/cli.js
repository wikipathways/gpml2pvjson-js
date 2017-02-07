#!/usr/bin/env node

var Cheerio = require('cheerio');
var fs = require('fs');
var Gpml2Pvjson = require('../index.js');
var npmPackage = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));
var program = require('commander');
var Rx = require('rx-extra');
var RxNode = Rx.RxNode;

program
  .version(npmPackage.version);

program
  .command('gpml2pvjson')
  .description('Convert GPML to pvjson')
  .action(function() {
    Rx.Observable.fromUnpausableStream(process.stdin)
      .map(x => x.toString())
      .toArray()
      .map(x => x.join(''))
      .subscribe(function(input) {
        $ = Cheerio.load(input, {
          normalizeWhitespace: true,
          xmlMode: true,
          decodeEntities: true,
          lowerCaseTags: false
        });
        var gpmlPathwaySelection = $('Pathway');

        var pathwayMetadata = {};

        var gpml2PvjsonInstance = new Gpml2Pvjson();
        var pvjson = gpml2PvjsonInstance.toPvjson(
            gpmlPathwaySelection,
            pathwayMetadata,
            function(err, pvjson) {
              if (err) {
                console.error(err);
                process.exit(1);
              }
              console.log(JSON.stringify(pvjson, null, '  '));
              process.exit(0);
            }
        );
      }, function(err) {
        console.error(err);
        process.exit(1);
      });
    //var disposable = RxNode.writeToStream(pathwaySource, process.stdout, 'utf8');
  })
  .on('--help', function() {
    console.log('  Example:');
    console.log();
    console.log('    Display pvjson in command line:');
    console.log('    $ ./bin/cli.js gpml2pvjson < ./WP554_77712.gpml');
    console.log('    Save pvjson to new file:');
    console.log('    $ ./bin/cli.js gpml2pvjson < ./WP554_77712.gpml > ./WP554_77712.json');
    console.log('    Download from WikiPathways and convert:');
    console.log('    $ curl "http://webservice.wikipathways.org/getPathwayAs?fileType=xml&pwId=WP554&revision=77712&format=xml" | xpath "*/ns1:data/text()" | base64 --decode | node ./bin/cli.js gpml2pvjson');
    console.log();
  });

program.parse(process.argv);

if (!program.args.length) {
  program.help();
}

// TODO finish this. it's currently non-functional and only part-way done.
function enableCommandLine(Wikipathways) {
  function list(val) {
    return val.split(',');
  }

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
          cb(err);
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










