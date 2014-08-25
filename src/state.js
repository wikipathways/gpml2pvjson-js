var Graphics = require('./graphics.js')
  ;

module.exports = (function(){
  'use strict';

  var toPvjson = function(pvjs, gpmlSelection, stateSelection, callback) {
    var pvjsonPath = {};
    /*
    console.log('stateSelection');
    console.log(stateSelection[0][0]);
    console.log('callback');
    console.log(callback);
    //*/

        //*
        //GpmlElement.toPvjson(pvjs, gpmlSelection, stateSelection, pvjsonPath, function(pvjsonPath) {
          Graphics.toPvjson(pvjs, gpmlSelection, stateSelection, pvjsonPath, function(pvjsonPath) {
            var pvjsonElements = [pvjsonPath];
            /*
            console.log('pvjsonPath inside');
            console.log(pvjsonPath);
            console.log('pvjsonText inside');
            console.log(pvjsonText);
            console.log('jsonDataNode inside');
            console.log(jsonDataNode);
            //*/
            callback(pvjsonElements);
          });
        //});
        //*/
  };

  return {
    toPvjson:toPvjson
  };
}());
