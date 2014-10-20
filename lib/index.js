#!/usr/bin/env node

var highland = require('highland')
  , fs = require('fs')
  , request = require('request')
  , url = require('url')
  , StreamGpmlToPvjson = require('./stream-gpml-to-pvjson.js')
  ;

// architecture/exporting based on underscore.js code
(function () {

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this; 

  // Create a reference to this
  //var Gpml2013aPvjson10ConverterInstance = JSON.parse(JSON.stringify(Gpml2013aPvjson10Converter));
  //var Gpml2013aPvjson10ConverterInstance = _.cloneDeep(Gpml2013aPvjson10Converter);

  var isBrowser = false;

  // detect environment: browser vs. Node.js
  // I would prefer to use the code from underscore.js or lodash.js, but it doesn't appear to work for me,
  // possibly because I'm using browserify.js and want to detect browser vs. Node.js, whereas
  // the other libraries are just trying to detect whether we're in CommonJS or not.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    isBrowser = true;
  }

  var Gpml2013aPvjson10Converter = {};

  Gpml2013aPvjson10Converter.streamGpmlToPvjson = StreamGpmlToPvjson;

  /**
   * convertGpmlToPvjson
   *
   * @param {string} input - can be a GPML XML string or a file path or URL referencing a GPML file
   * @param {Object} [options] - inputType, dbName (database name), dbId (database identifier), idVersion
   * @param callback - Node.js-style (error, response)
   * @return
   */
  // TODO see whether this actually works. It has not been tested.
  Gpml2013aPvjson10Converter.convertGpmlToPvjson = function(input, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    var inputType = options.inputType
      , dbName = options.dbName
      , dbId = options.dbId
      , idVersion = options.idVersion
      ;

    if (!inputType) {
      if (!!url.parse(input).host) {
        inputType = 'url';
      } else if (fs.existsSync(input)) {
        inputType = 'path';
      } else {
        inputType = 'string';
      }
      console.warn('No inputType specified. Using best guess of "' + inputType + '"');
    }

    var newInputStream;
    if (inputType === 'url') {
      newInputStream = highland(request(input));
    } else if (inputType === 'path') {
      newInputStream = highland(fs.createReadStream(input));
    } else if (inputType === 'string') {
      newInputStream = highland([ input ]);
    } else {
      throw new Error('Unrecognized inputType: "' + inputType + '"');
    }

    newInputStream.pipe(highland.pipeline(
      Gpml2013aPvjson10Converter.streamGpmlToPvjson
    ))
    .collect()
    .each(function(pvjson) {
      var pathwayIri = !!dbId ? 'http://identifiers.org/' + dbName + '/' + dbId : input;
      pvjson.id = pathwayIri;
      if (typeof idVersion !== 'undefined') {
        pvjson.idVersion = idVersion;
      }

      pvjson['@context'].filter(function(contextElement) {
        return contextElement.hasOwnProperty('@base');
      })
      .map(function(baseElement) {
        baseElement['@base'] = pathwayIri;
      });
      return callback(null, pvjson);
    });
  };

  /* TODO finish this. it's currently non-functional and only part-way done.
  function enableCommandLine(Wikipathways) {
    function list(val) {
      return val.split(',');
    }

    var program = require('commander');
    var npmPackage = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));
    program
      .version(npmPackage.version);

     program
       .command('convert-to-json <wikpathways-id>')
       .description('Convert GPML to JSON.')
       .action(function(gpml){

         // haven't figured out how to go from command line to input args
          var gpmlPathwaySelection = gpml
          var pathwayMetadata = 

          Gpml2013aPvjson10Converter.toPvjson(gpmlPathwaySelection, pathwayMetadata,
          function(err, pathway) {
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
       .action(function(env){
         console.log('deploying "%s"', env);
       });

      program.parse(process.argv);

    if (program.listPathways) {
      console.log('List of pathways of type %s', program.listPathways);
    }
  }
  //*/

  // Export the Gpml2013aPvjson10Converter object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `Gpml2013aPvjson10Converter` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Gpml2013aPvjson10Converter;
    }
    exports.Gpml2013aPvjson10Converter = Gpml2013aPvjson10Converter;
  } else {
    root.Gpml2013aPvjson10Converter = Gpml2013aPvjson10Converter;
  }
})();


