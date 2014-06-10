'use strict';

var cheerio = require('cheerio');

module.exports = {
  getAllAsPvjson: function(gpmlElement, callback) {
    var publicationXrefs, jsonPublicationXref, tagName = gpmlElement.name;

    $ = cheerio.load(gpmlElement, {
      normalizeWhitespace: true,
      xmlMode: true,
      decodeEntities: true
    });

    var biopaxRefs = $(tagName + ' > BiopaxRef');
    if (biopaxRefs.length > 0) {
      publicationXrefs = [];
      biopaxRefs.each(function() {
        jsonPublicationXref = $(this).text();
        publicationXrefs.push(jsonPublicationXref);
      });
      callback(publicationXrefs);
    }
    else {
      callback(null);
    }
  }
};
