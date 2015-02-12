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
      biopaxJson['@context'] = pvjson['@context'];
      biopaxJson['@graph'] = [];

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
        pathway.standardName = pvjson.standardName;
      }
      if (!!pvjson.displayName) {
        pathway.displayName = pvjson.displayName;
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

      //*
      console.log('BioPAX in compacted JSON-LD format');
      console.log(JSON.stringify(biopaxJson, null, '  '));
      //*/

      //*
      jsonld.expand(biopaxJson, function(err, expanded) {
        console.log('BioPAX in expanded JSON-LD format');
        console.log(JSON.stringify(expanded, null, '  '));
      });
      //*/

      //*
      jsonld.toRDF(biopaxJson, {format: 'application/nquads'}, function(err, biopaxNquads) {
        console.log('BioPAX in N-QUADS RDF format');
        console.log(biopaxNquads);
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
