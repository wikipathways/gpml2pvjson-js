#!/usr/bin/env node

var fs = require('fs');
var gpml2Pvjson = require('../index.js');
var npmPackage = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));
var program = require('commander');
var Rx = require('rx-extra');
var VError = require('verror');

program
  .version(npmPackage.version);

program
  .command('gpml2pvjson')
  .description('Convert GPML to pvjson')
  .action(function() {

    var gpmlChunkStream = Rx.Observable.fromNodeReadableStream(process.stdin);
    //*/
    var pathwaySource = gpml2Pvjson.transformGpmlToPvjson(gpmlChunkStream)
      .do(null, function(err) {
        var err2 = new VError(err, 'error (after?) converting GPML to pvjson');
        console.error(err2.stack);
      })
      .subscribe(function(pvjson) {
        console.log(JSON.stringify(pvjson, null, '  '));
        process.exit(0);
      }, function(err) {
        console.error(err);
        process.exit(1);
      });
  })
  .on('--help', function() {
    console.log('  Example:');
    console.log();
    console.log('    Display pvjson in command line:');
    console.log('    $ ./bin/cli.js gpml2pvjson < ./test/input/WP554_77712.gpml');
    console.log('    Save pvjson to new file:');
    console.log('    $ ./bin/cli.js gpml2pvjson < ./test/input/WP554_77712.gpml > ./WP554_77712.json');
    console.log('    Download from WikiPathways and convert:');
    console.log('    $ curl "http://webservice.wikipathways.org/getPathwayAs?fileType=xml&pwId=WP554&revision=77712&format=xml" | xpath "*/ns1:data/text()" | base64 --decode | node ./bin/cli.js gpml2pvjson');
    console.log();
  });

program.parse(process.argv);

if (!program.args.length) {
  program.help();
}
