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
  toPvjson: function(pvjson, gpmlSelection, shapeSelection, callback) {
    var pvjsonPath = {};

    /*
    GpmlElement.toPvjson(pvjson, gpmlSelection, shapeSelection, pvjsonPath, function(pvjsonPath) {
      Graphics.toPvjson(pvjson, gpmlSelection, shapeSelection, pvjsonPath, function(pvjsonPath) {
        var pvjsonElements = [pvjsonPath];
        callback(pvjsonElements);
      });
    });
    //*/
  }
};


