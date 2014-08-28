'use strict';

var _ = require('lodash')
  , BridgeDbDataSources = require('./data-sources.json')
  , highland = require('highland')
  ;

var UnificationXref = {};

UnificationXref.addIdentifiersToContext = function(context, callback) {
  _.forEach(BridgeDbDataSources, function(dataSource) {
    if (!!dataSource.namespace) {
      context[dataSource.namespace] = 'identifiers:' + dataSource.namespace + '/';
    }
  });
  if (!!callback) {
    callback(null, context);
  }
};

// Using closest Biopax term.
var gpmlToBiopaxMappings = {
  'Metabolite':'SmallMolecule',
  'Protein':'Protein',
  'RNA':'Rna',
  'Unknown':'PhysicalEntity',
  'GeneProduct':'Dna',
  //'GeneProduct':['Dna','Gene','Rna','Protein'],
  'Pathway':'Pathway',
  'Complex':'Complex'
};

UnificationXref.generateEntityReference = function(args, callback){
  var displayName = args.displayName
    , dataSourceName = args.dataSourceName
    , dbId = args.dbId
    , pvjson = args.pvjson
    , organism = pvjson.organism
    , entityType = args.entityType
    , bridgeDbDataSourcesRow
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

  if (!bridgeDbDataSourcesRow) {
    console.warn('Cannot find specified external reference database in the BridgeBD data-sources.txt file.');
    return callback('Cannot find specified external reference database in the BridgeBD data-sources.txt file.', null);
  }

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
};

UnificationXref.toPvjson = highland.wrapCallback(function(args, callbackInside) {
  var currentClassLevelPvjsonAndGpmlElements = args.currentClassLevelPvjsonAndGpmlElements
    , currentClassLevelPvjsonElement = currentClassLevelPvjsonAndGpmlElements.pvjsonElement
    , currentClassLevelGpmlElement = currentClassLevelPvjsonAndGpmlElements.gpmlElement
    , xrefElement = args.xrefElement
    , pvjson = args.pvjson
    , organism = pvjson.organism
    , pvjsonElements
    , gpmlDataNodeType
    , result = []
    ;

  if (currentClassLevelGpmlElement.name === 'DataNode') {
    gpmlDataNodeType = currentClassLevelGpmlElement.attributes.Type.value || 'Unknown';
  }

  // this converts GPML DataNode Type to a Biopax class, like Protein or SmallMolecule
  var entityType = gpmlToBiopaxMappings[gpmlDataNodeType];
  if (!!entityType) {
    currentClassLevelPvjsonElement.type = entityType;
  }

  var dataSourceName = xrefElement.attributes.Database.value;
  var dbId = xrefElement.attributes.ID.value;

  if (!dataSourceName || !dbId) {
    console.warn('GPML Xref missing DataSource and/or ID');
    result[0] = currentClassLevelPvjsonElement;
    // Getting to this point would indicate incorrect GPML, but we don't
    // return an error here, because this isn't a fatal error.
    return callbackInside(null, result);
  }

  // TODO how should we best handle sub-pathway instances in pvjson?
  // AP confirms we need to be able to handle multiple instances of
  // a given sub-pathway in one parent pathway, which would indicate
  // we should treat pathways the same as other elements instead of
  // how we're doing it below. --AR
  if (entityType === 'Pathway') {
    currentClassLevelPvjsonElement.organism = pvjson.organism;
  }

  UnificationXref.generateEntityReference({
    displayName: currentClassLevelPvjsonElement.textContent
    , dataSourceName: dataSourceName
    , dbId: dbId
    , pvjson: pvjson
    , entityType: entityType
  }, function(err, entityReference) {
    if (!entityReference) {
      console.warn('Could not generate entityReference.');
      result[0] = currentClassLevelPvjsonElement;
      return callbackInside(null, result);
    }

    var entityReferenceId = entityReference.id;
    currentClassLevelPvjsonElement.entityReference = entityReferenceId;
    result[0] = currentClassLevelPvjsonElement;

    if (entityType !== 'Pathway') {
      var entityReferenceArray = pvjson.elements.filter(function(element){
        entityReference.id === element.id;
      });
      if (entityReferenceArray.length === 0) {
        // this entity reference was already added
        result[1] = entityReference;
        console.log('entityReference in UX');
        console.log(entityReference);
      }
    }
    return callbackInside(null, result);
  });
});


module.exports = UnificationXref;
