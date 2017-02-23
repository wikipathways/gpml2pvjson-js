#!/usr/bin/env node

var _ = require('lodash');
var crypto = require('crypto');
var fs = require('fs');
var gpml2pvjson = require('../index');
var hl = require('highland');
var npmPackage = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));
var program = require('commander');
var Rx = require('rx-extra');
var VError = require('verror');

program
  .version(npmPackage.version)
  .description('Converts GPML (XML) to pvjson (JSON)')
  .option('--id [string]',
          'Specify unique ID of this pathway, e.g., "http://identifiers.org/wikipathways/WP4"');

program
  .on('--help', function() {
    console.log('  Examples:');
    console.log();
    console.log('    Display pvjson in command line:');
    console.log([
        '    $ gpml2pvjson --id http://identifiers.org/wikipathways/WP554',
                '< ./test/input/WP554_77712.gpml'
    ].join(''));

    console.log('    Save pvjson to new file:');
    console.log(
        '    $ gpml2pvjson < ./test/input/WP554_77712.gpml > ./WP554_77712.json'
    );

    console.log('    Download from WikiPathways and convert:');
    console.log([
        '    $ curl "http://webservice.wikipathways.org/getPathwayAs?',
               'fileType=xml&pwId=WP554&revision=77712&format=xml"',
                ' | xpath "*/ns1:data/text()" | base64 --decode',
                ' | gpml2pvjson --id http://identifiers.org/wikipathways/WP554'
    ].join(''));
  });

program.parse(process.argv);

var id = program.id;
// NOTE If an id is not provided, the CLI generates a hash of the input to use as the id. See
// https://bentrask.com/?q=hash://sha256/98493caa8b37eaa26343bbf73f232597a3ccda20498563327a4c3713821df892
// The library itself does not do this.
var HASH_NAME = 'sha256';
var hash = crypto.createHash(HASH_NAME);
hash.setEncoding('hex');

var source = id ? process.stdin : hl(process.stdin)
  .doto(function(chunk) {
    hash.update(chunk);
  });

var gpmlChunkStream = Rx.Observable.fromNodeReadableStream(source)
  .map((x) => x.toString())

gpml2pvjson(gpmlChunkStream, id)
  .do(null, function(err) {
    var err2 = new VError(err, 'error (after?) converting GPML to pvjson');
    console.error(err2.stack);
  })
  .subscribe(function(output) {
    if (!id) {
      id = `hash://${ HASH_NAME }/${ hash.digest('hex') }`;
      output.id = id;
      output['@context'] = output['@context']
        .map(function(ctx) {
          if (_.isPlainObject(ctx) && ctx['@base']) {
            ctx['@base'] = id + '/';
          }
          return ctx;
        });
    }
    process.stdout.write(JSON.stringify(output, null, '  '));
    process.exit(0);
  }, function(err) {
    console.error(err);
    process.exit(1);
  });
