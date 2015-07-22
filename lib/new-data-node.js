'use strict';

var BridgeDb = require('bridgedb');
var GpmlElement = require('./element.js');
var Graphics = require('./graphics.js');
var Rx = require('rx');
var RxNode = require('rx-node');

var bridgeDb = new BridgeDb();

var datasetMetadata = RxNode.fromReadableStream(
    bridgeDb.dataset.query());
var datasetMetadataCache = new Rx.ReplaySubject(1);
datasetMetadata.subscribe(datasetMetadataCache);

var dataNode = {};

dataNode.gpmlToNormalizedMappings = {
  'Metabolite':'gpml:Metabolite',
  'Protein':'biopax:Protein',
  'Rna':'biopax:Rna',
  'Unknown':'PhysicalEntity',
  'GeneProduct':'gpml:GeneProduct',
  //'GeneProduct':['Dna','Gene','Rna','Protein'],
  'Pathway':'biopax:Pathway',
  'Complex':'biopax:Complex'
};

// Use closest Biopax term.
dataNode.gpmlToNormalizedEntityTypeMappings = {
  'Metabolite': 'gpml:Metabolite',
  'Protein': 'biopax:Protein',
  'Rna': 'biopax:Rna',
  'Unknown': 'gpml:Unknown',
  'GeneProduct': 'gpml:GeneProduct',
  'Pathway': 'biopax:Pathway',
  'Complex': 'biopax:Complex'
};

dataNode.entityToEntityReferenceTypeMappings = {
  'gpml:Metabolite': 'biopax:SmallMoleculeReference',
  'gpml:Protein': 'biopax:ProteinReference',
  'gpml:Rna': 'biopax:RnaReference',
  'gpml:Unknown': 'gpml:UnknownReference',
  'gpml:GeneProduct': 'gpml:GeneProductReference',
  /*
  'gpml:GeneProduct':[
    'biopax:DnaReference',
    'biopax:GeneReference',
    'biopax:RnaReference',
    'biopax:ProteinReference'
  ],
  //*/
  'gpml:Pathway': 'gpml:PathwayReference',
  'gpml:Complex': 'gpml:ComplexReference'
};

dataNode.generateEntityReference = function(
    displayName, dataSourceName, identifier, organism, entityType, callback) {
  var bridgeDbDataSourcesRow;
  var entityReference = {};
  var entityReferenceType;

  entityReference.displayName = displayName;

  if (entityType.indexOf('biopax') > -1) {
    entityReference.type = entityType + 'Reference';
  } else {
    entityReference.type = entityType;
  }
  //entityReference.type = dataNode.entityToEntityReferenceTypeMappings[entityType];
  // get external database namespace (as specified at identifiers.org)
  // from GPML Xref Database attribute value.
  datasetMetadataCache.find(function(dataset) {
    return dataset.name.indexOf(dataSourceName) > -1;
  })
  .subscribe(function(dataset) {
    if (!dataset) {
      var message = 'Cannot find specified external reference database ' +
          'in the BridgeBD data-sources.txt file.';
      console.log(message);
      return callback(message, null);
    }

    entityReference.isDataItemIn = dataset;

    var preferredPrefix = dataset.preferredPrefix;
    // this is an alias BridgeDB uses for database names, e.g. Entrez Gene is "L"
    var bridgeDbSystemCode = dataset._systemCode;

    entityReference.id = 'http://identifiers.org/' + preferredPrefix + '/' + identifier;

    if (!!organism && !!bridgeDbSystemCode && !!preferredPrefix && !!identifier) {
      // This URL is what BridgeDB currently uses. Note it currently returns TSV.
      entityReference.xrefs = [encodeURI('http://webservice.bridgedb.org/' +
          organism + '/xrefs/' + bridgeDbSystemCode + '/' + identifier)];
      /*
      // It would be nice to change the URL to something like the second version below.
      // It would also be nice to return JSON-LD.
         entityReference.xrefs = encodeURI(
            'http://bridgedb.org/' + dbName + '/' + dbId + '/xref');
      //*/

      if (preferredPrefix === 'ensembl' || preferredPrefix === 'ncbigene') {
        entityReference.xrefs.push(
            encodeURI('http://mygene.info/v2/gene/' + identifier));
      }
    }
    return callback(null, entityReference);
  });
  /*
  bridgeDbDataSourcesRow = BridgeDbDataSources.filter(function(dataSource) {
    return dataSource.dataSourceName.toLowerCase()
    .replace(/[^a-z0-9]/gi, '') ===
        dataSourceName.toLowerCase()
        .replace(/[^a-z0-9]/gi, '');
  })[0];
  if (!!bridgeDbDataSourcesRow) {
    var dbName = bridgeDbDataSourcesRow.namespace;
    // this is an alias BridgeDB uses for database names, e.g. Entrez Gene is "L"
    bridgeDbSystemCode = bridgeDbDataSourcesRow.systemCode;

    entityReference.id = 'http://identifiers.org/' + dbName + '/' + identifier;

    if (!!organism && !!bridgeDbSystemCode && !!dbName && !!identifier) {
      // This URL is what BridgeDB currently uses. Note it currently returns TSV.
      // It would be nice to change the URL to something like the second version below.
      // It would also be nice to return JSON-LD.
      entityReference.xrefs = [encodeURI('http://webservice.bridgedb.org/' +
          organism + '/xrefs/' + bridgeDbSystemCode + '/' + identifier)];

      if (dbName === 'ensembl' || dbName === 'ncbigene') {
        entityReference.xrefs.push(
            encodeURI('http://mygene.info/v2/gene/' + identifier));
      }
    }
    callback(null, entityReference);
  } else {
    var message = 'Cannot find specified external reference database ' +
        'in the BridgeBD data-sources.txt file.';
    console.log(message);
    callback(message, null);
  }
  //*/
};

dataNode.toPvjson = function(
    pathway, gpmlSelection, dataNodeSelection, callbackInside) {
  var generateEntityReference = dataNode.generateEntityReference;
  var organism = pathway.organism;
  var pvjsonElements;
  var entity = {};
  var gpmlDataNodeType = dataNodeSelection.attr('Type');

  if (!gpmlDataNodeType) {
    gpmlDataNodeType = 'Unknown';
  }

  // this is a Biopax class, like Protein or SmallMolecule
  var entityType = dataNode.gpmlToNormalizedMappings[gpmlDataNodeType];
  if (!!entityType) {
    entity.type = entityType;
  }

  GpmlElement.toPvjson(
      pathway, gpmlSelection, dataNodeSelection, entity, function(entity) {
    Graphics.toPvjson(
        pathway, gpmlSelection, dataNodeSelection, entity, function(entity) {
      var entityReferences = [entity.id];
      var dataSourceName;
      var identifier;
      var userSpecifiedXref;
      var xrefSelection = dataNodeSelection.find('Xref').eq(0);

      if (xrefSelection.length > 0) {
        dataSourceName = xrefSelection.attr('Database');
        identifier = xrefSelection.attr('ID');
        if (!!dataSourceName && !!identifier) {
          generateEntityReference(
              entity.textContent, dataSourceName, identifier, organism, entityType,
              function(err, entityReference) {
            if (!!entityReference) {
              var entityReferenceId = entityReference.id;
              entity.entityReference = entityReferenceId;

              var entityReferenceExists = pathway.elements
              .filter(function(entity) {
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
};
module.exports = dataNode;
