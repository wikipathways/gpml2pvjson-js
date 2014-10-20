'use strict';

var _ = require('lodash')
  , BridgeDbDataSources = require('./data-sources.json')
  , highland = require('highland')
  ;

/*
## An understanding of how to represent things in Biopax (translate to JSON-LD to see what this library does)

# Protein, SmallMolecule, Rna, Dna, Complex
Using valid Biopax, a Protein can be identified with an rdf:ID like "Protein_bff9d86171ecbf5295e1e64e43a74b32".
It can have an entityReference, which refers to a ProteinReference, which is identified with an rdf:about
like "http://identifiers.org/uniprot/P78527". The ProteinReference can have an xref, which refers to a
UnificationXref, which is identified with an rdf:ID like "UnificationXref_7aa7d234623618f8f437fd000ec17be5".

It is not 100% clear how to duplicate the above model for Pathway and Interaction, because PathwayReference
and InteractionReference do not exist in Biopax 3. Currently, we are using the following, but this could change:
TODO: validate the following representations for Pathways and Interactions.

# Pathway
A Pathway can be identified in Biopax with an rdf:about like "http://identifiers.org/wikipathways/WP525", as
long as it is the only entity in the provided data with that rdf:about value.

If there are multiple instances of that entity, it can be identified with an rdf:ID having a value of UUID.
It also has an xref that refers to a RelationshipXref with an rdf:about like
"http://identifiers.org/wikipathways/WP525".

Because it seems it would be confusing to have two different ways to refer to Pathways, I will instead use the
following:

Pathways are identified with an rdf:ID of UUID. Each one has an xref that references a RelationshipXref, which
has an rdf:about like "http://identifiers.org/wikipathways/WP525"

# Interaction (Does a database exist for these that would be analogous to UniProt for proteins?)
An Interaction can be identified in Biopax with an rdf:about like
"http://identifiers.org/example/abc123", as long as it is the only entity in the provided data
with that rdf:about value.

If there are multiple instances of that entity, it can be identified with an rdf:ID having a value of UUID.
It also has an xref that refers to a RelationshipXref with an rdf:about like
"http://identifiers.org/example/abc123".

For WormBase Interactions, we have this:
An Interaction can be identified in Biopax with an rdf:ID having a value of UUID. The Interaction can have an
evidence property that refers to an Evidence element that has an rdf:about with a value like
"http://identifiers.org/wormbase/WBInteraction000520482".
//*/


var Xref = {};

Xref.addIdentifiersToContext = function(context, callback) {
  _.forEach(BridgeDbDataSources, function(dataSource) {
    if (!!dataSource.namespace) {
      context[dataSource.namespace] = 'identifiers:' + dataSource.namespace + '/';
    }
  });
  if (!!callback) {
    callback(null, context);
  }
};

Xref.generate = function(args){
  var displayName = args.displayName
    , dataSourceName = args.dataSourceName
    , dbId = args.dbId
    , pvjson = args.pvjson
    , organism = pvjson.organism
    , entityType = args.entityType
    , bridgeDbDataSourcesRow
    , bridgeDbDbNameCode
    , pvjsonXref = {}
    , pvjsonXrefType
    , linkoutPattern
    ;

  // keys only use numbers and letters, lowercased, for comparison purposes
  var normalizedDataSourceNameMappings = {
    'keggenzyme': 'Enzyme Nomenclature'
    , 'ecnumber': 'Enzyme Nomenclature'
    , 'keggortholog': 'KEGG Orthology'
    // TODO should we add additional checking to make sure it's not PubChem-bioassay or PubChem-substance?
    , 'pubchem': 'PubChem-compound'
    , 'swissprot': 'Uniprot-TrEMBL'
    , 'mirbase': 'miRBase Sequence'
  };
  var normalizedDataSourceName = normalizedDataSourceNameMappings[dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'')];
  if (!!normalizedDataSourceName) {
    console.warn('Normalized external reference database name from "' + dataSourceName + '" to "' + normalizedDataSourceName + '".');
    dataSourceName = normalizedDataSourceName;
  }

  // For entries not in BridgeDB.
  // keys only use numbers and letters, lowercased, for comparison purposes
  var dataSourceNameToLinkoutPatternMappings = {
    'keggorthology': 'http://identifiers.org/kegg.orthology/$id'
    , 'chemblcompound': 'http://identifiers.org/chembl.compound/$id'
    , 'ctdgene': 'http://identifiers.org/ctd.gene/$id'
    , 'genedb': 'http://identifiers.org/genedb/$id'
    , 'unigene': 'http://identifiers.org/unigene/$id'
    , 'ensemblchicken': 'http://identifiers.org/ensembl/$id'
    , 'ensemblchimp': 'http://identifiers.org/ensembl/$id'
    , 'ensemblcow': 'http://identifiers.org/ensembl/$id'
    , 'ensembldog': 'http://identifiers.org/ensembl/$id'
    , 'ensemblhorse': 'http://identifiers.org/ensembl/$id'
    , 'ensemblhuman': 'http://identifiers.org/ensembl/$id'
    , 'ensemblmouse': 'http://identifiers.org/ensembl/$id'
    , 'ensemblpig': 'http://identifiers.org/ensembl/$id'
    , 'ensemblrat': 'http://identifiers.org/ensembl/$id'
    , 'ensemblxenopus': 'http://identifiers.org/ensembl/$id'
    , 'ensemblzebrafish': 'http://identifiers.org/ensembl/$id'
    , 'ensemblbsubtilis': 'http://identifiers.org/ensembl.bacteria/$id'
    , 'ensemblecoli': 'http://identifiers.org/ensembl.bacteria/$id'
    , 'ensemblmtuberculosis': 'http://identifiers.org/ensembl.bacteria/$id'
    , 'ensemblcelegans': 'http://identifiers.org/ensembl.metazoa/$id'
    , 'ensemblfruitfly': 'http://identifiers.org/ensembl.metazoa/$id'
    , 'ensemblmosquito': 'http://identifiers.org/ensembl.metazoa/$id'
    , 'ensemblyeast': 'http://identifiers.org/ensembl.fungi/$id'
    , 'chemidplus': 'http://identifiers.org/chemidplus/$id'
    , 'nanoparticleontology': 'http://purl.bioontology.org/ontology/npo#$id'
  };

  pvjsonXref.displayName = displayName;

  if (entityType.indexOf('WBInteraction') > -1) {
    pvjsonXref.type = 'Evidence';
  } else if (!!entityType) {
    pvjsonXref.type = entityType + 'Reference';

    // TODO how should we best handle sub-pathway instances in pvjson?
    // AP confirms we need to be able to handle multiple instances of
    // a given sub-pathway in one parent pathway.
    if (entityType === 'Pathway') {
      pvjsonXref.organism = pvjson.organism;
    }
  } else {
    pvjsonXref.type = 'Xref';
  }

  // get external database namespace (as specified at identifiers.org) from GPML Xref Database attribute value.
  bridgeDbDataSourcesRow = BridgeDbDataSources.filter(function(dataSource) {
    return dataSource.dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'') === dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'');
  })[0];

  if (!bridgeDbDataSourcesRow) {
    console.warn('The BridgeBD data-sources.txt file does not have an entry for external reference database "' + dataSourceName + '".');
    linkoutPattern = dataSourceNameToLinkoutPatternMappings[dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'')];
    if (!linkoutPattern) {
      console.warn('Pvjs does not know how to create a URI for external reference database "' + dataSourceName + '".');
      return;
    }
  } else {
    if (!!bridgeDbDataSourcesRow.namespace) {
      linkoutPattern = 'http://identifiers.org/' + bridgeDbDataSourcesRow.namespace + '/$id';
    } else {
      linkoutPattern = dataSourceNameToLinkoutPatternMappings[dataSourceName.toLowerCase().replace(/[^a-z0-9]/gi,'')];
      if (!linkoutPattern) {
        if (!!bridgeDbDataSourcesRow.linkoutPattern) {
          linkoutPattern = bridgeDbDataSourcesRow.linkoutPattern;
        } else {
          console.warn('Pvjs does not know how to create a URI for external reference database "' + dataSourceName + '".');
        }
      }
    }
    // this is an alias BridgeDB uses for database names, e.g. Entrez Gene is "L"
    bridgeDbDbNameCode = bridgeDbDataSourcesRow.systemCode;
  }

  // correct invalid ChEBI identifiers
  if (linkoutPattern === 'http://identifiers.org/chebi/$id' && dbId.indexOf('CHEBI') === -1) {
    dbId = 'CHEBI:' + parseFloat(dbId);
  }

  pvjsonXref.id = !!linkoutPattern ? linkoutPattern.replace(/\$id/, dbId) : dataSourceName + ':' + dbId;
  
  // TODO should we also add the dbId and dbName to the Xref?

  // TODO we need a way to know whether BridgeDB actually has mappings for a given Xref. Querying the BridgeDB API from this converter wouldn't work,
  // because it would be too slow.
  // If we can't be sure a given linkOutPattern has mappings at BridgeDB, we'll need to query the BridgeDB API in pvjs before opening the annotation
  // panel. If no mappings are available, but the EntityReference's id is a dereferenceable URL, we could open that instead.
  //
  //                             BridgeDB mappings not available for WormBase Interactions                            and also not for reactome pathways
  if (!!organism && !!bridgeDbDbNameCode && !!dbId && dbId.indexOf('WBInteraction') === -1 && (!linkoutPattern || linkoutPattern.indexOf('reactome') === -1)) {
    // This URL is what BridgeDB currently uses. Note it currently returns TSV.
    // It would be nice to change the URL to something like the second version below. It would also be nice to return JSON-LD.
    pvjsonXref.xrefs = [encodeURI('http://webservice.bridgedb.org/' + organism + '/xrefs/' + bridgeDbDbNameCode + '/' + dbId)];
    //pvjsonXref.xrefs = encodeURI('http://bridgedb.org/' + dbName + '/' + dbId + '/xref');

    if (!!linkoutPattern && (linkoutPattern.indexOf('ensembl') > -1 || linkoutPattern.indexOf('ncbigene') > -1)) {
      pvjsonXref.xrefs.push(encodeURI('http://mygene.info/v2/gene/' + dbId));
    }
  }
  return pvjsonXref;
};

Xref.toPvjson = function(args) {
  var pvjson = args.pvjson
    , currentClassLevelPvjsonElement = args.pvjsonElement
    , currentClassLevelGpmlElement = args.gpmlElement
    , gpmlXref = args.xref
    , organism = pvjson.organism
    , pvjsonElements
    , gpmlDataNodeType
    , result = {}
    , entityType = currentClassLevelPvjsonElement.type
    ;


  result.pvjson = pvjson;
  result.pvjsonElement = currentClassLevelPvjsonElement;

  var dataSourceName = gpmlXref.Database;
  var dbId = gpmlXref.ID;

  if (!dataSourceName || !dbId) {
    console.warn('GPML Xref missing DataSource and/or ID');
    // Getting to this point would indicate incorrect GPML, but we don't
    // return an error here, because this isn't a fatal error.

    // TODO Do we want to create a URI for pathways, even if they don't have an entity type specified?
    // We could make it be the search URL for WikiPathways
    return result;
  }

  var pvjsonXref = Xref.generate({
    displayName: currentClassLevelPvjsonElement.textContent
    , dataSourceName: dataSourceName
    , dbId: dbId
    , pvjson: pvjson
    , entityType: entityType
  });

  if (!pvjsonXref) {
    console.warn('Could not generate Xref for:');
    console.warn(currentClassLevelPvjsonElement);
    console.warn(currentClassLevelGpmlElement);
    result.pvjsonElement = currentClassLevelPvjsonElement;
    return result;
  }

  // NOTE: The id for a pvjsonXref is intentionally different from the ID for a GPML Xref.
  // The pvjsonXref id is a URI, whereas the GPML Xref ID is the same as Biopax:id
  var pvjsonXrefId = pvjsonXref.id;

  var xrefDataProperty;
  if (currentClassLevelGpmlElement.name === 'DataNode' || currentClassLevelGpmlElement.name === 'Group') {
    xrefDataProperty = 'entityReference';
  } else if (pvjsonXref.type === 'Evidence') {
    xrefDataProperty = xrefDataProperty.toLowerCase();
  } else {
    xrefDataProperty = 'xref';
  }

  // If there is no currentClassLevelPvjsonElement[xrefDataProperty], just set it equal
  // to pvjsonXrefId.
  // If there is already a value for currentClassLevelPvjsonElement[xrefDataProperty],
  // but the value is not an array, convert currentClassLevelPvjsonElement[xrefDataProperty]
  // to an array, then push both the existing value and the new value;
  // otherwise, just push pvjsonXrefId into the existing array.
  if (!currentClassLevelPvjsonElement[xrefDataProperty]) {
    currentClassLevelPvjsonElement[xrefDataProperty] = pvjsonXrefId;
  } else if (_.isArray(currentClassLevelPvjsonElement[xrefDataProperty])) {
    currentClassLevelPvjsonElement[xrefDataProperty].push(pvjsonXrefId);
  } else {
    currentClassLevelPvjsonElement[xrefDataProperty] = [currentClassLevelPvjsonElement[xrefDataProperty]];
    currentClassLevelPvjsonElement[xrefDataProperty].push(pvjsonXrefId);
  }

  // check whether this pvjsonXref has already been added
  var pvjsonXrefArray = pvjson.elements.filter(function(element){
    return pvjsonXrefId === element.id;
  });
  if (pvjsonXrefArray.length === 0) {
    pvjson.elements.push(pvjsonXref);
    result.pvjson = pvjson;
  }


  result.pvjsonElement = currentClassLevelPvjsonElement;

  return result;
};

module.exports = Xref;
