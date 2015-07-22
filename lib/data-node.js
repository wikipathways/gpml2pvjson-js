'use strict';

var _ = require('lodash');
var GpmlElement = require('./element.js');
var Graphics = require('./graphics.js');
var JsonldRx = require('jsonld-rx');
var Rx = require('rx');
var RxNode = require('rx-node');

var jsonldRx = new JsonldRx();

var dataNode = {};

// Use Biopax terms when available.
dataNode.entityTypeMappingsGpmlToNormalized = {
  'Metabolite': 'gpml:Metabolite',
  'Protein': 'biopax:Protein',
  'Rna': 'biopax:Rna',
  'Unknown': 'gpml:Unknown',
  'GeneProduct': 'gpml:GeneProduct',
  'Pathway': 'biopax:Pathway',
  'Complex': 'biopax:Complex'
};

dataNode.typeMappingsEntityToEntityReference = {
  'gpml:Metabolite': 'biopax:SmallMoleculeReference',
  'biopax:Protein': 'biopax:ProteinReference',
  'biopax:Rna': 'biopax:RnaReference',
  'gpml:Unknown': 'gpml:Unknown',
  'gpml:GeneProduct': 'gpml:GeneProduct',
  /* In BioPAX terms?
  'gpml:GeneProduct':[
    'biopax:DnaReference',
    'biopax:Gene',
    'biopax:RnaReference',
    'biopax:ProteinReference'
  ],
  //*/
  'gpml:Pathway': 'gpml:Pathway',
  'gpml:Complex': 'gpml:Complex'
};

var typeMappingsEntityReferenceToEntity = _.invert(
    dataNode.typeMappingsEntityToEntityReference);

/**
 * Generate an entityReference from the data available
 * in the GPML
 *
 * @return entityReference
 */
dataNode.generateEntityReference = function(displayName, bridgeDbDatasourceName,
    identifier, organism, entityType) {

  var entityReference = {};
  entityReference.displayName = displayName;
  entityReference.isDataItemIn = {};
  entityReference.bridgeDbDatasourceName = entityReference.isDataItemIn.bridgeDbDatasourceName =
      bridgeDbDatasourceName;
  entityReference.identifier = identifier;

  var entityReferenceTypeFromGpml =
      dataNode.typeMappingsEntityToEntityReference[entityType];
  if (entityReferenceTypeFromGpml) {
    entityReference.type = [entityReferenceTypeFromGpml];
  }
  return entityReference;
};

/**
 * Enrich an existing entityReference using bridgeDb
 *
 * @return
 */
dataNode.enrichEntityReference = function(bridgeDb, context, entityReference) {
  //entityReference['@context'] = context;
  return RxNode.fromReadableStream(bridgeDb.entityReference.enrich(entityReference, {
    organism: false
  }));
  /*
  .flatMap(function(item) {
    return jsonldRx.replaceContext(item, context);
  });
  //*/
};

dataNode.toPvjson = function(
    pvjson, gpmlSelection, dataNodeSelection, callback) {

  var generateEntityReference = dataNode.generateEntityReference;
  var organism = pvjson.organism;
  var pvjsonElements;
  var entity = {};
  // NOTE: when the DataNode is set to have a Type of "Unknown" in PathVisio-Java,
  // it is serialized into GPML with no Type attribute.
  var gpmlDataNodeType = dataNodeSelection.attr('Type') || 'Unknown';

  // Using Biopax classes, when possible, like biopax:Protein.
  // Otherwise, using gpml classes.
  var entityType = dataNode.entityTypeMappingsGpmlToNormalized[gpmlDataNodeType];
  if (entityType) {
    console.log('entityType');
    console.log(entityType);
    entity.type = entityType;
  }

  GpmlElement.toPvjson(
      pvjson, gpmlSelection, dataNodeSelection, entity, function(entity) {
    Graphics.toPvjson(
        pvjson, gpmlSelection, dataNodeSelection, entity, function(entity) {
      var dataSourceName;
      var identifier;
      var userSpecifiedXref;
      var xrefSelection = dataNodeSelection.find('Xref').eq(0);

      if (xrefSelection.length > 0) {
        dataSourceName = xrefSelection.attr('Database');
        if (!_.isEmpty(dataSourceName)) {
          entity.bridgeDbDatasourceName = dataSourceName;
        }
        identifier = xrefSelection.attr('ID');
        if (!_.isEmpty(identifier)) {
          entity.identifier = identifier;
        }
      }

      var bridgeDb = pvjson.bridgeDb;

      var entityReference = generateEntityReference(entity.textContent, dataSourceName,
          identifier, organism, entityType);

      var enrichEntityReference = dataNode.enrichEntityReference.bind(
          undefined,
          bridgeDb,
          pvjson['@context'],
          entityReference);

      function enrichEntityReferenceAndUpdateEntity() {
        return enrichEntityReference().map(function(enrichedEntityReference) {
          if (!enrichedEntityReference) {
            return enrichedEntityReference;
          }

          var enrichedEntityReferenceId = enrichedEntityReference.id;
          entityReference = entity.entityReference = enrichedEntityReferenceId;

          var enrichedEntityReferenceExists = pvjson.elements
          .filter(function(element) {
            return element.id === enrichedEntityReferenceId;
          }).length > 0;

          // Fill in type from bridgeDb if it's missing from GPML.
          if (!entityType && !_.isEmpty(entityReference.type)) {
            entityType = _.find(enrichedEntityReference.type,
                function(enrichedEntityReferenceType) {
                  return typeMappingsEntityReferenceToEntity[enrichedEntityReferenceType];
                });
            entity.type = entityType;
          }

          // TODO how should we best handle sub-pathway instances in a pathway?
          if (entityType === 'biopax:Pathway') {
            entity.organism = organism;
          }

          // "db" the official, standardized name, which may be different from
          // "bridgeDbDatasourceName", which is the name used in BridgeDb
          entity.db = enrichedEntityReference.isDataItemIn.name;
          entity.bridgeDbDatasourceName =
              enrichedEntityReference.isDataItemIn.bridgeDbDatasourceName;
          entity.identifier = enrichedEntityReference.identifier;

          if (!enrichedEntityReferenceExists) {
            pvjson.elements.push(enrichedEntityReference);
          }

          return enrichedEntityReference;
        })
        .toPromise();
      }

      /* Use it like this to get:
         var a = mypvjson.elements[20];
         a.getSetEntityReference().then(function(entityReference) {
           console.log('entityReference');
           console.log(entityReference);
         }, function(err) {
           console.log('err');
           console.log(err);
         });
         // and like this to set:
         a.getSetEntityReference({
            bridgeDbDatasourceName: 'Gramene Rice',
            identifier: 'LOC_OS01G14630a'
         }).then(function(entityReference) {
           console.log('entityReference');
           console.log(entityReference);
         }, function(err) {
           console.log('err');
           console.log(err);
         });
         // you can then get again with the updated data:
         a.getSetEntityReference().then(function(entityReference) {
           console.log('entityReference');
           console.log(entityReference);
         }, function(err) {
           console.log('err');
           console.log(err);
         });
      //*/
      entity.getSetEntityReference = function(updatedEntityReference) {
        if (!updatedEntityReference) {
          return enrichEntityReferenceAndUpdateEntity();
        }

        if (!updatedEntityReference.id) {
          var updatedDataset = updatedEntityReference.isDataItemIn;
          var updatedIdentifier = updatedEntityReference.identifier;
          if (!updatedDataset) {
            updatedEntityReference.isDataItemIn = entityReference.isDataItemIn;
          } else if (!updatedIdentifier) {
            updatedEntityReference.identifier = entityReference.identifier;
          }
        }

        enrichEntityReference = dataNode.enrichEntityReference.bind(
            undefined,
            bridgeDb,
            pvjson['@context'],
            updatedEntityReference);
        return enrichEntityReferenceAndUpdateEntity();
      };

      return callback(entity);
    });
  });
};

module.exports = dataNode;
