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

UnificationXref.generateEntityReference = function(args){
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
    return;
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
  return entityReference;
};

//UnificationXref.toPvjson = highland.wrapCallback(function(args, callbackInside) {
UnificationXref.toPvjson = function(args) {
  var pvjson = args.pvjson
    , currentClassLevelPvjsonElement = args.pvjsonElement
    , currentClassLevelGpmlElement = args.gpmlElement
    , xref = args.xref
    , organism = pvjson.organism
    , pvjsonElements
    , gpmlDataNodeType
    //, result = []
    , result = {}
    ;


  result.pvjson = pvjson;
  result.pvjsonElement = currentClassLevelPvjsonElement;

  if (currentClassLevelGpmlElement.name === 'DataNode') {
    gpmlDataNodeType = currentClassLevelGpmlElement.attributes.Type.value || 'Unknown';
  }

  // this converts GPML DataNode Type to a Biopax class, like Protein or SmallMolecule
  var entityType = gpmlToBiopaxMappings[gpmlDataNodeType];
  if (!!entityType) {
    currentClassLevelPvjsonElement.type = entityType;
  }

  var dataSourceName = xref.Database;
  var dbId = xref.ID;

  if (!dataSourceName || !dbId) {
    console.warn('GPML Xref missing DataSource and/or ID');
    // Getting to this point would indicate incorrect GPML, but we don't
    // return an error here, because this isn't a fatal error.
    //return callbackInside(null, result);
    return result;
  }

  // TODO how should we best handle sub-pathway instances in pvjson?
  // AP confirms we need to be able to handle multiple instances of
  // a given sub-pathway in one parent pathway, which would indicate
  // we should treat pathways the same as other elements instead of
  // how we're doing it below. --AR
  if (entityType === 'Pathway') {
    currentClassLevelPvjsonElement.organism = pvjson.organism;
  }

  var entityReference = UnificationXref.generateEntityReference({
    displayName: currentClassLevelPvjsonElement.textContent
    , dataSourceName: dataSourceName
    , dbId: dbId
    , pvjson: pvjson
    , entityType: entityType
  });
  if (!entityReference) {
    console.warn('Could not generate entityReference.');
    return result;
  }
  var entityReferenceId = entityReference.id;
  currentClassLevelPvjsonElement.entityReference = entityReferenceId;
  result.pvjsonElement = currentClassLevelPvjsonElement;

  if (entityType !== 'Pathway') {
    // check whether this entity reference has already been added
    var entityReferenceArray = pvjson.elements.filter(function(element){
      entityReference.id === element.id;
    });
    if (entityReferenceArray.length === 0) {
      pvjson.elements.push(entityReference);
      result.pvjson = pvjson;
    }
  }

  return result;
  //return callbackInside(null, result);
};


module.exports = UnificationXref;
