'use strict';

var Graphics = require('./graphics.js');
var fs = require('fs');
var GpmlUtilities = require('./gpml-utilities.js');
var BridgeDb = require('bridgedb');

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
    gpmlElement.attributes.Type = gpmlElement.attributes.Type || {value: 'Unknown'};
    return GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
  }
};
