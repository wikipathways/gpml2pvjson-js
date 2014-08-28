#!/usr/bin/env node

var GpmlUtilities = require('./gpml-utilities.js')
  , Async = require('async')
  , Biopax = require('biopax2json')
  //, Anchor = require('./anchor.js')
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
  // , Point = require('./point.js')
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
      , currentClassLevelGpmlElementIsPathway
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

    var targetElementTagNames = [
      'Pathway'
      , 'DataNode'
      , 'Shape'
      , 'Label'
      , 'Interaction'
      , 'GraphicalLine'
      , 'Anchor'
    ];
    var supplementalElementWithAttributesTagNames = [
      'Graphics'
      , 'Xref'
    ];
    var supplementalElementWithTextTagNames = [
      'BiopaxRef'
      , 'Comment'
    ];
    var childElementTagNames = [
      'Point'
      , 'Attribute'
    ];
    var currentTargetElement = {};
    var targetElementsToConvertToPvjson = saxStreamFiltered.consume(function (err, x, push, next) {

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

      if ((targetElementTagNames.indexOf(x) > -1 || targetElementTagNames.indexOf(x.name) > -1) && currentTargetElement !== {}) {
        push(null, currentTargetElement);
      }
      if (targetElementTagNames.indexOf(x.name) > -1) {
        currentTargetElement = x;
      } else if (supplementalElementWithAttributesTagNames.indexOf(x.name) > -1) {
        _.merge(currentTargetElement.attributes, x.attributes);
      } else if (childElementTagNames.indexOf(x.name) > -1) {
        currentTargetElement[x.name] = currentTargetElement[x.name] || [];
        currentTargetElement[x.name].push(x.attributes);
      } else if (supplementalElementWithTextTagNames.indexOf(currentTagName) > -1) {
        currentTargetElement[currentTagName] = currentTargetElement[currentTagName] || [];
        currentTargetElement[currentTagName].push(x);
      }

      openTagStream.resume();
      textStream.resume();
      closeTagStream.resume();

      next();
    })
    .each(function(result) {
      console.log('result530');
      console.log(result);
    });

    var openTagStreamEvents = new EventEmitter();
    var classLevelGpmlElementStreamEvents = new EventEmitter();

    openTagStream.fork().each(function(xmlElement) {
      if (classLevelGpmlElementTagNames.indexOf(xmlElement.name) > -1) {
        openTagStreamEvents.emit('ClassLevelElement', xmlElement);
      } else {
        openTagStreamEvents.emit(xmlElement.name, xmlElement);
      }
      openTagStream.resume();
    });

    closeTagStream.fork().each(function(tagName) {
      if (classLevelGpmlElementTagNames.indexOf(tagName) > -1 && tagName !== 'Pathway') {
        closeTagStreamEvents.emit('closeNonPathwayClassLevelElement', tagName);
      } else {
        closeTagStreamEvents.emit('close' + tagName, tagName);
      }
      closeTagStream.resume();
    });

    /*
    var biopaxStream = highland('Biopax', openTagStreamEvents)
    .each(function(biopax) {
    });
    //*/

    var classLevelGpmlElementStream = highland('ClassLevelElement', openTagStreamEvents)
    .map(function(xmlElement) {
      console.log('CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS');
      console.log(generateKString() + ' ' + xmlElement.name);
      console.log('CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS CLASS');
      if (xmlElement.name === 'Pathway') {
        var attributes = xmlElement.attributes;
        var xmlns = attributes.xmlns.value;

        if (GpmlUtilities.supportedNamespaces.indexOf(xmlns) === -1) {
          // test for whether file is GPML
          openTagStream.destroy();
          return callbackOutside('Pathvisiojs does not support the data format provided. Please convert to valid GPML and retry.', {});
        } else if (GpmlUtilities.supportedNamespaces.indexOf(xmlns) !== 0) {
          // test for whether the GPML file version matches the latest version (only the latest version will be supported by pathvisiojs).
          // TODO call the Java RPC updater or in some other way call for the file to be updated.
          openTagStream.destroy();
          return callbackOutside('Pathvisiojs may not fully support the version of GPML provided (xmlns: ' + xmlns + '). Please convert to the supported version of GPML (xmlns: ' + GpmlUtilities.supportedNamespaces[0] + ').', {});
        }
      }

      currentClassLevelGpmlElementIsPathway = (xmlElement.name === 'Pathway');
      if (currentClassLevelGpmlElementIsPathway === false) {
        currentClassLevelPvjsonAndGpmlElements.pvjsonElement = {};
      } else {
        currentClassLevelPvjsonAndGpmlElements.pvjsonElement = pvjson;
      }
      currentClassLevelPvjsonAndGpmlElements.gpmlElement = xmlElement;
      currentClassLevelPvjsonAndGpmlElements = XmlElement.toPvjson(currentClassLevelPvjsonAndGpmlElements);   
      return currentClassLevelPvjsonAndGpmlElements;
    });

    var biopaxRefStream = highland('closeBiopaxRef', closeTagStreamEvents)
    .each(function(tagName) {
      currentClassLevelPvjsonAndGpmlElements.pvjsonElement.xrefs = currentClassLevelPvjsonAndGpmlElements.pvjsonElement.xrefs || [];
      // TODO write something to fill these out once the Biopax is parsed
      currentClassLevelPvjsonAndGpmlElements.pvjsonElement.xrefs.push(currentText);
    });

    //*
    // NOTE: this is handling an XML _ELEMENT_. The element tagName is "Attribute."
    var attributeElementStream = highland('Attribute', openTagStreamEvents)
    .each(function(attributeElement) {
      currentClassLevelPvjsonAndGpmlElements = Attribute.toPvjson(attributeElement, currentClassLevelPvjsonAndGpmlElements);
    });
    //*/

    var graphicsStream = highland('Graphics', openTagStreamEvents)
    .zip(classLevelGpmlElementStream.fork())
    .each(function(args) {
      highland(args).apply(function(graphics, classLevelPvjsonAndGpmlElements) {
        currentClassLevelPvjsonAndGpmlElements = Graphics.toPvjson(graphics, currentClassLevelPvjsonAndGpmlElements);
        classLevelGpmlElementStream.resume();
      });
    });

    var xrefElementStream = highland('Xref', openTagStreamEvents)
    .map(function(element) {
      //classLevelGpmlElementStream.pause();
      return {
        xrefElement: element
        , pvjson: pvjson
        , currentClassLevelPvjsonAndGpmlElements: currentClassLevelPvjsonAndGpmlElements
      };
    })
    .map(UnificationXref.toPvjson)
    //*
    .each(function(args) {
      // TODO figure out how to use highland better for this
      args.apply(function(args) {
        var pvjsonElement = args[0];
        var entityReference = args[1];
        console.log('pvjsonElement');
        console.log(pvjsonElement);
        console.log('entityReference');
        console.log(entityReference);
        currentClassLevelPvjsonAndGpmlElements.pvjsonElement = pvjsonElement;
        if (!!entityReference) {
          // TODO the old converter pushed the entityReference into the
          // elements array, but wouldn't it make more sense to push it
          // into the xrefs array?
          pvjson.elements.push(entityReference);
        }
      });
    });
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

    highland('closeNonPathwayClassLevelElement', closeTagStreamEvents)
    .each(function(tagName) {
      pvjson.elements.push(currentClassLevelPvjsonAndGpmlElements.pvjsonElement);
    });

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

    // TODO do these things once SAX ends

    /*
    // TODO make sure to get anchors!
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

    // Add an id to every element missing one. Generate id value by incrementing 'maxId',
    // converting to base32 and appending it to the string 'id'.
    pvjson.elements.filter(function(element) {
      return !element.id;
    })
    .map(function(element) {
      maxId = (parseInt(maxId, 32) + 1).toString(32);
      element.id = 'id' + maxId;
    });
    //*/

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


