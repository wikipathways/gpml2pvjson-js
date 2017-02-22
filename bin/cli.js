#!/usr/bin/env node

var fs = require('fs');
var gpml2pvjson = require('../index');
var npmPackage = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));
var program = require('commander');
var Rx = require('rx-extra');
var VError = require('verror');
global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
var atob = require('atob');

program
  .version(npmPackage.version);

program
  .command('gpml2pvjson')
  .description('Convert GPML to pvjson')
  .action(function() {

//    var gpmlChunkStream = Rx.Observable.fromNodeReadableStream(process.stdin)
//      .mergeMap(function(x) {
//        console.log('x');
//        console.log(x);
//        const gpmlString = x.toString();
//        return Rx.Observable.from([gpmlString.substring(0, 10), gpmlString.substring(10, x.length)]);
//      });

    //const wpId = 'WP2374';
    //const version = 0;
    const wpId = 'WP554';
    const version = 77712; // 77712
		const ajaxRequest = {
			url: `http://webservice.wikipathways.org/getPathwayAs?fileType=xml&pwId=${wpId}&revision=${version}&format=json`,
			method: 'GET',
			responseType: 'json',
			timeout: 1 * 1000, // ms
			crossDomain: true,
		};
    var gpmlChunkStream = Rx.Observable.ajax(ajaxRequest)
      .map((ajaxResponse) => ajaxResponse.xhr.responseText)
      .map(JSON.parse)
      .map(res => res.data)
      .map(atob);

    //*/
    var pathwaySource = gpml2pvjson(gpmlChunkStream, `http://identifiers.org/wikipathways/${wpId}`)
      .do(null, function(err) {
        var err2 = new VError(err, 'error (after?) converting GPML to pvjson');
        console.error(err2.stack);
      })
      .subscribe(function(output) {
        console.log(JSON.stringify(output, null, '  '));
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
