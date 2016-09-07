'use strict';

var _ = require('lodash');
var BridgeDb = require('bridgedb');
//var JsonldRx = require('jsonld-rx');
var Rx = require('rx-extra');
var RxNode = Rx.RxNode;
var utils = require('./utils.js');
var uuid = require('uuid');

var bridgeDb;

//var jsonldRx = new JsonldRx();

var bridgeDbIntegration = {};

var typeMappings = utils.typeMappings;
var tmEntityGpmlPlain2EntityNormalizedPrefixed =
    typeMappings.entityGpmlPlain2entityNormalizedPrefixed;
var tmEntityNormalized2EntityGpml = typeMappings.entityNormalized2entityGpml;
var tmEntity2EntityReference = typeMappings.entity2entityReference;
var tmEntityReference2Entity = typeMappings.entityReference2entity;

var biopaxNodeTypes = utils.biopax.nodeTypes;

/**
 * Generate an entityReference from the data available
 * in the GPML
 *
 * @return entityReference
 */
function generateEntityReference(displayName, bridgeDbDatasourceName,
    identifier, organism, entityType) {

  var entityReference = {};
  entityReference.displayName = displayName;
  entityReference.isDataItemIn = {};
  entityReference.bridgeDbDatasourceName = entityReference.isDataItemIn.bridgeDbDatasourceName =
      bridgeDbDatasourceName;
  entityReference.identifier = identifier;

  var entityReferenceTypeFromGpml =
      tmEntity2EntityReference[entityType];
  if (entityReferenceTypeFromGpml) {
    entityReference.type = [entityReferenceTypeFromGpml];
  }
  return entityReference;
}

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
function enrichEntityReference(bridgeDb, context, entityReference, entity) {
  //entityReference['@context'] = context;
  var dataset = entityReference.isDataItemIn = entityReference.isDataItemIn || {};

  if (entity.type && !entityReference.type) {
    var entityReferenceType =
        [tmEntity2EntityReference[entity.type]];
    entityReference.type = entityReference.isDataItemIn.subject = entityReferenceType;
  }

  var entityReferenceId = entityReference.id;
  if (!entityReferenceId) {
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
      .map(function(enrichedEntityReference) {
        return enrichedEntityReference;
      })
    .doOnError(function(err) {
      lastEnrichedEntityReferenceSourceError = err;
      console.error(err.stack);
    });

  var errorHandlerSource = Rx.Observable.return({})
    .flatMap(function() {
      console.error('lastEnrichedEntityReferenceSourceError');
      console.error(lastEnrichedEntityReferenceSourceError.stack);
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
}

bridgeDbIntegration.prepareForEnrichment = function(pvjson, dataNodeSelection, gpmlXref, entity) {
  if (!bridgeDb) {
    bridgeDb = new BridgeDb({
      organism: pvjson.organism,
      baseIri: 'http://webservice.bridgedb.org/'
    });
  }

  var organism = pvjson.organism;
  var pvjsonElements;

  var entityType = entity.type;
  var userSpecifiedXref;

  var dataSourceName = gpmlXref.Database;
  var identifier = gpmlXref.ID;

  if (!_.isEmpty(dataSourceName)) {
    entity.bridgeDbDatasourceName = dataSourceName;
  } else {
    return entity;
  }
  if (!_.isEmpty(identifier)) {
    entity.identifier = identifier;
  } else {
    return entity;
  }

  //var bridgeDb = pvjson.bridgeDb;

  var entityReference = generateEntityReference(entity.textContent, dataSourceName,
      identifier, organism, entityType);

  var enrichEntityReferenceBound = enrichEntityReference.bind(
      undefined,
      bridgeDb,
      pvjson['@context'],
      entityReference,
      entity);

  function enrichEntityReferenceAndUpdateEntity() {
    return enrichEntityReferenceBound()
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
        if (!_.isEmpty(enrichedEntityReference.type)) {
          var entityReferenceType = _.find(enrichedEntityReference.type,
              function(enrichedEntityReferenceType) {
                return enrichedEntityReferenceType.match(/^biopax:.*Reference$/);
              });

          //* TODO does this belong here still?
          if (!entityReferenceType) {
            entityReferenceType = _.find(enrichedEntityReference.type,
                function(enrichedEntityReferenceType) {
                  return tmEntityReference2Entity[enrichedEntityReferenceType];
                });
          }
          //*/

          var entityTypeFromEntityReference = !!entityReferenceType &&
              entityReferenceType.replace(/Reference$/, '');

          // Fill in type from bridgeDb if it's missing from GPML.
          if (entityTypeFromEntityReference) {
            if (_.isEmpty(entityType)) {
              entity.type = entityTypeFromEntityReference;
              entity['gpml:Type'] = tmEntityNormalized2EntityGpml[entityTypeFromEntityReference];
            } else {
              var entityTypeAsArray = _.isArray(entityType) ? entityType : [entityType];
              var intersection = _.intersection(entityTypeAsArray, biopaxNodeTypes);
              if (_.isEmpty(intersection)) {
                entityTypeAsArray.push(entityTypeFromEntityReference);
                entity.type = entityTypeAsArray;
              }
            }
          }
        }

        var textContent = entity.textContent || entity.displayName ||
            enrichedEntityReference.textContent || enrichedEntityReference.displayName;
        if (textContent) {
          entity.displayName = textContent;
        }
        /*
        if (textContent) {
          // TODO: if we want to use "textContent" instead of
          //  "displayName", we need to this RDF error that results:
          //       Cannot make qname out of <biopax:displayName>
          delete entity.displayName;
          entity.textContent = textContent;
        }
        //*/

        // TODO how should we best handle sub-pathway instances in a pathway?
        // TODO are biopax:Pathways supposed to get an organism property?
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
      updatedEntityReference = {
        id: updatedEntityReference
      };
    }

    enrichEntityReferenceBound = enrichEntityReference.bind(
        undefined,
        bridgeDb,
        pvjson['@context'],
        updatedEntityReference,
        entity);
    return enrichEntityReferenceAndUpdateEntity();
  };

  return entity;
};

module.exports = bridgeDbIntegration;
