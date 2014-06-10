var WikiPathways = require('../wikipathwaysjs/wikipathways')
  ;

//* Dev only
var pd = require('pretty-data').pd
  ;
//*/

WikiPathways.getPathway({
    id: 'WP554',
    fileFormat: 'application/ld+json'
  },
  function(err, pvjson) {
    var pvjsonString = JSON.stringify(pvjson);
    var prettyPvjson = pd.json(pvjsonString);
    console.log('prettyPvjson');
    console.log(prettyPvjson);
});
