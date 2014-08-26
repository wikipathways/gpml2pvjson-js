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
  extendDefaults: function(gpmlElement, defaults) {
    return gpmlElement;
  },

  applyDefaults: function(gpmlElement, defaultsArray) {
    //*
    console.log('defaultsArray');
    console.log(defaultsArray);
    //*/
    var defaultsArrayClone = _.cloneDeep(defaultsArray);
    // from http://lodash.com/docs#partialRight
    var defaultsDeep = _.partialRight(_.merge, function deep(value, other) {
      return _.merge(value, other, deep);
    });
    return _.reduce(defaultsArrayClone, function(accumulator, defaults) {
      return defaultsDeep(accumulator, defaults);
    }, gpmlElement);
  },

  convertAttributesToJson: function(gpmlElement, pvjsonElement, converter, attributeDependencyOrder) {
    var converterKeys = _.keys(converter);
    var attributeList, attributes;
    /*
    console.log('gpmlElement');
    console.log(gpmlElement);
    //*/
    attributes = gpmlElement.attributes;
    var attributeKeys = _.keys(attributes);
    var handledAttributeKeys = _.intersection(converterKeys, attributeKeys);
    console.log('handledAttributeKeys');
    console.log(handledAttributeKeys);
    if (handledAttributeKeys.length < attributes.length) {
      var unhandledAttributeKeys = _.difference(converterKeys, attributeKeys);
      console.warn('No handler for attribute(s) "' + unhandledAttributeKeys.join(', ') + '" for element "' + gpmlElement.name + '"');
    }

    attributeList = _.map(handledAttributeKeys, function(attributeKey) {
      return {
        name: attributeKey,
        value: attributes[attributeKey].value,
        dependencyOrder: attributeDependencyOrder.indexOf(attributeKey),
      };
    });

    if (!!attributeList && attributeList.length > 0) {
      if (attributeList.length > 1) {
        attributeList.sort(function(a, b) {
          return a.dependencyOrder - b.dependencyOrder;
        })
        .filter(function(attribute) {
          return typeof attribute.value !== 'undefined' && !isNaN(attribute.value) && attribute.value !== null;
        });
      }
      console.log('attributeList');
      console.log(attributeList);
      _(attributeList).forEach(function(attributeListItem) {
        converter[attributeListItem.name](attributeListItem.value);
      });
    }
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
