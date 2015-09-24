require('pretty-error').start(); // to make errors more readable
var _ = require('lodash');
var AdmZip = require('adm-zip');
var biopaxValidator = require('./biopax-validator.js');
var Gpml2PvjsonConverter = require('../lib/index');
var fs = require('fs');
var highland = require('highland');
var jsonld = require('jsonld');
//var curatedPathwaysMetadata = require('./pathways-to-test.json');
var path = require('path');
var pd = require('pretty-data').pd;
// NOTE: using this fork, because we need to use xmldom, not jsdom:
// https://github.com/ckristo/rdflib.js/tree/xmldom
var $rdf = require('../node_modules/rdflib.js-xmldom/dist/rdflib.js');
var request = require('request');
var Rx = require('rx');
var RxNode = require('rx-node');
var strcase = require('tower-strcase');
var utils = require('../lib/utils.js');
var uuid = require('uuid');
var VError = require('verror');

var filename = 'test/gpml2biopaxrdfxml-streaming.js';

var dereferenceElement = utils.dereferenceElement;

var biopaxEdgeTypes = utils.biopax.edgeTypes;
var biopaxNodeTypes = utils.biopax.nodeTypes;
var biopaxTypes = utils.biopax.allTypes;
var gpmlDataNodeTypeToBiopaxEntityTypeMappings =
    utils.gpmlDataNodeTypeToBiopaxEntityTypeMappings;

//*
// SETTINGS
var defaultConsole = console;
var muteConsole = true;

var organism = 'Homo sapiens';
//var organism = 'Mus musculus';

var subtestMode = !true;
var overwrite = !true;
var iteration = 0;

var samplePathwaysToTest;
if (subtestMode) {
  organism = 'Homo sapiens';
  samplePathwaysToTest = [{
    db: 'wikipathways',
    identifier: 'WP100',
    version: '0',
    organism: organism
  }, {
    db: 'wikipathways',
    identifier: 'WP106',
    version: '0',
    organism: organism
  }];
}

var organismParamCase = strcase.paramCase(organism);
var organismUpperSnakeCase = organism.replace(' ', '_');

var testDirectoryPath = __dirname;
var biopaxBasePath;
var gpmlSourcePath;
var owlSourcePath;

if (iteration === 0) {
  gpmlSourcePath = path.join(testDirectoryPath, 'input/wikipathways_' +
    organismUpperSnakeCase + '_Curation-AnalysisCollection__gpml');

  var biopaxBasePath = path.join(testDirectoryPath, 'biopax');

  owlSourcePath = path.join(
    biopaxBasePath, 'source-all', organismParamCase, 'owl', 'iteration' + iteration.toString());
}
// END SETTINGS
//*/

function createFromEvent(event, stream) {
  return Rx.Observable.fromEventPattern(
      function addHandler(h) {
        stream.on(event, h);
      });
}

// this works, but it requires munging "SBO:" to "SBO". output is rdf/xml
function gpml2biopax(pathwayMetadata) {

  // For quick access to those namespaces:
  var FOAF = $rdf.Namespace('http://xmlns.com/foaf/0.1/');
  var RDF = $rdf.Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
  var RDFS = $rdf.Namespace('http://www.w3.org/2000/01/rdf-schema#');
  var OWL = $rdf.Namespace('http://www.w3.org/2002/07/owl#');
  var DC = $rdf.Namespace('http://purl.org/dc/elements/1.1/');
  var RSS = $rdf.Namespace('http://purl.org/rss/1.0/');
  var XSD = $rdf.Namespace('http://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dt-');

  var referenceTypes = [
    'ProteinReference',
    'SmallMoleculeReference',
    'DnaReference',
    'RnaReference',
    'GeneReference'
  ];

  function dereferenceElement(elements, id) {
    return _.find(elements, function(element) {
      return element.id === id;
    });
  }

  function duplicateElement(elements, id) {
    var originalElement = dereferenceElement(elements, id);
    var newElement = _.clone(originalElement);
    var newId = uuid.v4();
    newElement.id = newId;
    elements.push(newElement);
    return newElement;
  }

  function convertFromN3ToRdfXml(input, callback) {
    // - create an empty store
    var kb = new $rdf.IndexedFormula();

    // NOTE: to get rdflib.js' RDF/XML parser to work with node.js,
    // see https://github.com/linkeddata/rdflib.js/issues/47

    // - parse N3 file
    $rdf.parse(input, kb, 'http://schema.rdfs.org/all.nt', 'text/n3', function(err, kb) {
      if (err) {
        var err2 = new VError(err, 'failed to parse N3 in "%s"', filename);
        return callback(err2);
      }

      $rdf.serialize(undefined, kb, undefined, 'application/rdf+xml', function(err, str) {
        if (err) {
          var err2 = new VError(err, 'failed to serialize N3 in "%s"', filename);
          return callback(err2);
        }
        return callback(null, str);
      });
    });
  }

  var jsonldOutputPath = './gpml2pvjson-v2-output/' + pathwayMetadata.identifier + '.json';
  var jsonldOutput = fs.createWriteStream(jsonldOutputPath);

  return Rx.Observable.return(pathwayMetadata)
    .flatMap(function(pathway) {
      var identifier = pathway.identifier;
      var version = pathway.version || 0;

      /*
      var gpmlLocation = 'http://www.wikipathways.org/wpi/wpi.php' +
          '?action=downloadFile&type=gpml&pwTitle=Pathway:' +
          identifier + '&oldid=' + version;
      //*/
      var gpmlLocation = path.join(gpmlSourcePath, pathway.identifier + '.gpml');

      var gpmlChunkStream = highland(fs.createReadStream(gpmlLocation));

      if (muteConsole) {
        //console.log('Disabling console logging...');
        delete global.console;
        global.console = {};
        global.console.log = global.console.warn = global.console.error = function() {};
      }
      /*
      var gpmlChunkSource = RxNode.fromReadableStream(fs.createReadStream(gpmlLocation))
        .doOnError(
            function(err) {
              var err2 = new VError(err, 'failed to get GPML in "%s"', filename);
              console.error(err2.stack);
            }
        )
        .filter(function(gpmlChunk) {
          // don't return empty chunks
          return gpmlChunk;
        });
        //*/
        /*
        .map(function(data) {
          console.log('Disabling console logging...');
          delete global.console;
          global.console = {};
          global.console.log = global.console.warn = global.console.error = function() {};
          return data;
        });
        //*/
      return Gpml2PvjsonConverter.gpmlToPvjsonSource(gpmlChunkStream)
        .doOnError(
            function(err) {
              var err2 = new VError(err, 'error (after?) converting GPML to ' +
                                    'pvjson in "%s"', filename);
              console.error(err2.stack);
            }
        )
        //*
        .map(function(data) {
          if (muteConsole) {
            global.console = defaultConsole;
            //console.log('console logging re-enabled...');
          }
          return data;
        })
        //*/
        .map(function(data) {
          var pvjson = JSON.parse(data);

          var pathwayIri = !!identifier ?
              'http://identifiers.org/wikipathways/' +
              identifier : gpmlLocation;
          pvjson.id = pathwayIri;
          pvjson.version = version;

          pvjson['@context'].filter(function(contextElement) {
            return contextElement.hasOwnProperty('@base');
          })
          .map(function(baseElement) {
            baseElement['@base'] = pathwayIri + '/';
          });

          return pvjson;
        });
    })
    .doOnError(
        function(err) {
          var err2 = new VError(err, 'failed to convert GPML to pvjson in "%s"', filename);
          throw err2;
        }
    )
    //*
    .map(function(pvjson) {
      var jsonldString = JSON.stringify(pvjson, null, '  ');
      fs.writeFileSync(jsonldOutputPath, jsonldString, 'utf8');
      return pvjson;
    })
    //*/
    .map(function(pvjson) {
      pvjson.elements = pvjson.elements
        .filter(function(element) {
          return !!element.type;
        })
        .map(function(element) {
          var type = element.type;
          element.type = _.isArray(type) ? type : [type];
          return element;
        })
        .map(function(element) {
          var type = element.type;
          var intersection = _.intersection(type, biopaxTypes);
          element.type = intersection.length > 0 ? intersection[0] : element.type[0];
          return element;
        })
        .concat(pvjson.elements.filter(function(element) {
          return !element.type;
        }));
      return pvjson;
    })
    .map(function(pvjson) {
      pvjson.elements = pvjson.elements
        .filter(function(element) {
          return element.type === 'Pathway';
        })
        .map(function(element) {
          delete element.entityReference;
          return element;
        })
        .concat(pvjson.elements.filter(function(element) {
          return element.type !== 'Pathway';
        }));
      return pvjson;
    })
    .map(function(pvjson) {
      // gpml:Labels and gpml:Shapes are not really BioPAX
      // elements, but if they are attached to a BioPAX edge,
      // we'll include them as PhysicalEntities.

      var referencedIds = {};
      var elements = pvjson.elements;
      elements
        .filter(function(element) {
          return !_.isEmpty(element.controlled) && !_.isEmpty(element.controller);
        })
        .forEach(function(group) {
          referencedIds[group.controller] = true;
          referencedIds[group.controlled] = true;
        });

      elements
        .filter(function(element) {
          return element.participant;
        })
        .forEach(function(interaction) {
          interaction.participant.forEach(function(elementId) {
            referencedIds[elementId] = true;
          });
        });

      elements
        .filter(function(element) {
          return element.contains;
        })
        .forEach(function(group) {
          group.contains.forEach(function(elementId) {
            referencedIds[elementId] = true;
          });
        });

      pvjson.elements = pvjson.elements
        .filter(function(element) {
          return ['gpml:Label', 'gpml:Shape'].indexOf(element.type) > -1;
        })
        .filter(function(element) {
          return referencedIds[element.id];
        })
        .map(function(element) {
          element.type = 'PhysicalEntity';
          return element;
        })
        .concat(
          pvjson.elements
            .filter(function(element) {
              return ['gpml:Label', 'gpml:Shape'].indexOf(element.type) === -1;
            })
        );
      return pvjson;
    })

    // A Catalysis has properties controlled and controller
    //   controlled must reference a Conversion
    //   controller must reference a Pathway or PhysicalEntity
    //
    // A Conversion has properties left, right and conversionDirection
    //   conversionDirection is a string with one of these values:
    //     LEFT-TO-RIGHT, REVERSIBLE, RIGHT-TO-LEFT
    //   left must reference a PhysicalEntity
    //   right must reference a PhysicalEntity

    .map(function(pvjson) {
      pvjson.elements = pvjson.elements
        .map(function(element) {
          delete element.backgroundColor;
          delete element.borderWidth;
          delete element.color;
          delete element.displayId;
          delete element.fillOpacity;
          delete element.fontSize;
          delete element.fontWeight;
          delete element['gpml:element'];
          delete element['gpml:Type'];
          delete element.height;
          delete element.isPartOf;
          delete element.padding;
          delete element.rotation;
          delete element.shape;
          delete element.strokeDasharray;
          delete element.textAlign;
          delete element.verticalAlign;
          delete element.width;
          delete element.x;
          delete element.y;
          delete element.zIndex;
          delete element.points;
          delete element.markerStart;
          delete element.markerEnd;
          return element;
        });
      return pvjson;
    })
    .map(function(pvjson) {
      pvjson.elements = pvjson.elements
        .filter(function(element) {
          return !!element.contains;
        })
        .map(function(group) {
          group.contains = group.contains
            .map(function(elementId) {
              return dereferenceElement(pvjson.elements, elementId);
            })
            .filter(function(element) {
              return biopaxTypes.indexOf(element.type) > -1;
            })
            .map(function(element) {
              return element;
            });
          return group;
        })
        .concat(pvjson.elements.filter(function(element) {
          return !element.contains;
        }));
      return pvjson;
    })
    /*
    .map(function(pvjson) {
      pvjson.elements = pvjson.elements
        .filter(function(element) {
          return element.type === 'Control';
        })
        .map(function(element) {
          var genericInteraction = {};
          genericInteraction.participant = [
            element.controller,
            element.controlled
          ];
          genericInteraction.id = element.id;
          genericInteraction.type = 'Interaction';
          return genericInteraction;
        })
        .concat(pvjson.elements.filter(function(element) {
          return element.type !== 'Control';
        }));
      return pvjson;
    })
    //*/
    .map(function(pvjson) {
      pvjson.elements = pvjson.elements
        .filter(function(element) {
          return element.xref;
        })
        .map(function(element) {
          var xrefs = element.xref;
          xrefs = _.isArray(xrefs) ? xrefs : [xrefs];
          element.xref = xrefs
            .filter(function(xref) {
              return xref.indexOf('http') === 0;
            });
          return element;
        })
        .concat(
          pvjson.elements
            .filter(function(element) {
              return !element.xref;
            })
        );
      return pvjson;
    })
    /*
    .map(function(pvjson) {
      // I ran into trouble including more than one biopax:xref,
      // so I'm removing the mygene.info linkouts for now and
      // just including the first biopax:xref for any element,
      // which will, I hope, be the BridgeDb linkout.
      pvjson.elements = pvjson.elements
        .filter(function(element) {
          return !_.isArray(element.xref);
        })
        .concat(
          pvjson.elements
            .filter(function(element) {
              return _.isArray(element.xref);
            })
            .map(function(element) {
              element.xref = element.xref
                .filter(function(xref) {
                  return xref.indexOf('mygene') === -1;
                })[0];
              return element;
            })
        );
      return pvjson;
    })
    //*/
    .map(function(pvjson) {
      // biopax:xrefs are still giving us trouble with
      // the BioPAX validator. Not sure why.
      pvjson.elements = pvjson.elements
        .filter(function(element) {
          return element.type.indexOf('Reference') === -1;
        })
        .map(function(element) {
          delete element.xref;
          delete element.xref;
          return element;
        })
        .concat(
          pvjson.elements
            .filter(function(element) {
              return element.type.indexOf('Reference') > -1;
            })
        );
      return pvjson;
    })
    .map(function(pvjson) {
      pvjson.elements = pvjson.elements
        .filter(function(element) {
          return biopaxEdgeTypes.indexOf(element.type) > -1;
        })
        .map(function(element) {
          delete element.interactionType;
          return element;
        })
        .concat(
          pvjson.elements
            .filter(function(element) {
              return biopaxEdgeTypes.indexOf(element.type) === -1;
            })
        );
      return pvjson;
    })
    /*
    .map(function(pvjson) {
      // TODO: address the issue with xref vs. biopax:xref so
      // we don't start having both properties on the objects.
      pvjson.elements = pvjson.elements
        .filter(function(element) {
          return element.xref;
        })
        .map(function(element) {
          element['biopax:xref'] = element['biopax:xref'] || [];
          element['biopax:xref'] = element['biopax:xref']
            .concat(element.xref);
          delete element.xref;
          return element;
        })
        .concat(
          pvjson.elements
            .filter(function(element) {
              return !element.xref;
            })
        );
      return pvjson;
    })
    //*/
    .map(function(pvjson) {
      pvjson.elements
        .filter(function(element) {
          return element.type === 'GeneticInteraction';
        })
        .map(function(element) {
          element.participant
            .map(function(participantId) {
              return dereferenceElement(pvjson.elements, participantId);
            })
            .filter(function(participant) {
              return participant.type !== 'Gene';
            })
            .forEach(function(participant) {
              // TODO update things like controlled: oldElementId
              var oldElementId = participant.id;
              var newGene = duplicateElement(pvjson.elements, oldElementId);
              newGene.type = 'Gene';
              delete newGene.entityReference;

              var newGeneId = newGene.id;
              element.participant = element.participant.map(function(participantId) {
                return participantId !== oldElementId ? participantId : newGeneId;
              });
            });

          if (element.participant.length === 2) {
            var firstId = element.participant[0];
            var secondId = element.participant[1];
            if (firstId === secondId) {
              var newElement = duplicateElement(pvjson.elements, firstId);
              var newElementId = newElement.id;
              element.participant[1] = newElementId;
            }
          }
          return element;
        })
        .map(function(element) {
          var participants = element.participant;
          if (participants.length === 2) {
            var firstId = participants[0];
            var secondId = participants[1];
            if (firstId === secondId) {
              var newElement = duplicateElement(pvjson.elements, firstId);
              var newElementId = newElement.id;
              participants[1] = newElementId;
            }
          }
          return element;
        });

      return pvjson;
    })
    .map(function(result) {
      function convertToBiopaxjson(pvjson) {
        var biopaxJson = {};
        var biopaxJsonContext = biopaxJson['@context'] = pvjson['@context'];
        var lastContextElement;
        if (_.isArray(biopaxJsonContext)) {
          lastContextElement = biopaxJsonContext[biopaxJsonContext.length - 1];
        } else {
          lastContextElement = biopaxJsonContext;
        }

        biopaxJson['@context'].unshift(
            'https://wikipathwayscontexts.firebaseio.com/owlPrerequisites.json');

        lastContextElement.biopax =
            'http://www.biopax.org/release/biopax-level3.owl#';

        var base = lastContextElement['@base'];

        biopaxJson['@graph'] = [];

        var owlElement = {
          '@id': base,
          '@type': 'http://www.w3.org/2002/07/owl#Ontology',
          'http://www.w3.org/2002/07/owl#imports': {
            '@id': lastContextElement.biopax
          }
        };

        biopaxJson['@graph'].unshift(owlElement);

        var pathway = {};
        pathway.id = pvjson.id;
        pathway.type = 'Pathway';
        /* TODO can we not add PublicationXrefs for a Pathway?
        if (pvjson.xref) {
          // TODO kludge. refactor.
          pathway.xref = pvjson.xref[0];
          delete pvjson.xref;
        }
        //*/
        if (pvjson.standardName) {
          //pathway.name = pvjson.standardName;
          pathway['biopax:name'] = pvjson.standardName;
        }
        if (pvjson.displayName) {
          delete pathway.displayName;
        }

        pvjson.elements.filter(function(entity) {
          return !!entity.type;
        })
        .filter(function(entity) {
          return _.keys(gpmlDataNodeTypeToBiopaxEntityTypeMappings).indexOf(entity.type) > -1;
        })
        .forEach(function(entity) {
          entity.type = gpmlDataNodeTypeToBiopaxEntityTypeMappings[entity.type];
        });

        var pathwayComponent = [];
        pvjson.elements.forEach(function(entity) {
          if (entity.type) {
            var type = entity.type;
            if (biopaxTypes.indexOf(type) > -1) {
              if (entity.contains) {
                var containedElements = entity.contains;
                delete entity.contains;
                if (!_.isArray(containedElements)) {
                  containedElements = [containedElements];
                }
                if (entity.type === 'Pathway') {
                  entity.pathwayComponent = containedElements.filter(function(containedElement) {
                    return biopaxEdgeTypes.indexOf(containedElement.type) > -1;
                  })
                  .map(function(containedElement) {
                    return containedElement.id;
                  });
                } else if (entity.type === 'Complex') {
                  entity.component = containedElements.filter(function(containedElement) {
                    return biopaxEdgeTypes.indexOf(containedElement.type) === -1;
                  })
                  .map(function(containedElement) {
                    return {
                      id: containedElement.id
                    };
                  });
                }
              }
              biopaxJson['@graph'].push(entity);
            }

            if (biopaxEdgeTypes.indexOf(type) > -1) {
              pathwayComponent.push(entity.id);
            }
          }
        });
        pathway.pathwayComponent = pathwayComponent;
        biopaxJson['@graph'].push(pathway);

        biopaxJson['@graph'].filter(function(entity) {
          return !!entity.type;
        })
        .filter(function(entity) {
          return entity.type === 'PublicationXref';
        })
        .forEach(function(entity) {
          // TODO update the generation of these in the gpml2pvjson converter
          // so that we get this data.
          entity.db = 'Unknown';
          entity.identifier = 'Unknown';
          delete entity.displayName;
        });

        var references = biopaxJson['@graph']
          .filter(function(entity) {
            return !!entity.type;
          })
          .filter(function(entity) {
            return referenceTypes.indexOf(entity.type) > -1;
          });

        var unificationXrefs = references.map(function(entity) {
          var xrefs = entity.xref;

          if (_.isArray(xrefs)) {
            xrefs = _.compact(xrefs);
          }

          if (_.isEmpty(xrefs)) {
            xrefs = 'http://example.org/' + uuid.v4();
          }

          xrefs = _.isArray(xrefs) ? xrefs : [xrefs];
          entity.xref = xrefs;
          return xrefs.map(function(xref) {
            var pvjsonUnificationXref = {};
            pvjsonUnificationXref.id = xref;
            pvjsonUnificationXref.type = 'UnificationXref';

            var iri = entity.id;
            if (iri.indexOf('identifiers.org') > -1) {
              var iriComponents = iri.split('identifiers.org');
              var iriPath = iriComponents[iriComponents.length - 1];
              var iriPathComponents = iriPath.split('/');
              pvjsonUnificationXref.db = iriPathComponents[1];
              pvjsonUnificationXref.identifier = iriPathComponents[2];
            } else {
              // Current tooling messes up when I use rdf:ID
              //pvjsonUnificationXref['http://www.w3.org/1999/02/22-rdf-syntax-ns#ID'] =
              //  pvjsonUnificationXrefId;
              pvjsonUnificationXref.db = 'Unknown';
              pvjsonUnificationXref.identifier = 'Unknown';
            }
            return pvjsonUnificationXref;
          });
        });

        // TODO this is kludgy. Can we set up the JSON-LD contexts
        // such that we don't need this to specify the IRI for
        // the @id in the BioSource?
        var organismNameToIriMappings = {
          'Anopheles gambiae': 'http://identifiers.org/taxonomy/7165',
          'Arabidopsis thaliana': 'http://identifiers.org/taxonomy/3702',
          'Bacillus subtilis': 'http://identifiers.org/taxonomy/1423',
          'Bos taurus': 'http://identifiers.org/taxonomy/9913',
          'Caenorhabditis elegans': 'http://identifiers.org/taxonomy/6239',
          'Canis familiaris': 'http://identifiers.org/taxonomy/9615',
          'Danio rerio': 'http://identifiers.org/taxonomy/7955',
          'Drosophila melanogaster': 'http://identifiers.org/taxonomy/7227',
          'Escherichia coli': 'http://identifiers.org/taxonomy/562',
          'Equus caballus': 'http://identifiers.org/taxonomy/9796',
          'Gallus gallus': 'http://identifiers.org/taxonomy/9031',
          'Gibberella zeae': 'http://identifiers.org/taxonomy/5518',
          'Homo sapiens': 'http://identifiers.org/taxonomy/9606',
          'Hordeum vulgare': 'http://identifiers.org/taxonomy/4513',
          'Mus musculus': 'http://identifiers.org/taxonomy/10090',
          'Mycobacterium tuberculosis': 'http://identifiers.org/taxonomy/1773',
          'Oryza sativa': 'http://identifiers.org/taxonomy/4530',
          'Pan troglodytes': 'http://identifiers.org/taxonomy/9598',
          'Rattus norvegicus': 'http://identifiers.org/taxonomy/10116',
          'Saccharomyces cerevisiae': 'http://identifiers.org/taxonomy/4932',
          'Solanum lycopersicum': 'http://identifiers.org/taxonomy/4081',
          'Sus scrofa': 'http://identifiers.org/taxonomy/9823',
          'Zea mays': 'http://identifiers.org/taxonomy/4577'
        };

        var organismIri = organismNameToIriMappings[pvjson.organism];

        var bioSourceUnificationXrefId = 'http://example.org/' + uuid.v4();
        var bioSourceUnificationXref = {
          '@id': bioSourceUnificationXrefId,
          '@type': 'biopax:UnificationXref',
          'identifier': organismIri.split('http://identifiers.org/taxonomy/')[1],
          'db': 'taxonomy'
        };
        biopaxJson['@graph'].push(bioSourceUnificationXref);

        var bioSource = {
          '@id': organismIri,
          '@type': 'biopax:BioSource',
          'xref': bioSourceUnificationXrefId,
          'biopax:standardName': {
            '@value': pvjson.organism,
            '@type': 'xsd:string'
          }
        };
        biopaxJson['@graph'].push(bioSource);

        pathway.organism = organismIri;

        biopaxJson['@graph'] = biopaxJson['@graph'].concat(unificationXrefs);

        return biopaxJson;
      }

      return convertToBiopaxjson(result);
    })
    .flatMap(function(biopaxJson) {
      return Rx.Observable.fromNodeCallback(function(callback) {
        jsonld.expand(biopaxJson,
          function(err, expandedBiopaxJson) {
            if (err) {
              var err2 = new VError(err, 'failed to expand JSON-LD in "%s"', filename);
              throw err2;
            }
            return callback(null, expandedBiopaxJson);
          });
      })();
    })
    .flatMap(function(expandedBiopaxJson) {
      return Rx.Observable.fromNodeCallback(function(callback) {
        jsonld.toRDF(expandedBiopaxJson, {format: 'application/nquads'},
          function(err, biopaxNquads) {
            if (err) {
              var err2 = new VError(err, 'failed to convert JSON-LD to N-Quads in "%s"', filename);
              throw err2;
            }
            return callback(null, biopaxNquads);
          });
      })();
    })
    .flatMap(function(biopaxN3) {
      var cleaned = biopaxN3.replace(/SBO:/g, '')
        .replace(/http:\/\/rdaregistry.info\/Elements\/u\/P60052/g,
                 'http://www.biopax.org/release/biopax-level3.owl#id');
      return Rx.Observable.fromNodeCallback(function(callback) {
        convertFromN3ToRdfXml(cleaned, function(err, biopaxRdfXml) {
          if (err) {
            var err2 = new VError(err, 'failed to convert N-Quads to RDF/XML in "%s"', filename);
            throw err2;
          }
          return callback(null, biopaxRdfXml);
        });
      })();
    })
    .map(function(biopaxRdfXml) {
      var xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
      return xmlHeader + '\n' + biopaxRdfXml;
    });
}

/*****************************
 * Source data
 ****************************/

var pathwaysToTestSource;

var gpmlSource;
var dirStats;
try {
  dirStats = fs.statSync(gpmlSourcePath);
} catch (err) {
  dirStats = false;
}

var availableIdentifierSource;
if (!overwrite && dirStats && dirStats.nlink > 5) {
  // Use pre-downloaded pathway set
  availableIdentifierSource = Rx.Observable.fromNodeCallback(fs.readdir)(gpmlSourcePath)
    .map(function(filenameList) {
      return Rx.Observable.fromArray(filenameList);
    })
    .mergeAll()
    .filter(function(identifier) {
      return identifier.match(/\.gpml$/);
    })
    .map(function(path) {
      var identifier = path.match(/WP\d+/)[0];
      return identifier;
    });
} else {
  // Download pathway set, unzip, rename and save files, return identifiers
  var tmpZipFilePath = './tmp-zip-file-for-download.zip';
  var bulkDownloadUrl = 'http://www.wikipathways.org//wpi/batchDownload.php?species=' +
    organism + '&fileType=gpml&tag=Curation:AnalysisCollection';
  var requestSource = RxNode.fromReadableStream(request(bulkDownloadUrl));

  var writeStream = fs.createWriteStream(tmpZipFilePath);
  var req = request(bulkDownloadUrl);
  availableIdentifierSource = createFromEvent('finish', req.pipe(writeStream))
    // we just need the first "finish" event here, because it's the only one,
    // but the request stream doesn't appear to end on its own for some reason.
    .first()
    .flatMap(function() {
      var zip = new AdmZip(tmpZipFilePath);
      return Rx.Observable.fromArray(zip.getEntries())
        .flatMap(function(zipEntry) {
          var entryName = zipEntry.entryName;
          var identifier = entryName.match(/WP\d+/)[0];
          var gpmlString = zip.readAsText(entryName);
          return Rx.Observable.fromNodeCallback(fs.writeFile)(
            path.join(gpmlSourcePath, identifier + '.gpml'),
            gpmlString,
            'utf8'
          )
            .map(function() {
              return identifier;
            });
        });
    });

}

// regardless of whether pathways come from online or local files,
// we generate the metadata for them.
var pathwaysToTestSource = availableIdentifierSource
  .map(function(identifier) {
    var metadata = {
      db: 'wikipathways',
      identifier: identifier,
      version: '0',
      organism: organism
    };
    return metadata;
  })
  .filter(function(metadata) {
    return !subtestMode || samplePathwaysToTest
      .map(function(metadata) {
        return metadata.identifier;
      }).indexOf(metadata.identifier) > -1;
  })
  .toArray();

// If "overwrite" is not activated, we want to avoid running the
// converter for pathways that have already been converted
var pathwaysCompletedSource = Rx.Observable.fromNodeCallback(fs.readdir)(
    owlSourcePath)
  .defaultIfEmpty([null])
  .map(function(filenameList) {
    return Rx.Observable.fromArray(filenameList);
  })
  .mergeAll()
  .map(function(filename) {
    return filename.replace('.owl', '');
  })
  .toArray();

var pathwayMetadataSource = Rx.Observable.zip(
      pathwaysToTestSource,
      pathwaysCompletedSource,
      function(pathwaysToTest, pathwaysCompleted) {
        return [pathwaysToTest, pathwaysCompleted];
      }
  )
  .map(function(result) {
    var pathwaysToTest = result[0];
    var pathwaysCompleted = result[1];
    return pathwaysToTest.filter(function(metadata) {
      return overwrite ||
          pathwaysCompleted.indexOf(metadata.identifier) === -1;
    });
  })
  .map(function(metadataList) {
    return Rx.Observable.fromArray(metadataList);
  })
  .mergeAll()
  .map(function(metadata) {
    metadata.version = 0;
    return metadata;
  })
  .map(function(metadata) {
    var outputPath = path.join(owlSourcePath, metadata.identifier + '.owl');
    metadata.outputPath = outputPath;
    return metadata;
  })
  .filter(function(metadata) {
    // just mouse and human pathways for now
    return ['Mus musculus', 'Homo sapiens'].indexOf(metadata.organism) > -1;
  })
  /*
  .filter(function(metadata) {
    // there's a problem with converting these - not sure what.
    return [
      'WP1914',
      'WP1970',
      'WP2000',
      'WP2218',
      'WP2245',
      'WP2381',
      'WP2535',
      'WP2594'
    ].indexOf(metadata.identifier) === -1;
  })
  //*/
  .doOnError(
      function(err) {
        var err2 = new VError(err, 'failed to get metadata in "%s"', filename);
        throw err2;
      }
  )
  /*
  .retryWhen(function(attempts) {
    return Rx.Observable.range(1, 3)
      .map(function(i) {
        return i * 3;
      })
      .zip(attempts, function(i) {
        return i;
      })
      .flatMap(function(i) {
        console.log('996delay retry by ' + i + ' second(s)');
        return Rx.Observable.timer(i * 1000);
      });
  })
  //*/
  .controlled();

var biopaxSource = pathwayMetadataSource
  .flatMap(function(metadata) {
    var identifier = metadata.identifier;
    console.log('Processing ' + identifier + '...');
    return gpml2biopax(metadata)
      .doOnError(
          function(err) {
            var err2 = new VError(err, 'error (after?) converting GPML to BioPAX for ' +
                                  identifier + ' in "%s"', filename);
            throw err2;
          }
      )
      //*
      .retryWhen(function(attempts) {
        return Rx.Observable.range(1, 3)
          .map(function(i) {
            return i * 3;
          })
          .zip(attempts, function(i) {
            return i;
          })
          .flatMap(function(i) {
            console.log('1023delay retry by ' + i + ' second(s)');
            return Rx.Observable.timer(i * 1000);
          });
      })
      //*/
      .doOnNext(
          function(s) {
            pathwayMetadataSource.request(1);
          }
      )
      .filter(function(biopaxRdfXml) {
        return biopaxRdfXml;
      })
      .map(function(biopaxRdfXml) {
        return {
          biopaxRdfXml: biopaxRdfXml,
          metadata: metadata
        };
      });
  })
  .doOnError(
      function(err) {
        var err2 = new VError(err, 'failed to convert GPML to BioPAX ' +
                              'in "%s"', filename);
        throw err2;
      }
  );

biopaxSource
  .doOnNext(function(biopaxResponse) {
    var biopaxRdfXml = biopaxResponse.biopaxRdfXml;
    var metadata = biopaxResponse.metadata;
    return Rx.Observable.fromNodeCallback(fs.writeFile)(
        metadata.outputPath, biopaxRdfXml, 'utf8')
      .subscribeOnNext();
  })
  .flatMap(function(biopaxResponse) {
    var biopaxRdfXml = biopaxResponse.biopaxRdfXml;
    var metadata = biopaxResponse.metadata;
    /*
    if (subtestMode) {
      // When using the code below, we might get an error,
      // possibly from from changing the CWD
      return biopaxValidator.validateWithClient({
        autoFix: true,
        identifier: metadata.identifier,
        organism: organism,
        iteration: iteration
      });
    }
    //*/
    return Rx.Observable.empty();
  })
  .toArray()
  .flatMap(function(data) {
    //*
    if (!subtestMode) {
      return biopaxValidator.validateWithLocalJar({
        autoFix: true,
        iteration: iteration,
        organism: organism
      });
    } else {
      return Rx.Observable.empty();
    }
    //*/
    return Rx.Observable.empty();
  })
  .subscribe(function() {
    console.log('Iteration Completed...');
  }, function(err) {
    var err2 = new VError(err, 'Error in biopaxSource Observable in "%s"', filename);
    throw err2;
  }, function() {
    console.log('Done');
  });

pathwayMetadataSource.request(1);
