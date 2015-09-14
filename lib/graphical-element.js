'use strict';

var BiopaxRef = require('./biopax-ref.js')
  , He = require('he')
  , Strcase = require('tower-strcase')
  , GpmlUtilities = require('./gpml-utilities.js')
  ;

// ...element includes all GPML elements and is the parent of both ...node and ...edge.
module.exports = {
  defaults: {
    Graphics: {
      attributes: {
        Color: {
          name: 'Color',
          value: '000000'
        },
        FillColor: {
          name: 'FillColor',
          value: 'Transparent'
        },
        LineThickness: {
          name: 'LineThickness',
          value: 1
        }
      }
    }
  },

  toPvjson: function(gpmlElement) {
    var attribute
      , i
      , pvjsonElement = {}
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

    var tagName = gpmlElement.name;
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
        pvjsonElement.id = gpmlGraphIdValue;
        return gpmlGraphIdValue;
      },
      Style: function(gpmlStyleValue){
        pvjsonElement['gpml:Style'] = 'gpml:' + gpmlStyleValue;
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
        //pvjsonElement.type = 'PhysicalEntity'; // this is probably more valid as Biopax
        pvjsonElement.type = 'CellularComponent'; // this is not valid Biopax
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

    /*
    var biopaxRefsSelection = gpmlElement.find('BiopaxRef');
    // TODO don't repeat this code with the same code in gpml.js
    if (biopaxRefsSelection.length > 0) {
      pvjsonElement.xref = pvjsonElement.xref || [];
      biopaxRefsSelection.each(function() {
        var biopaxRefSelection = $( this );
        var biopaxRefIdUsed = biopaxRefSelection.text();
        var biopaxRef = pvjson.elements.filter(function(element) {
          var elementId = element.deprecatedId || element.id;
          return elementId === biopaxRefIdUsed;
        })[0];
        if (!!biopaxRef && typeof(biopaxRef.id) !== 'undefined') {
          pvjsonElement.xref.push(biopaxRef.id);
        }
      });
    }
    //*/

    pvjsonElement = GpmlUtilities.convertAttributesToJson(gpmlElement, pvjsonElement, gpmlToPvjsonConverter, attributeDependencyOrder);
    gpmlElement = GpmlUtilities.extendDefaults(gpmlElement, this.defaults);
    console.log('pvjsonElement');
    console.log(pvjsonElement);

    return {
      pvjsonElement:pvjsonElement
      , gpmlElement:gpmlElement
    };
  }
};
