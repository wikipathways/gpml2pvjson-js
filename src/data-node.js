'use strict';

var GpmlElement = require('./element.js')
  , Graphics = require('./graphics.js')
  , fs = require('fs')
  , BridgeDb = require('bridgedbjs')
  , BridgeDbDataSources = require('./data-sources.json')
  ;

//var BridgeDbDataSources = JSON.parse(fs.readFileSync('../data-sources.json'));

module.exports = {
  // Use closest Biopax term.
  gpmlToBiopaxMappings: {
    'Metabolite':'SmallMolecule',
    'Protein':'Protein',
    'RNA':'Rna',
    'Unknown':'PhysicalEntity',
    'GeneProduct':'Dna',
    //'GeneProduct':['Dna','Gene','Rna','Protein'],
    'Pathway':'Pathway',
    'Complex':'Complex'
  },
  generateEntityReference: function(displayName, dataSourceName, dbId, organism, entityType, callback){
    var bridgeDbDataSourcesRow
      , bridgeDbDbNameCode
      , entityReference = {}
      , entityReferenceType
      ;

    entityReference.displayName = displayName;
    entityReference.type = entityType + 'Reference';
    // get external database namespace (as specified at identifiers.org) from GPML Xref Database attribute value.
    bridgeDbDataSourcesRow = BridgeDbDataSources.filter(function(dataSource) {
      return dataSource.dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'') === dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'');
    })[0];
    if (!!bridgeDbDataSourcesRow) {
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
    } else {
      console.warn('Cannot find specified external reference database in the BridgeBD data-sources.txt file.');
      callback('Cannot find specified external reference database in the BridgeBD data-sources.txt file.', null);
    }
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

    // this is a Biopax class, like Protein or SmallMolecule
    var entityType = this.gpmlToBiopaxMappings[gpmlDataNodeType];
    if (!!entityType) {
      entity.type = entityType;
    }

    GpmlElement.toPvjson(pathway, gpmlSelection, dataNodeSelection, entity, function(entity) {
      Graphics.toPvjson(pathway, gpmlSelection, dataNodeSelection, entity, function(entity) {
        var entityReferences = [entity.id]
          , dataSourceName
          , dbId
          , userSpecifiedXref
          , xrefSelection = dataNodeSelection.find('Xref').eq(0)
          ;
        if (xrefSelection.length > 0) {
          dataSourceName = xrefSelection.attr('Database');
          dbId = xrefSelection.attr('ID');
          if (!!dataSourceName && !!dbId) {
            generateEntityReference(entity.textContent, dataSourceName, dbId, organism, entityType, function(err, entityReference) {
              if (!!entityReference) {
                var entityReferenceId = entityReference.id;
                entity.entityReference = entityReferenceId;

                var entityReferenceExists = pathway.elements.filter(function(entity) {
                  return entity.id === entityReferenceId;
                }).length > 0;

                // TODO how should be best handle sub-pathway instances in a pathway?
                if (entityType === 'Pathway' || !!entityReferenceExists) {
                  if (entityType === 'Pathway') {
                    entity.organism = organism;
                  } 
                  pvjsonElements = [entity];
                } else {
                  pvjsonElements = [entity, entityReference];
                }
                callbackInside(pvjsonElements);
              } else {
                pvjsonElements = [entity];
                callbackInside(pvjsonElements);
              }
            });
          } else {
            // this would indicate incorrect GPML
            pvjsonElements = [entity];
            console.warn('GPML Xref missing DataSource and/or ID');
            callbackInside(pvjsonElements);
          }
        } else {
          pvjsonElements = [entity];
          callbackInside(pvjsonElements);
        }
      });
    });
  }
};
