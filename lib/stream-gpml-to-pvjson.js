var _ = require('lodash')
  , EventEmitter = require('events').EventEmitter
  , highland = require('highland')
  //, sax = require('sax')
  , sax = require('../../sax-js/lib/sax.js')
  , Anchor = require('./anchor.js')
  , Async = require('async')
  , Attribute = require('./attribute.js')
  , Biopax = require('biopax2json')
  // , Comment = require('./comment.js')
  , DataNode = require('./data-node.js')
  , GpmlUtilities = require('./gpml-utilities.js')
  , GraphicalLine = require('./graphical-line.js')
  , Graphics = require('./graphics.js')
  , Group = require('./group.js')
  , Interaction = require('./interaction.js')
  , Label = require('./label.js')
  , Point = require('./point.js')
  , Shape = require('./shape.js')
  , State = require('./state.js')
  // , Text = require('./text.js')
  , XmlElement = require('./xml-element.js')
  ;

var StreamGpmlToPvjson = function(sourceStream){
  var pvjson
    , pathwayIri
    , currentClassLevelPvjsonAndGpmlElements = {}
    , currentElementIsPathway
    , currentText
    , globalContext = []
    , saxStream
    , saxStreamIsStrict = true // set to false for html-mode
    , openTagStream
    , currentTagName
    , textStream
    , closeTagStream
    ;

  // TODO update this to remove test2.
  //globalContext.push('http://test2.wikipathways.org/v2/contexts/pathway.jsonld');
  globalContext.push('http://test2.wikipathways.org/v2/contexts/biopax.jsonld');
  globalContext.push('http://test2.wikipathways.org/v2/contexts/organism.jsonld');
  globalContext.push('http://test2.wikipathways.org/v2/contexts/cellular-location.jsonld');
  globalContext.push('http://test2.wikipathways.org/v2/contexts/display.jsonld');
  //globalContext.push('http://test2.wikipathways.org/v2/contexts/interaction-type.jsonld');

  function createNewSaxStream() {
    // stream usage
    // takes the same options as the parser
    saxStream = sax.createStream(saxStreamIsStrict, {
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

    openTagStream = highland('opentag', saxStream);
    textStream = highland('text', saxStream);
    closeTagStream = highland('closetag', saxStream);

    return saxStream;
  }

  saxStream = createNewSaxStream();

  function ensureGraphIdExists(x) {
    x.attributes.GraphId = x.attributes.GraphId || {name: 'GraphId', 'value': 'idpvjs' + saxStream._parser.startTagPosition};
    return x;
  }

  var endStreamEvents = new EventEmitter();
  var endStream = highland('end', endStreamEvents);

  /*
  var tagNamesForNestedTargetElementStreamEvents = new EventEmitter();
  var tagNamesForNestedTargetElementStream = highland('element', tagNamesForNestedTargetElementStreamEvents);
  //*/

  var saxStreamFiltered = highland.merge([openTagStream, textStream, closeTagStream]);

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
  var tagNamesForNestedTargetElements = [
    'Anchor'
  ];
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
    , 'Attribute'
  ];

  var currentTargetElement = {};
  var lastTargetElement = {};
  var currentNestedTargetElements = [];
  var currentPublicationXrefDisplayName = 1;
  var publicationXrefs = [];

  var pvjsonStream = saxStreamFiltered.consume(function (err, x, push, next) {

    if (err) {
      // pass errors along the stream and consume next value
      push(err);
      next();
      return;
    }

    // this doesn't happen when running it for just one pathway
    if (x === highland.nil) {
      // pass nil (end event) along the stream
      push(null, x);
      return;
    }

    if (!!x.name) {
      currentTagName = x.name;
    }

    if ((tagNamesForTargetElements.indexOf(x) > -1 || tagNamesForTargetElements.indexOf(x.name) > -1) && tagNamesForTargetElements.indexOf(currentTargetElement.name) > -1) {
      push(null, currentTargetElement);
      currentTargetElement = {};

      currentNestedTargetElements.forEach(function(currentNestedTargetElement) {
        currentNestedTargetElement.attributes.Color = {};
        currentNestedTargetElement.attributes.Color.name = 'Color';
        currentNestedTargetElement.attributes.Color.value = lastTargetElement.attributes.Color.value;

        currentNestedTargetElement.attributes.GraphRef = {};
        currentNestedTargetElement.attributes.GraphRef.name = 'GraphRef';
        currentNestedTargetElement.attributes.GraphRef.value = lastTargetElement.attributes.GraphId.value;

        currentNestedTargetElement.attributes.ZOrder = {};
        currentNestedTargetElement.attributes.ZOrder.name = 'ZOrder';
        currentNestedTargetElement.attributes.ZOrder.value = lastTargetElement.attributes.ZOrder.value + 0.1;

        push(null, currentNestedTargetElement);
      });
      currentNestedTargetElements = [];
    }

    if (tagNamesForTargetElements.indexOf(x.name) > -1) {
      if (x.name !== 'Pathway') {
        x = ensureGraphIdExists(x);
      } else if (x.name === 'Pathway') {
        var attributes = x.attributes;
        var xmlns = attributes.xmlns.value;

        if (GpmlUtilities.supportedNamespaces.indexOf(xmlns) === -1) {
          // test for whether file is GPML
          saxStreamFiltered.destroy();
          return 'Pathvisiojs does not support the data format provided. Please convert to valid GPML and retry.';
        } else if (GpmlUtilities.supportedNamespaces.indexOf(xmlns) !== 0) {
          // test for whether the GPML file version matches the latest version (only the latest version will be supported by pathvisiojs).
          // TODO call the Java RPC updater or in some other way call for the file to be updated.
          saxStreamFiltered.destroy();
          return 'Pathvisiojs may not fully support the version of GPML provided (xmlns: ' + xmlns + '). Please convert to the supported version of GPML (xmlns: ' + GpmlUtilities.supportedNamespaces[0] + ').';
        }

        pvjson = {};
        pvjson['@context'] = globalContext;

        pvjson.type = 'PathwayReference';
        pvjson.elements = [];
      }
      currentTargetElement = x;
    } else if (tagNamesForSupplementalElementsWithAttributes.indexOf(x.name) > -1) {
      _.merge(currentTargetElement.attributes, x.attributes);
    } else if (tagNamesForNestedTargetElements.indexOf(x.name) > -1) {
      x = ensureGraphIdExists(x);
      currentNestedTargetElements.push(x);
    } else if (tagNamesForNestedSupplementalElements.indexOf(x.name) > -1) {
      currentTargetElement.attributes[x.name] = currentTargetElement.attributes[x.name] || {};
      currentTargetElement.attributes[x.name].name = x.name;
      currentTargetElement.attributes[x.name].value = currentTargetElement.attributes[x.name].value || [];
      currentTargetElement.attributes[x.name].value.push(x);
    } else if (tagNamesForSupplementalElementsWithText.indexOf(currentTagName) > -1 && !x.name && currentTagName !== x) {
      currentTargetElement.attributes = currentTargetElement.attributes || {};
      currentTargetElement.attributes['gpml:' + currentTagName] = currentTargetElement.attributes['gpml:' + currentTagName] || {};
      currentTargetElement.attributes['gpml:' + currentTagName].name = 'gpml:' + currentTagName;
      currentTargetElement.attributes['gpml:' + currentTagName].value = currentTargetElement.attributes['gpml:' + currentTagName].value || [];
      currentTargetElement.attributes['gpml:' + currentTagName].value.push(x);
      // TODO pipe this through a biopax3ToJsonld converter instead of converting it here.
      // need to look at whether that will take too long for pvjs.
    } else if (x.name === 'Biopax' || currentTargetElement.name === 'Biopax') {
      currentTargetElement = currentTargetElement || {};
      currentTargetElement.name = 'Biopax';
      if (!!x.name && x.name.toLowerCase() === 'bp:PublicationXref'.toLowerCase()) {
        var currentPublicationXref = {};
        currentPublicationXref.id = x.attributes['rdf:id'].value;
        currentPublicationXref.displayName = currentPublicationXrefDisplayName;
        currentPublicationXref.type = 'PublicationXref';
        pvjson.elements.push(currentPublicationXref);
        currentPublicationXrefDisplayName += 1;
      }
    }

    // These resume() statements appear to be unneeded, at least right now.
    // Maybe that would be different if I were forking the streams and using
    // them elsewhere as well as here?
    /*
    openTagStream.resume();
    textStream.resume();
    closeTagStream.resume();
    //*/


    if (x === 'Pathway') {
      endStreamEvents.emit('end', pvjson);
    }

    next();

  })
  .map(function(element) {
    element = XmlElement.applyDefaults(element);
    if (tagNamesForTargetElements.indexOf(element.name) > -1) {
      lastTargetElement = element;
    }
    return element;
  })
  .map(function(consolidatedTargetElement) {
    var pvjsonElement = (consolidatedTargetElement.name !== 'Pathway') ? {} : pvjson;
    pvjson = XmlElement.toPvjson({
      pvjson: pvjson,
      pvjsonElement: pvjsonElement,
      gpmlElement: consolidatedTargetElement
    });

    return pvjson;
  })
  .each(function(pvjson) {
    return pvjson;
  });

  // TODO
  // * Comments
  // * Better handling of x,y for anchors
  // * Fully convert Biopax
  // * Update BiopaxRefs to use pubmed URL as @id

  /*
  var biopaxStream = highland('Biopax', openTagStreamEvents)
  .each(function(biopax) {
  });
  //*/

  return sourceStream.pipe(saxStream)
  .pipe(highland.pipeline(
    function(s) {
      s.each(function(xmlStringChunk) {
        // a sax stream passes the GPML (XML) through as chunks in the form of XML strings
        return xmlStringChunk;
      });
      //*
      return endStream.map(function(pvjson) {
        // Update all groups, now that the rest of the elements have all been converted.
        _(pvjson.elements).filter(function(element) {
          return element['gpml:element'] === 'gpml:Group';
        })
        .map(function(group) {
          // Note that a group returned from Group.toPvjson() can be null if the group
          // is empty.
          group = Group.toPvjson(pvjson, group);
          return group;
        });

        // GroupRef attributes are initially represented as pvjson properties like this:
        // "gpml:GroupRef":GroupIdvalue
        // Once all the elements have been converted to pvjson, these properties are
        // removed in Group.toPvjson(), being replaced with
        // "isPartOf":GraphIdvalue
        //
        // Some GPML files have a GroupRef attribute referencing a GroupId for a non-existent
        // Group element. The "gpml:GroupRef":GroupId properties resulting from such GroupRef
        // attributes need to be removed below, because Group.toPvjson will not run for these
        // elements.
        //
        // Remove all remaining gpml:GroupRef properties.
        _(pvjson.elements).filter(function(element) {
          return element.hasOwnProperty('gpml:GroupRef');
        })
        .map(function(element) {
          delete element['gpml:GroupRef'];
          return element;
        });

        var edges = _(pvjson.elements).filter(function(element) {
          // TODO figure out why this seems to run more times than it should.
          // It might have something to do with using highland.scan() and passing the anchor through.
          // The check for gpml:Point is a hack so we don't get an error for not having it
          // because we've already deleted it when it runs more than once for the same edge.
          return (element['gpml:element'] === 'gpml:Interaction' || element['gpml:element'] === 'gpml:GraphicalLine') && element.hasOwnProperty('gpml:Point');
        })
        .map(function(edge) {
          edge = Point.toPvjson({
            pvjson: pvjson
            , pvjsonElement: edge
          });

          delete edge['gpml:Point'];
          return edge;
        });

        _(edges).filter(function(element) {
          return element['gpml:element'] === 'gpml:Interaction';
        })
        .map(function(edge) {
          edge = Interaction.toPvjson({
            pvjson: pvjson
            , pvjsonElement: edge
          });

          return edge;
        });

        if (!pathwayIri) {
          pathwayIri = encodeURI('http://wikipathways.org/index.php/Special:SearchPathways?query=' + pvjson.standardName + '&species=' + pvjson.organism + '&doSearch=1');
        }
        var localContext = {};
        localContext['@base'] = pathwayIri + '/';
        pvjson['@context'].push(localContext);

        delete pvjson['gpml:element'];

        return pvjson;
      })
      .map(function(element) {
        var pvjsonAsString = JSON.stringify(pvjson);
        return pvjsonAsString;
      });
      //*/
    }
  ));
};

module.exports = StreamGpmlToPvjson;
