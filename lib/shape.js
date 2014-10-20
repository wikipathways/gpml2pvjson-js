'use strict';
var GpmlUtilities = require('./gpml-utilities.js')
  ;

module.exports = {
  defaults: {
    attributes: {
      Align: {
        name: 'Align',
        value: 'Center'
      },
      Color: {
        name: 'Color',
        value: '000000'
      },
      FillColor: {
        name: 'FillColor',
        value: 'Transparent'
      },
      FontSize: {
        name:'FontSize',
        value:10
      },
      LineThickness: {
        name: 'LineThickness',
        value: 1
      },
      Padding: {
        name: 'Padding',
        value: '0.5em'
      },
      ShapeType: {
        name: 'ShapeType',
        value: 'Rectangle'
      },
      Valign: {
        name: 'Valign',
        value: 'Top'
      },
      ZOrder: {
        name: 'ZOrder',
        value: 0
      },
    }
  },
  applyDefaults: function(gpmlElement, defaults) {
    gpmlElement = GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
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
