'use strict';

var _ = require('lodash')
  //, Anchor = require('./anchor.js')
  , Attribute = require('./attribute.js')
  , GpmlUtilities = require('./gpml-utilities.js')
  , He = require('he')
  , Point = require('./point.js')
  , Strcase = require('tower-strcase')
  , RGBColor = require('rgbcolor')
  , UnificationXref = require('./unification-xrefs.js')
  , uuid = require('uuid')
  ;

module.exports = {
  Pathway: require('./pathway'),
  Group: require('./group'),
  DataNode: require('./data-node'),
  GraphicalLine: require('./graphical-line'),
  Interaction: require('./interaction'),
  Label: require('./label'),
  Shape: require('./shape'),
  State: require('./state'),

  defaults: {
    attributes: {
      FillColor: {
        name: 'FillColor',
        value: 'ffffff'
      },
      GraphId: {
        name: 'GraphId',
        value: 'id'
      }
    }
  },

  applyDefaults: function(gpmlElement) {
    var tagName = gpmlElement.name;
    if (!!this[tagName]) {
      return this[tagName].applyDefaults(gpmlElement, this.defaults);
    } else {
      return GpmlUtilities.applyDefaults(gpmlElement, this.defaults);
    }
  },

  toPvjson: function(args) {
    var pvjson = args.pvjson
      , pvjsonElement = args.pvjsonElement
      , gpmlElement = args.gpmlElement
      , attribute
      , i
      , pvjsonHeight
      , pvjsonWidth
      , pvjsonStrokeWidth
      , pvjsonShape
      , pvjsonZIndex
      , pvjsonRelX
      , pvjsonRelY
      , pvjsonX
      , pvjsonY
      , pvjsonTextContent
      , pvjsonHref
      , tagName = gpmlElement.name
      , type
      , lineStyleIsDouble
      , pvjsonBorderWidth
      , pvjsonRotation
      , gpmlShapeType = ''
      , pvjsonTextAlign
      , pvjsonVerticalAlign
      , gpmlCenterX
      , gpmlCenterY
      , gpmlWidth
      , gpmlHeight
      , gpmlRotation
      , angleToControlPoint
      , correctionFactors
      , gpmlDatabase
      ;


    var attributeDependencyOrder = [
      'GroupId',
      'GraphId',
      'GraphRef',
      'GroupRef',
      'Name',
      'IsPartOf',
      'TextLabel',
      'Type',
      'CellularComponent',
      'Rotation',
      'LineStyle',
      'Shape',
      'ShapeType',
      'Attribute',
      'FillColor',
      'Color',
      'LineThickness',
      'Width',
      'Height',
      'RelX',
      'RelY',
      'CenterX',
      'CenterY',
      'ConnectorType',
      'Point',
      'Anchor',
      'Organism',
      'Database',
      'ID'
    ];

    var gpmlToPvjsonConverter = {
      Align: function(gpmlAlignValue) {
        pvjsonTextAlign = Strcase.paramCase(gpmlAlignValue);
        pvjsonElement.textAlign = pvjsonTextAlign;
      },
      /*
      Anchor: function(gpmlValue) {
        var that = this;
        gpmlValue.forEach(function(anchorElement) {
          pvjson.elements.push(Anchor.toPvjson({
            pvjsonEdge: pvjsonElement
            , anchorElement: anchorElement
            , gpmlToPvjsonConverter: that
          }));
        });
      },
      //*/
      Attribute: function(gpmlValue) {
        // NOTE: in GPML, 'Attribute' is an XML _ELEMENT_ with the tagName "Attribute."
        // We push all the Attribute elements that are children of the current target
        // element onto an array in JSON before reaching this step.
        gpmlValue.forEach(function(attributeElement) {
          pvjsonElement = Attribute.toPvjson({
            gpmlElement: gpmlElement
            , pvjsonElement: pvjsonElement
            , attributeElement: attributeElement
          });
        });
      },
      Author: function(gpmlValue){
        pvjsonElement.author = gpmlValue;
      },
      BiopaxRef: function(gpmlValue){
        pvjsonElement['gpml:BiopaxRef'] = gpmlValue;
      },
      BoardHeight: function(gpmlValue){
        pvjsonElement.image = pvjsonElement.image || {
          '@context': {
            '@vocab': 'http://schema.org/'
          }
        };
        pvjsonElement.image.height = parseFloat(gpmlValue);
      },
      BoardWidth: function(gpmlValue){
        pvjsonElement.image = pvjsonElement.image || {
          '@context': {
            '@vocab': 'http://schema.org/'
          }
        };
        pvjsonElement.image.width = parseFloat(gpmlValue);
      },
      CenterX: function(gpmlValue) {
        gpmlCenterX = parseFloat(gpmlValue);
        pvjsonX = gpmlCenterX - pvjsonWidth/2;

        if (!!correctionFactors) {
          angleToControlPoint = angleToControlPoint || 0;
          if (gpmlShapeType === 'Triangle') {
            var xCorrection = (correctionFactors.x) * Math.cos(angleToControlPoint) * gpmlWidth + (correctionFactors.y) * Math.sin(angleToControlPoint) * gpmlHeight;
            pvjsonX = (gpmlCenterX - gpmlWidth/2) + xCorrection;
          // TODO can we reuse the same code as for Triangle for the ones below? Analogous question for CenterY.
          } else if (gpmlShapeType === 'Arc') {
            pvjsonX += pvjsonHeight * Math.sin(angleToControlPoint);
          } else if (gpmlShapeType === 'Pentagon') {
            var correctedGpmlCenterX = gpmlCenterX + gpmlWidth * (1 - correctionFactors.width) / 2;
            pvjsonX = correctedGpmlCenterX - pvjsonWidth/2;
          }
        }

        pvjsonElement.x = pvjsonX;
      },
      CenterY: function(gpmlValue) {
        gpmlCenterY = parseFloat(gpmlValue);
        pvjsonY = gpmlCenterY - pvjsonHeight/2;

        if (!!correctionFactors) {
          if (gpmlShapeType === 'Triangle') {
            var distanceTriangleTipExtendsBeyondBBox = ((gpmlCenterX + (correctionFactors.x) * gpmlWidth - gpmlWidth/2) + pvjsonWidth) - (gpmlCenterX + gpmlWidth/2);
            var yCorrection = (-1) * distanceTriangleTipExtendsBeyondBBox * Math.sin(angleToControlPoint) + (correctionFactors.y) * Math.cos(angleToControlPoint) * gpmlHeight;
            pvjsonY = (gpmlCenterY - gpmlHeight/2) + yCorrection;
          } else if (gpmlShapeType === 'Arc') {
            pvjsonY += pvjsonHeight * Math.cos(angleToControlPoint);
          }
        }

        pvjsonElement.y = pvjsonY;
      },
      Color: function(gpmlColorValue){
        var cssColor = this.gpmlColorToCssColor(gpmlColorValue);
        pvjsonElement.color = cssColor;
      },
      Comment: function(gpmlValue){
        pvjsonElement['gpml:Comment'] = gpmlValue;
      },
      ConnectorType: function(gpmlConnectorTypeValue){
        var gpmlConnectorType = gpmlConnectorTypeValue;
        pvjsonShape = Strcase.paramCase('line-' + gpmlConnectorType);
        pvjsonElement.shape = pvjsonShape;
      },
      Database: function(gpmlValue){
        gpmlDatabase = gpmlValue;
      },
      'Data-Source': function(gpmlValue){
        pvjsonElement.dataSource = gpmlValue;
      },
      Email: function(gpmlValue){
        pvjsonElement.email = gpmlValue;
      },
      FillColor: function(gpmlFillColorValue){
        var cssColor = this.gpmlColorToCssColor(gpmlFillColorValue);
        if (gpmlShapeType.toLowerCase() !== 'none') {
          pvjsonElement.backgroundColor = cssColor;
        } else {
          pvjsonElement.backgroundColor = 'transparent';
        }
      },
      FillOpacity: function(gpmlFillOpacityValue){
        var cssFillOpacity = parseFloat(gpmlFillOpacityValue);
        pvjsonElement.fillOpacity = cssFillOpacity;
      },
      FontName: function(gpmlFontNameValue){
        var cssFontFamily = gpmlFontNameValue;
        pvjsonElement.fontFamily = cssFontFamily;
      },
      FontSize: function(gpmlFontSizeValue){
        var cssFontSize;
        if (_.isNumber(gpmlFontSizeValue)) {
          cssFontSize = parseFloat(gpmlFontSizeValue);
        } else {
          cssFontSize = gpmlFontSizeValue;
        }
        pvjsonElement.fontSize = cssFontSize;
      },
      FontStyle: function(gpmlFontStyleValue){
        var cssFontStyle = gpmlFontStyleValue.toLowerCase();
        pvjsonElement.fontStyle = cssFontStyle;
      },
      FontWeight: function(gpmlFontWeightValue){
        var cssFontWeight = gpmlFontWeightValue.toLowerCase();
        pvjsonElement.fontWeight = cssFontWeight;
      },
      GraphId: function(gpmlValue){
        // Default GraphId is set to be just 'id'. If it is just 'id', we
        // replace it with an actual value, because that means it wasn't set
        // in PathVisio-Java. The reason for keeping the 'id' in front of
        // the automatically generated uuid is that the uuid can start with
        // a number, which might cause problems when used as an id attribute
        // for an SVG document, so the 'id' ensure the id starts with a
        // non-number character.
        pvjsonElement.id = gpmlValue !== 'id' ? gpmlValue : 'id' + uuid.v1();
        /*
        var uuid = require('uuid')
        pvjsonElement.id = gpmlValue || uuid.v1();
        //*/
      },
      GraphRef: function(gpmlValue){
        pvjsonElement.isAttachedTo = gpmlValue;
      },
      GroupId: function(gpmlValue){
        pvjsonElement['gpml:GroupId'] = gpmlValue;
      },
      GroupRef: function(gpmlValue){
        pvjsonElement['gpml:GroupRef'] = gpmlValue;
        //pvjsonElement.isPartOf = gpmlValue;
      },
      Height: function(gpmlValue) {
        gpmlHeight = parseFloat(gpmlValue);
        if (!correctionFactors) {
          pvjsonHeight = gpmlHeight;
        } else {
          pvjsonHeight = gpmlHeight * correctionFactors.height;
        }
        pvjsonHeight = gpmlHeight + pvjsonBorderWidth;
        pvjsonElement.height = pvjsonHeight;
      },
      Href: function(gpmlHrefValue){
        pvjsonHref = encodeURI(He.decode(gpmlHrefValue));
        pvjsonElement.href = pvjsonHref;
      },
      ID: function(gpmlValue){
        var result = UnificationXref.toPvjson({
          pvjson: pvjson
          , gpmlElement: gpmlElement
          , pvjsonElement: pvjsonElement
          , xref: {
            Database: gpmlDatabase
            , ID: gpmlValue
          }
        });

        pvjson = result.pvjson;
        pvjsonElement = result.pvjsonElement || pvjsonElement;
      },
      'Last-Modified': function(gpmlValue){
        pvjsonElement.lastModified = gpmlValue;
      },
      License: function(gpmlValue){
        pvjsonElement.license = gpmlValue;
      },
      LineStyle: function(gpmlLineStyleValue){
        var pvjsonStrokeDasharray;
        // TODO hard-coding these here is not the most maintainable
        if (gpmlLineStyleValue === 'Broken') {
          pvjsonStrokeDasharray = '5,3';
          pvjsonElement.strokeDasharray = pvjsonStrokeDasharray;
        } else if (gpmlLineStyleValue === 'Double') {
          lineStyleIsDouble = true;
        }
      },
      LineThickness: function(gpmlLineThicknessValue) {
        pvjsonBorderWidth = parseFloat(gpmlLineThicknessValue);
        pvjsonElement.borderWidth = pvjsonBorderWidth;
      },
      Maintainer: function(gpmlValue){
        pvjsonElement.maintainer = gpmlValue;
      },
      Name: function(nameValue){
        var splitName = nameValue.split(' (');
        if (!!splitName && splitName.length === 2 && !!nameValue.match(/\(/g) && nameValue.match(/\(/g).length === 1 && !!nameValue.match(/\)/g) && nameValue.match(/\)/g).length === 1) {
          pvjsonElement.standardName = splitName[0];
          pvjsonElement.displayName = splitName[1].replace(')', '');
        } else {
          pvjsonElement.standardName = nameValue;
          pvjsonElement.displayName = nameValue;
        }
      },
      Organism: function(gpmlValue){
        pvjsonElement.organism = gpmlValue;
      },
      Padding: function(gpmlPaddingValue){
        var cssPadding;
        if (_.isNumber(gpmlPaddingValue)) {
          cssPadding = parseFloat(gpmlPaddingValue);
        } else {
          cssPadding = gpmlPaddingValue;
        }
        pvjsonElement.padding = cssPadding;
      },
      Point: function(gpmlValue) {
        // Saving this to fully convert once pvjson.elements is filled up.
        pvjsonElement['gpml:Point'] = gpmlValue;
        /*
        pvjsonElement = Point.toPvjson({
          pvjson: pvjson
          , pvjsonElement: pvjsonElement
          , pointElements: gpmlValue
        });
        //*/
      },
      Position: function(gpmlPositionValue) {
        var pvjsonPosition = parseFloat(gpmlPositionValue);
        pvjsonElement.position = pvjsonPosition;
      },
      RelX: function(gpmlValue) {
        var pvjsonRelX = parseFloat(gpmlValue);
        pvjsonElement.relX = pvjsonRelX;
      },
      RelY: function(gpmlValue) {
        var pvjsonRelY = parseFloat(gpmlValue);
        pvjsonElement.relY = pvjsonRelY;
      },
      /*
      RelX: function(gpmlRelXValue) {
        var pvjsonRelX = parseFloat(gpmlRelXValue);
        pvjsonElement.relX = pvjsonRelX;
        parentElement = gpmlPathwaySelection.find('[GraphId=' + gpmlParentElement.attr('GraphRef') + ']');
        //if (parentElement.length < 1) throw new Error('cannot find parent');
        var parentCenterX = parseFloat(parentElement.find('Graphics').attr('CenterX'));
        var parentWidth = parseFloat(parentElement.find('Graphics').attr('Width'));
        var parentZIndex = parseFloat(parentElement.find('Graphics').attr('ZOrder'));
        var gpmlCenterXValue = parentCenterX + gpmlRelXValue * parentWidth/2;
        pvjsonX = gpmlCenterXValue - pvjsonWidth/2;
        pvjsonElement.x = pvjsonX || 0;
        pvjsonElement.zIndex = parentZIndex + 0.2 || 0;
        //pvjsonText.containerPadding = '0';
        //pvjsonText.fontSize = '10';
        return pvjsonX;
      },
      RelY: function(gpmlRelYValue) {
        var pvjsonRelY = parseFloat(gpmlRelYValue);
        pvjsonElement.relY = pvjsonRelY;
        var parentCenterY = parseFloat(parentElement.find('Graphics').attr('CenterY'));
        var parentHeight = parseFloat(parentElement.find('Graphics').attr('Height'));
        var elementCenterY = parentCenterY + pvjsonRelY * parentHeight/2;
        // TODO do we need to consider LineThickness (strokewidth) here?
        pvjsonY = elementCenterY - pvjsonHeight/2;
        pvjsonElement.y = pvjsonY || 0;
        // TODO this and other elements here are hacks
        //pvjsonText.containerY = pvjsonY + 12;
        return pvjsonY;
      },
      //*/
      Rotation: function(gpmlValue) {
        // GPML can hold a rotation value for State elements in an element named "Attribute" like this:
        // Key="org.pathvisio.core.StateRotation"
        // From discussion with AP and KH, we've decided to ignore this value, because we don't actually want States to be rotated.

        gpmlRotation = parseFloat(gpmlValue);

        // GPML saves rotation in radians, even though PathVisio-Java displays rotation in degrees.
        // converting from radians to degrees
        pvjsonRotation = gpmlRotation * 180/Math.PI;
        if (gpmlRotation !== 0) {
          pvjsonElement.rotation = pvjsonRotation;
        }

        // This conversion changes the rotation to reflect the angle between the green rotation control dot in PathVisio-Java and the X-axis.
        // The units are radians, unlike the units for pvjsonRotation.
        var angleToControlPoint = 2 * Math.PI - gpmlRotation;
      },
      ShapeType: function(gpmlValue){
        gpmlShapeType = gpmlValue;
        // most graphics libraries use the term 'ellipse', so we're converting
        // the GPML terms 'Oval' and 'Circle' to match
        if (gpmlValue === 'Oval' || gpmlValue === 'Circle') {
          pvjsonShape = 'Ellipse';
        } else {
          pvjsonShape = gpmlValue;
        }

        // Note: if the LineStyle is "Double," then "-double" will be
        // appended to pvjsonElement.shape when "Attributes" are handled.

        pvjsonShape = Strcase.paramCase(pvjsonShape);
        pvjsonElement.shape = pvjsonShape;
      },
      //Shape: this.ShapeType,
      Style: function(gpmlValue){
        // This code handles 'Style' attributes for GPML 'Group' elements
        // It uses Biopax terms when possible, otherwise GPML.
        // Note that Biopax is the default namespace in JSON-LD for jsonpv,
        // so if a namespace is not specified below, there is an implied "bp:" preceding the term
        var gpmlToSemanticMappings = {
          'gpml:Group': 'gpml:Group',
          'gpml:Complex': 'Complex',
          'gpml:Pathway': 'Pathway'
        };
        pvjsonElement['gpml:Style'] = 'gpml:' + gpmlValue;
        var type = gpmlToSemanticMappings[ pvjsonElement['gpml:Style'] ] || 'gpml:Group';
        pvjsonElement.type = type;
      },
      TextLabel: function(gpmlTextLabelValue){
        pvjsonTextContent = He.decode(gpmlTextLabelValue);
        pvjsonElement.textContent = pvjsonTextContent;
      },
      Type: function(gpmlTypeValue){
        pvjsonElement['gpml:Type'] = 'gpml:' + gpmlTypeValue;
      },
      Valign: function(gpmlValignValue) {
        pvjsonVerticalAlign = Strcase.paramCase(gpmlValignValue);
        pvjsonElement.verticalAlign = pvjsonVerticalAlign;
      },
      Version: function(gpmlValue){
        pvjsonElement.idVersion = gpmlValue;
      },
      Width: function(gpmlValue) {
        gpmlWidth = parseFloat(gpmlValue);
        correctionFactors = this.correctionFactors[gpmlShapeType];
        if (!correctionFactors) {
          pvjsonWidth = gpmlWidth;
        } else {
          pvjsonWidth = gpmlWidth * (correctionFactors.width);
        }
        pvjsonWidth = gpmlWidth + pvjsonBorderWidth;
        pvjsonElement.width = pvjsonWidth;
      },
      ZOrder: function(gpmlZOrderValue) {
        pvjsonZIndex = parseFloat(gpmlZOrderValue);
        pvjsonElement.zIndex = pvjsonZIndex;
      },
      // everything below in this object: helper values/functions
      gpmlColorToCssColor: function(gpmlColor) {
        var color;
        if (gpmlColor.toLowerCase() === 'transparent') {
          return 'transparent';
        } else {
          color = new RGBColor(gpmlColor);
          if (color.ok) {
            return color.toHex();
          } else {
            console.warn('Could not convert GPML Color value of "' + gpmlColor + '" to a valid CSS color. Using "#c0c0c0" as a fallback.');
            return '#c0c0c0';
          }
        }
      },
      // Some shapes have GPML values that do not match what is visually displayed in PathVisio-Java.
      // Below are correct factors for the GPML so that the display in pathvisiojs will match the display in PathVisio-Java.
      //
      // NOTE: If you create an entry in correctionFactors, fill in all the values (x, y, width and height),
      // using default values if needed. A default value is used when no correction is needed for a given property.
      // These are the default values for each property:
      // {
      //    x: 0,
      //    y: 0,
      //    width: 1,
      //    height: 1
      // }
      // TODO: add an entry for sarcoplasmic reticulum
      correctionFactors: {
        Arc: {
          x: 0,
          y: 0,
          width: 1,
          height: 0.5
        },
        Triangle: {
          x: 0.311,
          y: 0.07,
          width: 0.938,
          height: 0.868
        },
        Pentagon: {
          x: 0,
          y: 0,
          width: 0.904,
          height: 0.95
        },
        Hexagon: {
          x: 0,
          y: 0,
          width: 1,
          height: 0.88 
        }
      }
    };

    gpmlToPvjsonConverter.Shape = gpmlToPvjsonConverter.ShapeType;

    pvjsonElement = GpmlUtilities.convertAttributesToJson(gpmlElement, pvjsonElement, gpmlToPvjsonConverter, attributeDependencyOrder);
    pvjsonElement['gpml:element'] = 'gpml:' + gpmlElement.name;

    if (gpmlElement.name !== 'Pathway') {
      pvjson.elements.push(pvjsonElement);
    } else {
      pvjson = pvjsonElement;
    }

    return pvjson;
  }
};

