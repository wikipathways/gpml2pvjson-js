'use strict';

var GpmlElement = require('./element.js')
  , Graphics = require('./graphics.js')
  , fs = require('fs')
  , BridgeDb = require('bridgedbjs')
  , BridgeDbDataSources = require('./data-sources.json')
  ;

//var BridgeDbDataSources = JSON.parse(fs.readFileSync('../data-sources.json'));

module.exports = {
  // Insert preferred Biopax term first, with other terms following.
  gpmlToBiopaxMappings: {
    'Metabolite':['SmallMolecule'],
    'Protein':['Protein'],
    'RNA':['Rna'],
    'Unknown':['Entity'],
    'GeneProduct':['Dna','Gene','Rna','Protein'],
    'Pathway':['Pathway']
  },
  generateEntityReference: function(dataSourceName, dbId, organism, entityType, callback){
    var bridgeDbDataSourcesRow
      , bridgeDbDbNameCode
      , entityReference = {}
      , entityReferenceType
      ;

    entityReference.type = entityType + 'Reference';
    // get external database namespace (as specified at identifiers.org) from GPML Xref Database attribute value.
    bridgeDbDataSourcesRow = BridgeDbDataSources.filter(function(dataSource) {
      return dataSource.dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'') === dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'');
    })[0];
    var dbName = bridgeDbDataSourcesRow.namespace;
    // this is an alias BridgeDB uses for database names, e.g. Entrez Gene is "L"
    bridgeDbDbNameCode = bridgeDbDataSourcesRow.systemCode;

    entityReference.id = 'http://identifiers.org/' + dbName + '/' + dbId;

    if (!!organism && !!bridgeDbDbNameCode && !!dbName && !!dbId) {
      // This URL is what BridgeDB currently uses. Note it currently returns TSV.
      // It would be nice to change the URL to something like the second version below. It would also be nice to return JSON-LD.
      entityReference.xrefs = [encodeURI('http://webservice.bridgedb.org/' + organism + '/xrefs/' + bridgeDbDbNameCode + '/' + dbId)];

      /*
         entityReference.xrefs = encodeURI('http://bridgedb.org/' + dbName + '/' + dbId + '/xref');
      //*/

      if (dbName === 'ensembl' || dbName === 'ncbigene') {
        entityReference.xrefs.push(encodeURI('http://mygene.info/v2/gene/' + dbId));
      }
    }
    callback(null, entityReference);
  },
  toPvjson: function(pathway, gpmlSelection, dataNodeSelection, callbackInside) {
    var generateEntityReference = this.generateEntityReference
      , organism = pathway.organism
      , pvjsonElements
      , entity = {}
      , gpmlDataNodeType = dataNodeSelection.attr('Type')
      ;

    if (!gpmlDataNodeType) {
      gpmlDataNodeType = 'Unknown';
    }

    entity.type = entity.type || [];
    // this is a Biopax class, like Protein or SmallMolecule
    var entityTypes = this.gpmlToBiopaxMappings[gpmlDataNodeType];
    if (!!entityTypes && entityTypes.length > 0) {
      entity.type = entity.type.concat(entityTypes);
    }

    GpmlElement.toPvjson(pathway, gpmlSelection, dataNodeSelection, entity, function(entity) {
      Graphics.toPvjson(pathway, gpmlSelection, dataNodeSelection, entity, function(entity) {
        var entityReferences = [entity.id]
          , dataSourceName
          , dbId
          , userSpecifiedXref
          , xrefSelection = dataNodeSelection.find('Xref')
          ;
        if (xrefSelection.length > 0 && entityTypes.indexOf('Pathway') === -1) {
          dataSourceName = xrefSelection.attr('Database');
          dbId = xrefSelection.attr('ID');
          if (!!dataSourceName && !!dbId) {
            generateEntityReference(dataSourceName, dbId, organism, entityTypes[0], function(err, entityReference) {
              var entityReferenceId = entityReference.id;
              entity.entityReference = entityReferenceId;

              var entityReferenceExists = pathway.entities.filter(function(entity) {
                return entity.id === entityReferenceId;
              }).length > 0;

              if (!entityReferenceExists) {
                pvjsonElements = [entity, entityReference];
              } else {
                pvjsonElements = [entity];
              }
              callbackInside(pvjsonElements);
            });
          } else {
            // this would indicate incorrect GPML
            pvjsonElements = [entity];
            console.warn('GPML Xref missing DataSource and/or ID');
            callbackInside(pvjsonElements);
          }
        } else {
          if (entityTypes.indexOf('Pathway') > -1) {
            entity.organism = organism;
          }
          pvjsonElements = [entity];
          callbackInside(pvjsonElements);
        }
      });
    });
  }
};
