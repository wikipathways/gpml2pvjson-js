'use strict';

var BiopaxRef = require('./biopax-ref.js')
  , He = require('he')
  , _ = require('lodash')
  , cheerio = require('cheerio')
  , Strcase = require('tower-strcase')
  ;

// ...element includes all GPML elements and is the parent of both ...node and ...edge.
module.exports = {
  /* I think these can all be deleted - AR
  gpmlColorToCssColor: function(gpmlColor, pathvisioDefault) {
    var color;
    if (gpmlColor !== pathvisioDefault) {
      if (!!gpmlColor) {
        color = new RGBColor(gpmlColor);
        if (color.ok) {
          return color.toHex();
        }
        else {
          return 'black';
        }
      }
      else {
        return 'black';
      }
    }
    else {
      return null;
    }
  },

  setColorAsJson: function(jsonElement, currentGpmlColorValue, defaultGpmlColorValue) {
    var jsonColor;
    if (currentGpmlColorValue !== defaultGpmlColorValue) {
      jsonColor = this.gpmlColorToCssColor(currentGpmlColorValue, defaultGpmlColorValue);
      jsonElement.color = jsonColor;
      jsonElement.borderColor = jsonColor;
      if (jsonElement.hasOwnProperty('text')) {
        jsonElement.text.color = jsonColor;
      }
    }
    return jsonElement;
  },

  // TODO can we delete this function?
  getLineStyle: function(gpmlElement) {
    var LineStyle, attributes;
    var graphics = gpmlElement.select('Graphics');
    if (!!graphics) {
      LineStyle = graphics.attr('LineStyle');
      if (!!LineStyle) {
        return LineStyle;
      }
      else {

        // As currently specified, a given element can only have one LineStyle.
        // This one LineStyle can be solid, dashed (broken) or double.
        // If no value is specified in GPML for LineStyle, then we need to check
        // for whether the element has LineStyle of double.

        attributes = gpmlElement.selectAll('Attribute');
        if (attributes.length > 0) {
          LineStyle = attributes.filter(function(d, i) {
            return d3.select(this).attr('Key') === 'org.pathvisiojs.DoubleLineProperty' && d3.select(this).attr('Value') === 'Double';
          });

          if (LineStyle[0].length > 0) {
            return 'double';
          }
          else {
            return null;
          }
        }
        else {
          return null;
        }
      }
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
  //*/

  //*
  toPvjson: function(pvjs, gpmlSelection, elementSelection, pvjsonElement, callback) {
    var attribute
      , i
      , pvjsonHeight
      , pvjsonWidth
      , pvjsonStrokeWidth
      , gpmlShapeType
      , pvjsonShape
      , pvjsonZIndex
      , pvjsonRelX
      , pvjsonRelY
      , pvjsonX
      , pvjsonY
      , pvjsonTextContent
      , pvjsonHref
      , type
      ;

    var tagName = elementSelection[0].name;
    var tagNameToBiopaxMappings = {
      'Interaction':'Interaction'
    };
    var biopaxType = tagNameToBiopaxMappings[tagName];
    if (!!biopaxType) {
      type = biopaxType;
    } else {
      type = 'gpml:' + tagName;
    }
    pvjsonElement['type'] = pvjsonElement['type'] || [];
    pvjsonElement['type'].push(type);

    var attributeDependencyOrder = [
      'GraphId',
      'GraphRef',
      'IsPartOf',
      'TextLabel',
      'Type',
      'CellularComponent'
    ];

    var gpmlToPvjsonConverter = {
      GraphId: function(gpmlGraphIdValue){
        // TODO this is a hack so we don't have two items with the same ID while I'm building out the code to create the flattened data structure
        pvjsonElement.id = gpmlGraphIdValue;
        return gpmlGraphIdValue;
      },
      Style: function(gpmlStyleValue){
        pvjsonElement.groupStyle = gpmlStyleValue;
        return gpmlStyleValue;
      },
      Href: function(gpmlHrefValue){
        pvjsonHref = encodeURI(He.decode(gpmlHrefValue));
        pvjsonElement.href = pvjsonHref;
        return pvjsonHref;
      },
      TextLabel: function(gpmlTextLabelValue){
        pvjsonTextContent = He.decode(gpmlTextLabelValue);
        pvjsonElement.textContent = pvjsonTextContent;
        return pvjsonTextContent;
      },
      Type: function(gpmlTypeValue){
        pvjsonElement.type = pvjsonElement.type || [];
        pvjsonElement.type.push('gpml:' + gpmlTypeValue);
        return gpmlTypeValue;
      },
      CellularComponent: function(gpmlCellularComponentValue){
        pvjsonElement.cellularLocation = gpmlCellularComponentValue;
        return gpmlCellularComponentValue;
      },
      IsPartOf: function(gpmlIsPartOfValue){
        pvjsonElement.isPartOf = gpmlIsPartOfValue;
        return gpmlIsPartOfValue;
      },
      GraphRef: function(gpmlGraphRefValue){
        pvjsonElement.references = gpmlGraphRefValue;
        return gpmlGraphRefValue;
      },
    };

    var gpmlToPvjsonConverterKeys = _.keys(gpmlToPvjsonConverter);
    var attributeKeys = _.keys(elementSelection[0].attribs);
    var attributeKeysWithHandler = _.intersection(gpmlToPvjsonConverterKeys, attributeKeys);
      //TODO warn for the keys without a handler

    BiopaxRef.getAllAsPvjson(elementSelection, function(publicationXrefs) {
      if (!!publicationXrefs) {
        pvjsonElement.publicationXrefs = publicationXrefs;
      }
      var attributeList = _.map(attributeKeysWithHandler, function(attributeKey) {
        return {
          name: attributeKey,
          value: elementSelection[0].attribs[attributeKey],
          dependencyOrder: attributeDependencyOrder.indexOf(attributeKey),
        };
      });
      attributeList.sort(function(a, b) {
        return a.dependencyOrder - b.dependencyOrder;
      });
      var attributeListItemName;
      _(attributeList).forEach(function(attributeListItem) {
        gpmlToPvjsonConverter[attributeListItem.name](attributeListItem.value);
      });
      callback(pvjsonElement);
    });
  }
};
