var GpmlElement = require('./element.js')
  , Graphics = require('./graphics.js')
  ;

module.exports = function(){
  'use strict';

  var toPvjson = function(pvjson, gpmlSelection, labelSelection, callback) {
    var pvjsonPath = {};

    GpmlElement.toPvjson(pvjson, gpmlSelection, labelSelection, pvjsonPath, function(pvjsonPath) {
      Graphics.toPvjson(pvjson, gpmlSelection, labelSelection, pvjsonPath, function(pvjsonPath) {
        var pvjsonElements = [pvjsonPath];
        callback(pvjsonElements);
      });
    });
  };

  return {
    toPvjson:toPvjson
  };
}();
