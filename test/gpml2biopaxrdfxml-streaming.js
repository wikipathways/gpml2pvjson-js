// this works, but it requires munging "SBO:" to "SBO". output is rdf/xml

var _ = require('lodash');
var Gpml2PvjsonConverter = require('../lib/index');
var fs = require('fs');
var highland = require('highland');
var jsonld = require('jsonld');
var pd = require('pretty-data').pd;
// NOTE: using this fork, because we need to use xmldom, not jsdom:
// https://github.com/ckristo/rdflib.js/tree/xmldom
var $rdf = require('../node_modules/rdflib.js-xmldom/dist/rdflib.js');
var request = require('request');
var uuid = require('uuid');

// For quick access to those namespaces:
var FOAF = $rdf.Namespace('http://xmlns.com/foaf/0.1/');
var RDF = $rdf.Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
var RDFS = $rdf.Namespace('http://www.w3.org/2000/01/rdf-schema#');
var OWL = $rdf.Namespace('http://www.w3.org/2002/07/owl#');
var DC = $rdf.Namespace('http://purl.org/dc/elements/1.1/');
var RSS = $rdf.Namespace('http://purl.org/rss/1.0/');
var XSD = $rdf.Namespace('http://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dt-');

var pathwayMetadata = {};
pathwayMetadata.db = 'wikipathways';
pathwayMetadata.identifier = 'WP525';
pathwayMetadata.version = '78459';

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
      throw err;
    }

    $rdf.serialize(undefined, kb, undefined, 'application/rdf+xml', function(err, str) {
      return callback(err, str);
    });
  });
}

var biopaxNodeTypes = [
  'PublicationXref',
  'UnificationXref',
  'RelationshipXref',
  'Protein',
  'ProteinReference',
  'Dna',
  'DnaReference',
  'Rna',
  'RnaReference',
  'SmallMolecule',
  'SmallMoleculeReference',
  'Gene',
  'GeneReference',
  'PhysicalEntity'
];

var biopaxEdgeTypes = [
  'Interaction',
  'Control',
  'TemplateReactionRegulation',
  'Catalysis',
  'Modulation',
  'Conversion',
  'BiochemicalReaction',
  'TransportWithBiochemicalReaction',
  'ComplexAssembly',
  'Degradation',
  'Transport',
  'TransportWithBiochemicalReaction',
  'GeneticInteraction',
  'MolecularInteraction',
  'TemplateReaction'
];

var biopaxElements = biopaxNodeTypes.concat(biopaxEdgeTypes);

var outputPath = pathwayMetadata.identifier + 'v' + pathwayMetadata.version + '.owl';
var output = fs.createWriteStream(outputPath);

highland([pathwayMetadata])
  .flatMap(function(pathway) {
    var identifier = pathway.identifier;
    var version = pathway.version || 0;

    var source = 'http://www.wikipathways.org/wpi/wpi.php' +
        '?action=downloadFile&type=gpml&pwTitle=Pathway:' +
        identifier + '&oldid=' + version;

    return highland(request(source))
    .map(function(gpmlChunk) {
      return gpmlChunk;
    })
    .errors(function(err, push) {
      // do nothing. this just filters out errors.
      console.log('err at ln. 80');
      console.error(err);
    })
    .pipe(highland.pipeline(
      Gpml2PvjsonConverter.streamGpmlToPvjson,
      function(s) {
        return s.map(function(data) {
          var pvjson = JSON.parse(data);

          var pathwayIri = !!identifier ?
              'http://identifiers.org/wikipathways/' +
              identifier : source;
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
      }
    ));
  })
  /*
  .map(function(pvjson) {
    console.log('pvjson');
    console.log(JSON.stringify(pvjson, null, '  '));
    return pvjson;
  })
  //*/
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
        return !!element.type;
      })
      .map(function(element) {
        var type = element.type;
        element.type = _.isArray(type) ? type : [type];
        return element;
      })
      .map(function(element) {
        var type = element.type;
        var intersection = _.intersection(type, biopaxElements);
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
        return !_.isArray(element['biopax:xref']);
      })
      .concat(
        pvjson.elements
          .filter(function(element) {
            return _.isArray(element['biopax:xref']);
          })
          .map(function(element) {
            element['biopax:xref'] = element['biopax:xref']
              .filter(function(xref) {
                return xref.indexOf('mygene') === -1;
              })[0];
            return element;
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
      .map(function(element) {
        delete element['biopax:xref'];
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
          '@id': 'biopax:'
        }
      };

      biopaxJson['@graph'].unshift(owlElement);

      var pathway = {};
      pathway.id = pvjson.id;
      pathway.type = 'Pathway';
      /* TODO can we not add PublicationXrefs for a Pathway?
      if (pvjson.xref) {
        // TODO kludge. refactor.
        pathway['biopax:xref'] = pvjson.xref[0];
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

      // Convert from GPML to BioPAX types
      var gpmlDataNodeTypeToBiopaxEntityTypeMappings = {
        'gpml:MetaboliteReference':'SmallMoleculeReference',
        'gpml:Metabolite':'SmallMolecule',
        'gpml:GeneProductReference':'DnaReference',
        'gpml:GeneProduct':'Dna',
        // TODO is this wrong? Biopax documentation says,
        // "A physical entity in BioPAX never represents a specific molecular instance."
        'gpml:Unknown':'PhysicalEntity',
      };

      pvjson.elements.filter(function(entity) {
        return !!entity.type;
      })
      .map(function(entity) {
        console.log('hey220' + entity.type);
        return entity;
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
          if (biopaxElements.indexOf(type) > -1) {
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
        console.log('PublicationXref');
        console.log(entity);
      });

      var referenceTypes = [
        'ProteinReference',
        'SmallMoleculeReference',
        'DnaReference',
        'RnaReference',
        'GeneReference'
      ];

      var references = biopaxJson['@graph']
        .filter(function(entity) {
          return !!entity.type;
        })
        .filter(function(entity) {
          return referenceTypes.indexOf(entity.type) > -1;
        });

      var unificationXrefs = references.map(function(entity) {
        var iri = entity.id;
        var iriComponents = iri.split('identifiers.org');
        var iriPath = iriComponents[iriComponents.length - 1];
        var iriPathComponents = iriPath.split('/');
        var preferredPrefix = iriPathComponents[1];
        var identifier = iriPathComponents[2];
        return {
          id: entity['biopax:xref'],
          type: 'UnificationXref',
          identifier: identifier,
          db: preferredPrefix
        };
      });

      var bioSourceUnificationXref = {
        // TODO generate an actual UUID
        '@id': 'vn3w8uew8bgv38b4gvniawu4iubg3y4bt3',
        '@type': 'biopax:UnificationXref',
        'identifier': '9606',
        'db': 'taxonomy'
      };
      biopaxJson['@graph'].push(bioSourceUnificationXref);

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

      var bioSource = {
        '@id': organismNameToIriMappings[pvjson.organism],
        '@type': 'biopax:BioSource',
        'xref': 'vn3w8uew8bgv38b4gvniawu4iubg3y4bt3',
        'biopax:standardName': {
          '@value': pvjson.organism,
          '@type': 'xsd:string'
        }
      };
      biopaxJson['@graph'].push(bioSource);

      biopaxJson['@graph'] = biopaxJson['@graph'].concat(unificationXrefs);

      return biopaxJson;
    }

    return convertToBiopaxjson(result);
  })
  .flatMap(function(biopaxJson) {
    console.log('biopaxJson');
    console.log(JSON.stringify(biopaxJson, null, '  '));
    return highland.wrapCallback(function(callback) {
      jsonld.toRDF(biopaxJson, {format: 'application/nquads'},
        function(err, biopaxNquads) {
          if (err) {
            throw err;
          }
          return callback(null, biopaxNquads);
        });
    })();
  })
  .flatMap(function(biopaxN3) {
    var cleaned = biopaxN3.replace(/SBO:/g, '')
      .replace(/http:\/\/rdaregistry.info\/Elements\/u\/P60052/g,
               'http://www.biopax.org/release/biopax-level3.owl#id');
    return highland.wrapCallback(function(callback) {
      convertFromN3ToRdfXml(cleaned, function(err, biopaxRdfXml) {
        if (err) {
          throw err;
        }
        return callback(null, biopaxRdfXml);
      });
    })();
  })
  .map(function(biopaxRdfXml) {
    return biopaxRdfXml;
  })
  .pipe(output);
