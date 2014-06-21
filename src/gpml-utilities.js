'use strict';

var _ = require('lodash')
  ;

module.exports = {
  supportedNamespaces: [
    'http://pathvisio.org/GPML/2013a',
    'http://genmapp.org/GPML/2010a',
    'http://genmapp.org/GPML/2008a',
    'http://genmapp.org/GPML/2007'
  ],

  convertAttributesToJson: function(elementSelection, pvjsonElement, converter, attributeDependencyOrder) {
    var attributes = elementSelection[0].attributes || elementSelection[0].attribs;
    var converterKeys = _.keys(converter);
    /*
    var attributeKeys = _.map(attributes, 'name');
    var attributeKeysWithHandler = _.intersection(converterKeys, attributeKeys);
    //TODO warn for the keys without a handler

    var attributeList = _.map(attributeKeysWithHandler, function(attributeKey) {
      return {
        name: attributeKey,
        value: attributes[attributeKey],
        //value: attributes[attributeKey],
        dependencyOrder: attributeDependencyOrder.indexOf(attributeKey),
      };
    });
    //*/

    var attributeList = [];
    _.forEach(attributes, function(attribute) {
      var attributeKey = attribute.name;
      if (converterKeys.indexOf(attributeKey) > -1) {
        attributeList.push({
          name: attributeKey,
          value: attribute.value,
          dependencyOrder: attributeDependencyOrder.indexOf(attributeKey),
        });
      }
    });
    if (attributeList.length > 1) {
      attributeList.sort(function(a, b) {
        return a.dependencyOrder - b.dependencyOrder;
      });
    }
    _(attributeList).forEach(function(attributeListItem) {
      converter[attributeListItem.name](attributeListItem.value);
    });
    return pvjsonElement;
  },


  // TODO get rid of some of this border style code. some of it is not being used.
  getBorderStyleNew: function(gpmlLineStyle) {

    // Double-lined EntityNodes will be handled by using a symbol with double lines.
    // Double-lined edges will be rendered as single-lined, solid edges, because we
    // shouldn't need double-lined edges other than for cell walls/membranes, which
    // should be symbols. Any double-lined edges are curation issues.

    var lineStyleToBorderStyleMapping = {
      'Solid':'solid',
      'Double':'solid',
      'Broken':'dashed'
    };
    var borderStyle = lineStyleToBorderStyleMapping[gpmlLineStyle];
    if (!!borderStyle) {
      return borderStyle;
    }
    else {
      console.warn('LineStyle "' + gpmlLineStyle + '" does not have a corresponding borderStyle. Using "solid"');
      return 'solid';
    }
  },

  getBorderStyle: function(gpmlLineStyle, pathvisioDefault) {

    // Double-lined EntityNodes will be handled by using a symbol with double lines.
    // Double-lined edges will be rendered as single-lined, solid edges, because we
    // shouldn't need double-lined edges other than for cell walls/membranes, which
    // should be symbols. Any double-lined edges are curation issues.

    var lineStyleToBorderStyleMapping = {
      'Solid':'solid',
      'Double':'solid',
      'Broken':'dashed'
    };
    var borderStyle;
    if (gpmlLineStyle !== pathvisioDefault) {
      if (!!gpmlLineStyle) {
        borderStyle = lineStyleToBorderStyleMapping[gpmlLineStyle];
        if (borderStyle) {
          return borderStyle;
        }
        else {
          console.warn('LineStyle "' + gpmlLineStyle + '" does not have a corresponding borderStyle. Using "solid"');
          return 'solid';
        }
      }
      else {
        return 'solid';
      }
    }
    else {

      // TODO use code to actually get the default

      return 'whatever the default value is';
    }
  },

  setBorderStyleAsJsonNew: function(jsonElement, currentGpmlLineStyleValue) {
    var borderStyle = this.getBorderStyleNew(currentGpmlLineStyleValue);
    jsonElement.borderStyle = borderStyle;
    return jsonElement;
  },

  setBorderStyleAsJson: function(jsonElement, currentGpmlLineStyleValue, defaultGpmlLineStyleValue) {
    var borderStyle;

    // this check happens twice because it doesn't make sense to have getBorderStyle() tell us
    // whether it has returned the default value, and we need to know whether we are using the
    // default here.

    if (currentGpmlLineStyleValue !== defaultGpmlLineStyleValue) {
      borderStyle = this.getBorderStyle(currentGpmlLineStyleValue, defaultGpmlLineStyleValue);
      jsonElement.borderStyle = borderStyle;
    }
    return jsonElement;
  }
};
