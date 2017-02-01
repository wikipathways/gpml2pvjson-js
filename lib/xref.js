var Xref = {};

Xref.toPvjson = function(args) {
  var pvjson = args.pvjson;
  var currentClassLevelPvjsonElement = args.pvjsonElement;
  var gpmlXref = args.xref;
  var result = {};

  result.pvjson = pvjson;
  result.pvjsonElement = currentClassLevelPvjsonElement;

  var dataSourceName = gpmlXref.Database;
  var identifier = gpmlXref.ID;

  if (!dataSourceName || !identifier) {
    console.warn('GPML Xref missing DataSource and/or ID');
    // Getting to this point would indicate incorrect GPML, but we don't
    // return an error here, because this isn't a fatal error.

    // TODO Do we want to create a URI for pathways, even if
    // they don't have an entity type specified?
    // We could make it be the search URL for WikiPathways
    return result;
  }

  currentClassLevelPvjsonElement.id = identifier;
  currentClassLevelPvjsonElement.database = dataSourceName;

  result.pvjsonElement = currentClassLevelPvjsonElement;

  return result;
};

module.exports = Xref;
