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
  toPvjson: function(pathway, gpmlSelection, dataNodeSelection, callbackInside) {
    var generateEntityReference = this.generateEntityReference
      , bridgeDbDataSourcesRow
      , bridgeDbDbNameCode
      , organism
      , entityReferenceIri
      , entityReferenceType
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
        var entityReferences = [entity.id];
        var dbName, dataSourceName, dbId, userSpecifiedXref,
          xrefSelection = dataNodeSelection.find('Xref');
        if (xrefSelection.length > 0) {
          dataSourceName = xrefSelection.attr('Database');
          dbId = xrefSelection.attr('ID');
          if (!!dataSourceName && !!dbId) {
            // get external database namespace (as specified at identifiers.org) from GPML Xref Database attribute value.
            bridgeDbDataSourcesRow = BridgeDbDataSources.filter(function(dataSource) {
              return dataSource.dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'') === dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'');
            })[0];
            dbName = bridgeDbDataSourcesRow.namespace;
            // this is an alias BridgeDB uses for database names, e.g. Entrez Gene is "L"
            bridgeDbDbNameCode = bridgeDbDataSourcesRow.systemCode;

            entityReferenceIri = 'http://identifiers.org/' + dbName + '/' + dbId;
            entity.entityReference = entityReferenceIri;


            if (!!pathway.organism && !!bridgeDbDbNameCode && !!dbName && !!dbId) {
              // This URL is what BridgeDB currently uses. Note it currently returns TSV.
              // It would be nice to change the URL to something like the lower down version. It would also be nice to return JSON-LD.
              entity.xrefs = [encodeURI('http://webservice.bridgedb.org/' + pathway.organism + '/xrefs/' + bridgeDbDbNameCode + '/' + dbId)];
              /*
              //entityReference.xrefs = encodeURI('http://bridgedb.org/' + dbName + '/' + dbId + '/xref');
              //*/
              if (dbName === 'ensembl' || dbName === 'ncbigene') {
                //mygene.info/v2/gene/ENSG00000170248
                entity.xrefs.push(encodeURI('http://mygene.info/v2/gene/' + dbId));
              }
            }
            pvjsonElements = [entity];
            callbackInside(pvjsonElements);
            /*
            BridgeDb.convertToEnsembl(userSpecifiedXref.organism, dbId, dbName, 'label', 'desc', function(ensemblUri) {
              if (!!ensemblUri) {
                entity.unificationXref = ensemblUri;
                pvjsonElements = [entity];
                callbackInside(pvjsonElements);
              }
              else {
                pvjsonElements = [entity];
                callbackInside(pvjsonElements);
              }
            });
            //*/
          } else {
            pvjsonElements = [entity];
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
