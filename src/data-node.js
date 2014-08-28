'use strict';

var Graphics = require('./graphics.js')
  , fs = require('fs')
  , GpmlUtilities = require('./gpml-utilities.js')
  , BridgeDb = require('bridgedbjs')
  ;

//var BridgeDbDataSources = JSON.parse(fs.readFileSync('../data-sources.json'));

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
    return GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
  }
};
