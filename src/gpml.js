#!/usr/bin/env node

var GpmlUtilities = require('./gpml-utilities.js')
  , Anchor = require('./anchor.js')
  , Async = require('async')
  , Biopax = require('biopax2json')
  // , Comment = require('./comment.js')
  , DataNode = require('./data-node.js')
  , XmlElement = require('./xml-element.js')
  , fs = require('fs')
  , http = require('http')
  , request = require('request')
  , highland = require('highland')
  , GraphicalLine = require('./graphical-line.js')
  , Graphics = require('./graphics.js')
  , Attribute = require('./attribute.js')
  , Group = require('./group.js')
  , Interaction = require('./interaction.js')
  , Label = require('./label.js')
  , Point = require('./point.js')
  , Shape = require('./shape.js')
  , State = require('./state.js')
  , _ = require('lodash')
  , EventEmitter = require('events').EventEmitter
  , UnificationXref = require('./unification-xrefs.js')
  // , Text = require('./text.js')
  ;

// architecture/exporting based on underscore.js code
(function () {

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this; 

  // Create a reference to this
  //var Gpml2JsonInstance = JSON.parse(JSON.stringify(Gpml2Json));
  //var Gpml2JsonInstance = _.cloneDeep(Gpml2Json);

  var isBrowser = false;

  // detect environment: browser vs. Node.js
  // I would prefer to use the code from underscore.js or lodash.js, but it doesn't appear to work for me,
  // possibly because I'm using browserify.js and want to detect browser vs. Node.js, whereas
  // the other libraries are just trying to detect whether we're in CommonJS or not.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    isBrowser = true;
  }

  // Create a safe reference to the Gpml2Json object for use below.
  var Gpml2Json = function(obj) {
    if (obj instanceof Gpml2Json) {
      return obj;
    }
    if (!(this instanceof Gpml2Json)) {
      return new Gpml2Json(obj);
    }
  };

  /**
   * toPvjson
   *
   * @param input (URL string only now. in the future: GPML string, document, jQuery selection)
   * @param pathwayMetadata object
   * @param callbackOutside
   * @return
   */
  Gpml2Json.toPvjson = function(input, pathwayMetadata, callbackOutside){
    var k = 0;
    function generateKString() {
      var kString = '';
      for (var l = 0; l < 60; l++) {
        kString += ' ';
        //kString += String(k) + ' ';
      }
      k += 1;
      return kString + String(k);
    }

    console.log('************************************************************************************************************************************************************************');
    console.log('************************************************************************************************************************************************************************');
    console.log('START START START START START START START START START START START START START START START START START START START START START START START START START START');
    console.log('START START START START START START START START START START START START START START START START START START START START START START START START START START');
    console.log('START START START START START START START START START START START START START START START START START START START START START START START START START START');
    console.log('************************************************************************************************************************************************************************');
    console.log('************************************************************************************************************************************************************************');
    console.log('');

    var pvjson = {}
      , currentClassLevelPvjsonAndGpmlElements = {}
      , currentElementIsPathway
      , currentText
      ;

    var pathwayIri = 'http://identifiers.org/wikipathways/' + pathwayMetadata.dbId;

    var globalContext = [];
    // TODO update this to remove test2.
    //globalContext.push('http://test2.wikipathways.org/v2/contexts/pathway.jsonld');
    globalContext.push('http://test2.wikipathways.org/v2/contexts/biopax.jsonld');
    globalContext.push('http://test2.wikipathways.org/v2/contexts/organism.jsonld');
    globalContext.push('http://test2.wikipathways.org/v2/contexts/cellular-location.jsonld');
    globalContext.push('http://test2.wikipathways.org/v2/contexts/display.jsonld');
    //globalContext.push('http://test2.wikipathways.org/v2/contexts/interaction-type.jsonld');
    pvjson['@context'] = globalContext;
    var localContext = {};
    localContext = {};
    localContext['@base'] = pathwayIri + '/';
    pvjson['@context'].push(localContext);
    pvjson.type = 'Pathway';
    // using full IRI, because otherwise I would have to indicate the id as something like "/", which is ugly.
    pvjson.id = pathwayIri;
    pvjson.idVersion = pathwayMetadata.idVersion;
    pvjson.xrefs = [];

    pvjson.elements = [];

    var strict = true; // set to false for html-mode

    var through = highland.pipeline(
      highland.map(function(xmlStringChunk) {
        /*
        console.log('xmlStringChunk');
        console.log(xmlStringChunk);
        //*/
        return xmlStringChunk;
      })
    );

    // stream usage
    // takes the same options as the parser
    var saxStream = require('sax').createStream(strict, {
      xmlns: true
      , trim: true
    });
    saxStream.on('error', function (e) {
      // unhandled errors will throw, since this is a proper node
      // event emitter.
      console.error('error!', e);
      // clear the error
      this._parser.error = null;
      this._parser.resume();
    });

    var classLevelGpmlElementTagNames = _.keys(XmlElement.classLevelElements);


    var openTagStream = highland('opentag', saxStream);
    var currentTagName;
    openTagStream.fork().each(function(element) {
      currentTagName = element.name;
      openTagStream.resume();
    });
    var textStream = highland('text', saxStream);
    var closeTagStreamEvents = new EventEmitter();
    var closeTagStreamEvents2 = new EventEmitter();
    textStream.fork().each(function(text) {
      currentText = text;
      textStream.resume();
    });
    var closeTagStream = highland('closetag', saxStream);

    var saxStreamFiltered = highland.merge([openTagStream.fork(), textStream.fork(), closeTagStream.fork()]);
    //var saxStreamFiltered = highland.otherwise(openTagStream.fork(), textStream.fork(), closeTagStream.fork());

    var tagNamesForTargetElements = [
      , 'DataNode'
      , 'Label'
      , 'Interaction'
      , 'GraphicalLine'
      , 'Group'
      , 'Shape'
      , 'State'
      , 'Pathway'
    ];
    //*
    var tagNamesForNestedTargetElements = [
      'Anchor'
    ];
    //*/
    var tagNamesForSupplementalElementsWithAttributes = [
      'Graphics'
      , 'Xref'
    ];
    var tagNamesForSupplementalElementsWithText = [
      'BiopaxRef'
      , 'Comment'
    ];
    var tagNamesForNestedSupplementalElements = [
      'Point'
      //, 'Anchor'
      , 'Attribute'
    ];
    var currentTargetElement = {};
    // TODO figure out why currentTargetElement doesn't have its defaults when it is an edge with default color and we are handling an anchor.
    // currentTargetElementWithDefaults does have the defaults.
    var currentTargetElementWithDefaults = {};
    var pvjsonStream = saxStreamFiltered.consume(function (err, x, push, next) {

      if (err) {
        // pass errors along the stream and consume next value
        push(err);
        next();
        return;
      }

      if (x === highland.nil) {
        // pass nil (end event) along the stream
        push(null, x);
        return;
      }

      if ((tagNamesForTargetElements.indexOf(x) > -1 || tagNamesForTargetElements.indexOf(x.name) > -1) && tagNamesForTargetElements.indexOf(currentTargetElement.name) > -1) {
        push(null, currentTargetElement);
        currentTargetElement = {};
      }

      if (tagNamesForTargetElements.indexOf(x.name) > -1) {

        if (x.name === 'Pathway') {
          var attributes = x.attributes;
          var xmlns = attributes.xmlns.value;

          if (GpmlUtilities.supportedNamespaces.indexOf(xmlns) === -1) {
            // test for whether file is GPML
            saxStreamFiltered.destroy();
            return callbackOutside('Pathvisiojs does not support the data format provided. Please convert to valid GPML and retry.', {});
          } else if (GpmlUtilities.supportedNamespaces.indexOf(xmlns) !== 0) {
            // test for whether the GPML file version matches the latest version (only the latest version will be supported by pathvisiojs).
            // TODO call the Java RPC updater or in some other way call for the file to be updated.
            saxStreamFiltered.destroy();
            return callbackOutside('Pathvisiojs may not fully support the version of GPML provided (xmlns: ' + xmlns + '). Please convert to the supported version of GPML (xmlns: ' + GpmlUtilities.supportedNamespaces[0] + ').', {});
          }
        }

        currentTargetElement = x;
      } else if (tagNamesForSupplementalElementsWithAttributes.indexOf(x.name) > -1) {
        _.merge(currentTargetElement.attributes, x.attributes);
        //*
      } else if (tagNamesForNestedTargetElements.indexOf(x.name) > -1) {
        //saxStreamFiltered.pause();
        var currentNestedTargetElement = x;

        currentNestedTargetElement.attributes.Color = {};
        currentNestedTargetElement.attributes.Color.name = 'Color';
        currentNestedTargetElement.attributes.Color.value = currentTargetElementWithDefaults.attributes.Color.value;

        currentNestedTargetElement.attributes.GraphRef = {};
        currentNestedTargetElement.attributes.GraphRef.name = 'GraphRef';
        currentNestedTargetElement.attributes.GraphRef.value = currentTargetElementWithDefaults.attributes.GraphId.value;

        currentNestedTargetElement.attributes.ZOrder = {};
        currentNestedTargetElement.attributes.ZOrder.name = 'ZOrder';
        currentNestedTargetElement.attributes.ZOrder.value = currentTargetElementWithDefaults.attributes.ZOrder.value + 0.1;

        push(null, currentNestedTargetElement);
        //*/
      } else if (tagNamesForNestedSupplementalElements.indexOf(x.name) > -1) {
        currentTargetElement.attributes[x.name] = currentTargetElement.attributes[x.name] || {};
        currentTargetElement.attributes[x.name].name = x.name;
        currentTargetElement.attributes[x.name].value = currentTargetElement.attributes[x.name].value || [];
        currentTargetElement.attributes[x.name].value.push(x.attributes);
      } else if (tagNamesForSupplementalElementsWithText.indexOf(currentTagName) > -1) {
        currentTargetElement.attributes[currentTagName] = currentTargetElement.attributes[currentTagName] || [];
        currentTargetElement.attributes[currentTagName].push(x);
      }

      openTagStream.resume();
      textStream.resume();
      closeTagStream.resume();

      next();
    })
    .map(function(element) {
      console.log('CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS');
      console.log(generateKString() + ' ' + element.name);
      console.log('CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS');

      currentTargetElement = XmlElement.applyDefaults(element);
      //saxStreamFiltered.resume();
      return currentTargetElement;
    })
    .scan(pvjson, function(accumulator, consolidatedTargetElement) {
      var pvjsonElement = (consolidatedTargetElement.name !== 'Pathway') ? {} : accumulator;
      pvjson = XmlElement.toPvjson({
        pvjson: accumulator,
        pvjsonElement: pvjsonElement,
        gpmlElement: consolidatedTargetElement
      });

      currentTargetElementWithDefaults = consolidatedTargetElement;

      return pvjson;
    })
    /* This is no longer needed now that we're using uuids for elements missing a GraphId
    .map(function() {
      // determine initial value for maxId by filtering for elements that
      // have an id that starts with 'id' and for each one, convert the part of the id
      // after 'id' to a base32 integer. Find the maximum resulting integer.
      var idsAsIntegersArray = pvjson.elements.filter(function(element) {
        return !!element.id && element.id.slice(0,2) === 'id';
      })
      .map(function(element) {
        return parseInt(element.id.slice(2, element.id.length), 32);
      });
      idsAsIntegersArray.push(0);
      var maxId = Math.max.apply(null, idsAsIntegersArray);

      // Add an id to every element missing one. Generate id value by incrementing 'maxId',
      // converting to base32 and appending it to the string 'id'.
      pvjson.elements.filter(function(element) {
        return !element.id;
      })
      .map(function(element) {
        maxId = (parseInt(maxId, 32) + 1).toString(32);
        element.id = 'id' + maxId;
      });
      return pvjson;
    });
    //*/
    .map(function() {

      _(pvjson.elements).filter(function(element) {
        return element['gpml:element'] === 'gpml:Group';
      })
      .map(function(group) {
        group = Group.toPvjson(pvjson, group);
        return group;
      });

      var edges = _(pvjson.elements).filter(function(element) {
        return element['gpml:element'] === 'gpml:Interaction' || element['gpml:element'] === 'gpml:GraphicalLine';
      })
      .map(function(edge) {
      /*
        edge = Point.toPvjson({
          pvjson: pvjson
          , pvjsonElement: edge
        });
      //*/
        return edge;
      });

      /*
      _(edges).filter(function(element) {
        return element.hasOwnProperty('gpml:Anchor');
      })
      .map(function(edge) {
        pvjson = Anchor.toPvjson({
          pvjson: pvjson
          , pvjsonElement: edge
        });
        return edge;
      });
      //*/

      return pvjson;
    })
    .each(function() {
      return pvjson;
    });

    /* Can we delete this? It doesn't appear to be used anywhere.
    var graphicalElementTagNames = [
      'DataNode',
      'Label',
      'Shape',
      'State',
      'Anchor',
      'Interaction',
      'GraphicalLine',
      'Group'
    ];
    //*/

    // TODO
    // MVP
    // * Anchors
    //    Look at whether they should be included in pvjson.elements. It appears they may not be.
    // * Points
    // * Interactions - taking care of points might take care of interactions and graphical lines.
    // * GraphicalLines
    // * Convert Biopax
    // * Update BiopaxRefs
    // LATER
    // * Comments
    // * Better handling of x,y for anchors

    /*
    //pvjsonStream.fork().each(function() {
    pvjsonStream.each(function() {
      //*
      // determine initial value for maxId by filtering for elements that
      // have an id that starts with 'id' and for each one, convert the part of the id
      // after 'id' to a base32 integer. Find the maximum resulting integer.
      var idsAsIntegersArray = pvjson.elements.filter(function(element) {
        return !!element.id && element.id.slice(0,2) === 'id';
      })
      .map(function(element) {
        return parseInt(element.id.slice(2, element.id.length), 32);
      });
      var maxId = Math.max.apply(null, idsAsIntegersArray) || 0;
      console.log('maxId');
      console.log(maxId);

      // Add an id to every element missing one. Generate id value by incrementing 'maxId',
      // converting to base32 and appending it to the string 'id'.
      var mytest = pvjson.elements.filter(function(element) {
        return !element.id;
      })
      .map(function(element) {
        maxId = (parseInt(maxId, 32) + 1).toString(32);
        element.id = 'id' + maxId;
      });
      console.log('mytest');
      console.log(mytest);
      return pvjson;
      //*/
      //pvjsonStream.resume();
    //});
    //*/




    //*/
    /*
    .apply(function(pvjsonElement, entityReference) {
      console.log('pvjsonElement');
      console.log(pvjsonElement);
      console.log('entityReference');
      console.log(entityReference);
      currentClassLevelPvjsonAndGpmlElements.pvjsonElement = pvjsonElement;
      if (!!entityReference) {
        pvjson.elements.push(entityReference);
      }
      //classLevelGpmlElementStream.resume();
    });
    //*/

    /*
    var anchorStream = highland('Anchor', openTagStreamEvents)
    .each(function(element) {
      var anchor = Anchor.toPvjson({
        anchorElement: element
        , currentClassLevelPvjsonAndGpmlElements: currentClassLevelPvjsonAndGpmlElements
        , pvjson: pvjson
      });
      pvjson.elements.push(anchor);
    });
    //*/

    /*
    var biopaxStream = highland('Biopax', openTagStreamEvents)
    .each(function(biopax) {
    });
    //*/

    highland(fs.createReadStream(input))
    //request('http://www.wikipathways.org/wpi/wpi.php?action=downloadFile&type=gpml&pwTitle=Pathway:WP525')
      .pipe(saxStream)
      .pipe(through)
      .last()
      .map(function(array) {
        console.log('pvjson');
        console.log(pvjson);
        return array.toString();
      })
      .pipe(fs.createWriteStream('../test/output/file-copy.xml'));


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

          Gpml2Json.toPvjson(gpmlPathwaySelection, pathwayMetadata,
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

  // Export the Gpml2Json object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `Gpml2Json` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Gpml2Json;
    }
    exports.Gpml2Json = Gpml2Json;
  } else {
    root.Gpml2Json = Gpml2Json;
  }
})();


