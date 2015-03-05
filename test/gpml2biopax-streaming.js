var _ = require('lodash');
var Gpml2PvjsonConverter = require('../lib/index');
var highland = require('highland');
var jsonld = require('jsonld');
var pd = require('pretty-data').pd;
var request = require('request');

var pathwayMetadata = {};
pathwayMetadata.dbName = 'wikipathways';
pathwayMetadata.identifier = 'WP525';
pathwayMetadata.version = '74871';

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
      console.log('err');
      console.log(err);
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
  .each(function(result) {
    function convertToBiopaxjson(pvjson) {
      var biopaxJson = {};
      var biopaxJsonContext = biopaxJson['@context'] = pvjson['@context'];
          /*
          pvjson['@context'].filter(function(context) {
            return _.isPlainObject(context) ||
                context.indexOf('organism.jsonld') === -1;
          });
          //*/
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
        '@type': 'owl:Ontology',
        'owl:imports': {
          '@id': 'biopax:'
        }
      };

      biopaxJson['@graph'].push(owlElement);

      var pathway = {};
      pathway.id = pvjson.id;
      pathway.idVersion = pvjson.version;
      pathway.type = 'Pathway';
      if (!!pvjson.xrefs) {
        // TODO kludge. refactor.
        pathway.xrefs = pvjson.xrefs[0];
        //delete pathway.xrefs;
      }
      if (!!pvjson.standardName) {
        pathway.name = pvjson.standardName;
      }
      if (!!pvjson.displayName) {
        delete pathway.displayName;
      }
      if (!!pvjson.organism) {
        pathway.organism = pvjson.organism;
      }

      var biopaxElements = [
        'PublicationXref',
        'UnificationXref',
        'RelationshipXref',
        'ProteinReference',
        'ProteinReference',
        'Dna',
        'DnaReference',
        'Rna',
        'SmallMolecule',
        'SmallMoleculeReference',
        'Gene',
        'GeneReference',
        'PhysicalEntity',
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

      var pathwayComponent = [];
      pvjson.elements.forEach(function(entity) {
        if (!!entity.type) {
          var type = entity.type;
          if (!_.isArray(type)) {
            type = [type];
          }
          var intersectionBetweenTypesAndBiopaxElements = _.intersection(
            type, biopaxElements);
          if (intersectionBetweenTypesAndBiopaxElements.length > 0) {
            entity.type = intersectionBetweenTypesAndBiopaxElements[0];

            if (!!entity.xrefs) {
              // TODO kludge. refactor.
              entity.xrefs = entity.xrefs[0];
              //delete entity.xrefs;
            }

            delete entity.backgroundColor;
            delete entity.borderWidth;
            delete entity.color;
            delete entity.displayId;
            delete entity.fillOpacity;
            delete entity.fontSize;
            delete entity.fontWeight;
            delete entity['gpml:element'];
            delete entity['gpml:Type'];
            delete entity.height;
            delete entity.isPartOf;
            delete entity.padding;
            delete entity.rotation;
            delete entity.shape;
            delete entity.strokeDasharray;
            delete entity.textAlign;
            delete entity.verticalAlign;
            delete entity.width;
            delete entity.x;
            delete entity.y;
            delete entity.zIndex;
            delete entity.points;
            delete entity.markerStart;
            delete entity.markerEnd;
            if (!!entity.contains) {
              var containedElements = entity.contains;
              delete entity.contains
              if (!_.isArray(containedElements)) {
                containedElements = [containedElements];
              }
              entity.component = containedElements
                .map(function(containedElement) {
                  return {
                    id: containedElement.id
                  };
                });
            }
            biopaxJson['@graph'].push(entity);
          }
          var intersectionBetweenTypesAndBiopaxEdgeTypes = _.intersection(
              type, biopaxEdgeTypes);
          if (intersectionBetweenTypesAndBiopaxEdgeTypes.length > 0) {
            pathwayComponent.push(entity.id);
          }
        }
      });
      pathway.pathwayComponent = pathwayComponent;
      biopaxJson['@graph'].push(pathway);

      biopaxJson['@graph'].filter(function(entity) {
        return !!entity.type;
      })
      .map(function(entity) {
        entity.type = _.isArray(entity.type) ?
            entity.type : [entity.type];
        return entity;
      })
      .filter(function(entity) {
        return entity.type.indexOf('PublicationXref') > -1;
      })
      .forEach(function(entity) {
        // TODO update the generation of these in the gpml2pvjson converter
        // so that we get this data.
        entity.dbName = 'Unknown';
        entity.dbId = 'Unknown';
        delete entity.displayName;
        console.log('PublicationXref entity');
        console.log(entity);
      });

      var referenceTypes = [
        'ProteinReference',
        'SmallMoleculeReference',
        'DnaReference',
        'RnaReference',
        'GeneReference'
      ];

      var gpmlDataNodeTypeToBiopaxEntityTypeMappings = {
        'gpml:Metabolite':'SmallMolecule',
        'gpml:GeneProduct':'Dna',
        // TODO is this wrong? Biopax documentation says, "A physical entity in BioPAX never represents a specific molecular instance."
        'gpml:Unknown':'PhysicalEntity',
      };

      biopaxJson['@graph'].filter(function(entity) {
        return !!entity.type;
      })
      .map(function(entity) {
        entity.type = _.isArray(entity.type) ?
            entity.type : [entity.type];
        return entity;
      })
      .filter(function(entity) {
        var matchingReferenceTypes = _.intersection(
            entity.type, _.keys(gpmlDataNodeTypeToBiopaxEntityTypeMappings));
        return matchingReferenceTypes.length > 0;
      })
      .forEach(function(entity) {
        entity.type = gpmlDataNodeTypeToBiopaxEntityTypeMappings[entity.type];
      });

      var references = biopaxJson['@graph'].filter(function(entity) {
        return !!entity.type;
      })
      .map(function(entity) {
        entity.type = _.isArray(entity.type) ?
            entity.type : [entity.type];
        return entity;
      })
      .filter(function(entity) {
        var matchingReferenceTypes = _.intersection(
            entity.type, referenceTypes);
        return matchingReferenceTypes.length > 0;
      });

      references.forEach(function(entity) {
        entity.organism = pathway.organism;
      });

      var unificationXrefs = references.map(function(entity) {
        var iri = entity.id;
        var iriComponents = iri.split('identifiers.org');
        var iriPath = iriComponents[iriComponents.length - 1];
        var iriPathComponents = iriPath.split('/');
        var preferredPrefix = iriPathComponents[1];
        var identifier = iriPathComponents[2];
        return {
          id: entity.xrefs,
          type: 'UnificationXref',
          dbId: identifier,
          dbName: preferredPrefix
        };
      });

      var bioSourceUnificationXref = {
        // TODO generate an actual UUID
        '@id': 'vn3w8uew8bgv38b4gvniawu4iubg3y4bt3',
        '@type': 'biopax:UnificationXref',
        'dbId': '9606',
        'dbName': 'taxonomy'
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
        '@id': organismNameToIriMappings[pathway.organism],
        '@type': 'biopax:BioSource',
        'xref': 'vn3w8uew8bgv38b4gvniawu4iubg3y4bt3',
        'biopax:standardName': {
          '@value': pathway.organism,
          '@type': 'xsd:string'
        }
      };
      biopaxJson['@graph'].push(bioSource);

      biopaxJson['@graph'] = biopaxJson['@graph'].concat(unificationXrefs);

      console.log('unificationXrefs');
      console.log(unificationXrefs);

      //*
      console.log('BioPAX in compacted JSON-LD format');
      console.log(JSON.stringify(biopaxJson));
      //console.log(JSON.stringify(biopaxJson, null, '  '));
      //*/

      /*
      jsonld.expand(biopaxJson, function(err, expanded) {
        if (err) {
          throw err;
        }
        console.log('BioPAX in expanded JSON-LD format');
        console.log(JSON.stringify(expanded));
        //console.log(JSON.stringify(expanded, null, '  '));
      });
      //*/

      /*
      jsonld.toRDF(biopaxJson,
          {format: 'application/nquads'},
          function(err, biopaxNquads) {
            console.log('BioPAX in N-QUADS RDF format');
            console.log(biopaxNquads);
            console.log(err);
          });
      //*/
    };

    convertToBiopaxjson(result);

  });

/*
Gpml2PvjsonConverter.toBiopaxjson($, pathwayMetadata, function(err, biopaxjson) {
  var biopaxjsonString = JSON.stringify(biopaxjson);
  var prettyBiopaxjson = pd.json(biopaxjsonString);
  console.log('prettyBiopaxjson');
  console.log(prettyBiopaxjson);
});
//*/
