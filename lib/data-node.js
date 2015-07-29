'use strict';

var _ = require('lodash');
var GpmlElement = require('./element.js');
var Graphics = require('./graphics.js');
//var JsonldRx = require('jsonld-rx');
var Rx = require('rx');
var RxNode = require('rx-node');
var uuid = require('uuid');

//var jsonldRx = new JsonldRx();

var dataNode = {};

// Use Biopax terms when available.
dataNode.entityTypeMappingsGpmlToNormalized = {
  'Complex': 'biopax:Complex',
  'GeneProduct': 'gpml:GeneProduct',
  'Metabolite': 'gpml:Metabolite',
  'Pathway': 'biopax:Pathway',
  'Protein': 'biopax:Protein',
  'Rna': 'biopax:Rna',
  'Unknown': 'gpml:Unknown'
};

var entityTypeMappingsNormalizedToGpml = _.invert(
    dataNode.entityTypeMappingsGpmlToNormalized);

// TODO this is repeated elsewhere in the pvjs
// codebase (maybe kaavio-editor). DRY it up.
dataNode.typeMappingsEntityToEntityReference = {
  'biopax:Complex': 'biopax:Complex',
  'gpml:GeneProduct': 'gpml:GeneProduct',
  'gpml:Metabolite': 'biopax:SmallMoleculeReference',
  'biopax:Pathway': 'biopax:Pathway',
  'biopax:Protein': 'biopax:ProteinReference',
  'biopax:Rna': 'biopax:RnaReference',
  'gpml:Unknown': 'gpml:Unknown',
  /* In BioPAX terms?
  'gpml:GeneProduct':[
    'biopax:DnaReference',
    'biopax:Gene',
    'biopax:RnaReference',
    'biopax:ProteinReference'
  ],
  //*/
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

/* TODO make pvjsElement.entityReference be a function instead of a string. The code
// below is a start on this.
function EntityReference(entityReference) {
  if (!entityReference) {
    return this.id;
  }
  this.id = typeof entityReference === 'object' ? entityReference.id : entityReference;
}

EntityReference.prototype.toJSON = function() {
  return this.id;
}

EntityReference.prototype.get = function() {
  // The value from bridgedb as done currently by getSetEntityReference
  return expandedEntityReference;
}

var entityReference = new EntityReference('http://identifiers.org/hello');

var pvjsElement = {
  a: 1,
  entityReference: entityReference
};

JSON.stringify(pvjsElement);
//*/

/**
 * Enrich an existing entityReference using bridgeDb
 *
 * @return
 */
dataNode.enrichEntityReference = function(bridgeDb, context, entityReference, entity) {
  //entityReference['@context'] = context;

  var dataset = entityReference.isDataItemIn = entityReference.isDataItemIn || {};

  if (entity.type && !entityReference.type) {
    var entityReferenceType =
        [dataNode.typeMappingsEntityToEntityReference[entity.type]];
    entityReference.type = entityReference.isDataItemIn.subject = entityReferenceType;
  }

  var entityReferenceId = entityReference.id;
  if (!entityReferenceId) {
    entityReferenceId = uuid.v1();
    entityReference.id = entityReferenceId;

    if (!dataset.name && entity.db) {
      dataset.name = entity.db;
    } else if (!dataset.bridgeDbDatasourceName && entity.bridgeDbDatasourceName) {
      dataset.bridgeDbDatasourceName = entity.bridgeDbDatasourceName;
    }
  }

  var lastEnrichedEntityReferenceSourceError;
  var enrichedEntityReferenceSource = RxNode.fromReadableStream(
      bridgeDb.entityReference.enrich(entityReference, {
        organism: false
      }))
    .doOnError(function(err) {
      lastEnrichedEntityReferenceSourceError = err;
    });

  var errorHandlerSource = Rx.Observable.return({})
    .flatMap(function() {
      console.error('lastEnrichedEntityReferenceSourceError');
      console.error(lastEnrichedEntityReferenceSourceError);
      /* // TODO first, add an error code to bridgedbjs for a "no matches found" error.
      // Then try enriching just the dataset, if it is available.
      if (lastEnrichedEntityReferenceSourceError.code === 'ENTITYREFERENCEMISSINGDATA') {
        if (dataset) {
          return RxNode.fromReadableStream(bridgeDb.dataset.get(dataset))
            .map(function(enrichedDataset) {
              entityReference.dataset = enrichedDataset;
              return entityReference;
            });
        }
        return Rx.Observable.return(entityReference);
      }
      return Rx.Observable.return(lastEnrichedEntityReferenceSourceError);
      //*/
      if (!entityReference.identifier) {
        delete entityReference['owl:sameAs'];
        delete entityReference.xref;
      }
      return Rx.Observable.return(entityReference);
    });

  return Rx.Observable.catch(enrichedEntityReferenceSource, errorHandlerSource);
};

dataNode.toPvjson = function(
    pvjson, gpmlSelection, dataNodeSelection, callback) {

  var generateEntityReference = dataNode.generateEntityReference;
  var organism = pvjson.organism;
  var pvjsonElements;
  var entity = {};
  // NOTE: when the DataNode is set to have a Type of "Unknown" in PathVisio-Java,
  // it is serialized into GPML without a Type attribute.
  var gpmlDataNodeType = dataNodeSelection.attr('Type') || 'Unknown';

  // Using Biopax classes, when possible, like biopax:Protein.
  // Otherwise, using gpml classes.
  var entityType = dataNode.entityTypeMappingsGpmlToNormalized[gpmlDataNodeType];
  if (entityType) {
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
          entityReference,
          entity);

      function enrichEntityReferenceAndUpdateEntity() {
        return enrichEntityReference()
          .map(function(enrichedEntityReference) {
            if (!enrichedEntityReference) {
              return enrichedEntityReference;
            }

            var previousEntityReferenceId = entity.entityReference;

            entity.entityReference = enrichedEntityReference.id;

            var enrichedEntityReferenceId = enrichedEntityReference.id;
            // TODO why is entityReference defined here like this?
            entityReference = entity.entityReference = enrichedEntityReferenceId;

            var enrichedEntityReferenceExists = pvjson.elements
            .filter(function(element) {
              return element.id === enrichedEntityReferenceId;
            }).length > 0;

            entityType = entity.type;
            // Fill in type from bridgeDb if it's missing from GPML.
            if (!entityType && !_.isEmpty(enrichedEntityReference.type)) {
              var entityReferenceType = _.find(enrichedEntityReference.type,
                  function(enrichedEntityReferenceType) {
                    return typeMappingsEntityReferenceToEntity[enrichedEntityReferenceType];
                  });
              entity.type = typeMappingsEntityReferenceToEntity[entityReferenceType];
              entity['gpml:Type'] = entityTypeMappingsNormalizedToGpml[entity.type];
            }

            entity.textContent = entity.textContent || enrichedEntityReference.displayName;

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

            // Check for whether the previous entity reference is still
            // being referenced in this pathway, and if not, remove it.
            var firstEntityReferencingPreviousEntityReferenceId =
                _.find(pvjson.elements, function(element) {
                  return element.entityReference === previousEntityReferenceId;
                });

            if (!firstEntityReferencingPreviousEntityReferenceId) {
              var previousEntityReference = _.find(pvjson.elements, function(element) {
                return element.id === previousEntityReferenceId;
              });
              var previousEntityReferenceIndex = pvjson.elements.indexOf(previousEntityReference);
              pvjson.elements.splice(previousEntityReferenceIndex, 1);
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

        // Fill in any missing entity reference data from previous
        // entity reference, if available.
        if (_.isPlainObject(updatedEntityReference) && !updatedEntityReference.id) {
          var updatedDataset = updatedEntityReference.isDataItemIn;
          var updatedIdentifier = updatedEntityReference.identifier;
          if (!updatedDataset) {
            updatedEntityReference.isDataItemIn = entityReference.isDataItemIn;
          } else if (!updatedIdentifier) {
            updatedEntityReference.identifier = entityReference.identifier;
          }
        } else if (_.isString(updatedEntityReference)) {
          console.log('updatedEntityReference');
          console.log(updatedEntityReference);
          updatedEntityReference = {
            id: updatedEntityReference
          };
        }

        enrichEntityReference = dataNode.enrichEntityReference.bind(
            undefined,
            bridgeDb,
            pvjson['@context'],
            updatedEntityReference,
            entity);
        return enrichEntityReferenceAndUpdateEntity();
      };

      return callback(entity);
    });
  });
};

module.exports = dataNode;
