'use strict';

var Strcase = require('tower-strcase')
  , _ = require('lodash')
  , GpmlUtilities = require('./gpml-utilities.js')
  ;

module.exports = {
  toPvjson: function(attribute, currentClassLevelPvjsonAndGpmlElements) {
    var pvjsonElement = currentClassLevelPvjsonAndGpmlElements.pvjsonElement
      , gpmlElement = currentClassLevelPvjsonAndGpmlElements.gpmlElement
      ;
    if (!attribute || !gpmlElement || !pvjsonElement) {
      throw new Error('Missing input element(s) in attribute.toPvjson()');
    }

    var attributeDependencyOrder = [
      'Key',
      'Value'
    ];

    var attributeKey;

    var gpmlToPvjsonConverter = {
      'Key': function(gpmlValue) {
        attributeKey = gpmlValue;
      },
      'Value': function(gpmlValue) {
        if (attributeKey === 'org.pathvisio.CellularComponentProperty') {
          //pvjson.type = 'PhysicalEntity'; // this is probably more valid as Biopax
          pvjsonElement.type = 'CellularComponent'; // this is not valid Biopax
          pvjsonElement.entityReference = gpmlValue;
        }
      },
    };

    if (attribute.attributes.Key.value === 'org.pathvisio.DoubleLineProperty') {
      gpmlElement.Graphics = gpmlElement.Graphics || {};
      gpmlElement.Graphics.attributes = gpmlElement.Graphics.attributes || {};
      gpmlElement.Graphics.attributes.LineStyle = {name: 'LineStyle', value: 'Double'};
      // The line below is left here for future reference, but after discussing with AP, the desired behavior is for the entire shape to be filled. -AR
      //pvjsonElement.fillRule = 'evenodd';
    }
    pvjsonElement = GpmlUtilities.convertAttributesToJson(attribute, pvjsonElement, gpmlToPvjsonConverter, attributeDependencyOrder);

    var result = {};
    result.pvjsonElement = pvjsonElement;
    result.gpmlElement = gpmlElement;
    return result;
  }

};
