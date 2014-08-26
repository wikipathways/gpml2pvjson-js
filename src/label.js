'use strict';
var GpmlUtilities = require('./gpml-utilities.js')
  ;

module.exports = {
  defaults: {
    attributes: {
    },
    Graphics: {
      attributes: {
        Padding: {
          name: 'Padding',
          value: '0.5em'
        },
        ShapeType: {
          name: 'ShapeType',
          value: 'None'
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
        ZOrder: {
          name: 'ZOrder',
          value: 0
        },
        Align: {
          name: 'Align',
          value: 'Center'
        },
        Valign: {
          name: 'Valign',
          value: 'Top'
        },
      }
    }
  },
  applyDefaults: function(gpmlElement, defaults) {
    gpmlElement = GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
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

