'use strict';
var GpmlUtilities = require('./gpml-utilities.js')
  ;

module.exports = {
  defaults: {
    attributes: {
    },
    Graphics: {
      attributes: {
      }
    }
  },
  applyDefaults: function(gpmlElement, defaults) {
    GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
    return gpmlElement;
  },
  toPvjson: function(pvjson, gpmlSelection, labelSelection, callback) {
    var pvjsonPath = {};

    /*
    GpmlElement.toPvjson(pvjson, gpmlSelection, labelSelection, pvjsonPath, function(pvjsonPath) {
      Graphics.toPvjson(pvjson, gpmlSelection, labelSelection, pvjsonPath, function(pvjsonPath) {
        var pvjsonElements = [pvjsonPath];
        callback(pvjsonElements);
      });
    });
    //*/
  }
};
