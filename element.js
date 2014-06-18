'use strict';

var BiopaxRef = require('./biopax-ref.js')
  , He = require('he')
  , _ = require('lodash')
  , cheerio = require('cheerio')
  , Strcase = require('tower-strcase')
  ;

// ...element includes all GPML elements and is the parent of both ...node and ...edge.
module.exports = {
  toPvjson: function(pvjson, gpmlSelection, elementSelection, pvjsonElement, callback) {
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
    /*
    var tagNameToBiopaxMappings = {
      'Interaction':'Interaction'
    };
    var biopaxType = tagNameToBiopaxMappings[tagName];
    if (!!biopaxType) {
      pvjsonElement.type = pvjsonElement.type || [];
      pvjsonElement.type.push(biopaxType);
    }
    //*/

    pvjsonElement['gpml:element'] = 'gpml:' + tagName;

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
        // Not sure about the above comment, but we should have globally unique element ids if we expand the id to include the pathway id, e.g.,
        // element "abc123" in pathway WP1 would have the globally unique id "http://identifiers.org/wikipathways/WP525/abc123"
        // this expansion can be done with JSON-LD as jsonld.expand();
        pvjsonElement.elementId = gpmlGraphIdValue;
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
        pvjsonElement['gpml:Type'] = 'gpml:' + gpmlTypeValue;
        return gpmlTypeValue;
      },
      CellularComponent: function(gpmlCellularComponentValue){
        pvjsonElement.type = pvjsonElement.type || [];
        pvjsonElement.type.push('PhysicalEntity');
        pvjsonElement.type.push('CellularComponent');
        pvjsonElement.entityReference = gpmlCellularComponentValue;
        return gpmlCellularComponentValue;
      },
      IsPartOf: function(gpmlIsPartOfValue){
        pvjsonElement.isPartOf = gpmlIsPartOfValue;
        return gpmlIsPartOfValue;
      },
      GraphRef: function(gpmlGraphRefValue){
        pvjsonElement.isAttachedTo = gpmlGraphRefValue;
        return gpmlGraphRefValue;
      },
    };

    var gpmlToPvjsonConverterKeys = _.keys(gpmlToPvjsonConverter);
    var attributeKeys = _.keys(elementSelection[0].attribs);
    var attributeKeysWithHandler = _.intersection(gpmlToPvjsonConverterKeys, attributeKeys);
    //TODO warn for the keys without a handler

    var biopaxRefsSelection = elementSelection.find('BiopaxRef');
    // TODO don't repeat this code with the same code in gpml.js
    if (biopaxRefsSelection.length > 0) {
      pvjsonElement.xrefs = pvjsonElement.xrefs || [];
      biopaxRefsSelection.each(function() {
        var biopaxRefSelection = $( this );
        var biopaxRefIdUsed = biopaxRefSelection.text();
        var biopaxRefId = pvjson.graph.filter(function(entity) {
          var entityId = entity.deprecatedId || entity.id;
          return entityId === biopaxRefIdUsed;
        })[0].elementId;
        pvjsonElement.xrefs.push(biopaxRefId);
      });
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

    /*
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
    //*/
  }
};
