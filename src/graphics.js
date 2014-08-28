'use strict';

var Strcase = require('tower-strcase')
  , _ = require('lodash')
  , RGBColor = require('rgbcolor')
  , GpmlUtilities = require('./gpml-utilities.js')
  ;

module.exports = {
  toPvjson: function(graphics, currentClassLevelPvjsonAndGpmlElements) {
    var pvjsonElement = currentClassLevelPvjsonAndGpmlElements.pvjsonElement
      , gpmlElement = currentClassLevelPvjsonAndGpmlElements.gpmlElement
      ;

    if (!graphics || !gpmlElement || !pvjsonElement) {
      throw new Error('Missing input element(s) in graphics.toPvjson()');
    }

    var attribute,
      i,
      lineStyleIsDouble,
      pvjsonHeight,
      pvjsonWidth,
      pvjsonBorderWidth,
      pvjsonRotation,
      gpmlShapeType = '',
      pvjsonShape,
      pvjsonZIndex,
      pvjsonTextAlign,
      pvjsonVerticalAlign,
      pvjsonRelY,
      pvjsonX,
      pvjsonY,
      gpmlCenterX,
      gpmlCenterY,
      gpmlWidth,
      gpmlHeight,
      gpmlRotation,
      angleToControlPoint,
      correctionFactors
      ;

    var attributeDependencyOrder = [
      'Rotation',
      'LineStyle',
      'ShapeType',
      'FillColor',
      'Color',
      'LineThickness',
      'Width',
      'Height',
      'RelX',
      'RelY',
      'CenterX',
      'CenterY'
    ];

    var gpmlToPvjsonConverter = {
      Align: function(gpmlAlignValue) {
        pvjsonTextAlign = Strcase.paramCase(gpmlAlignValue);
        pvjsonElement.textAlign = pvjsonTextAlign;
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
      ConnectorType: function(gpmlConnectorTypeValue){
        var gpmlConnectorType = gpmlConnectorTypeValue;
        pvjsonShape = Strcase.paramCase('line-' + gpmlConnectorType);
        pvjsonElement.shape = pvjsonShape;
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
      Padding: function(gpmlPaddingValue){
        var cssPadding;
        if (_.isNumber(gpmlPaddingValue)) {
          cssPadding = parseFloat(gpmlPaddingValue);
        } else {
          cssPadding = gpmlPaddingValue;
        }
        pvjsonElement.padding = cssPadding;
      },
      Position: function(gpmlPositionValue) {
        var pvjsonPosition = parseFloat(gpmlPositionValue);
        pvjsonElement.position = pvjsonPosition;
      },
      ShapeType: function(gpmlValue){
        gpmlShapeType = gpmlValue;
        // most graphics libraries use 'ellipse', so we're converting
        // the GPML's term 'Oval' to be consistent with them
        if (gpmlValue !== 'Oval') {
          pvjsonShape = gpmlValue;
        } else {
          pvjsonShape = 'Ellipse';
        }
        pvjsonShape = !lineStyleIsDouble ? pvjsonShape : pvjsonShape + '-double';
        pvjsonShape = Strcase.paramCase(pvjsonShape);
        pvjsonElement.shape = pvjsonShape;
      },
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
      Valign: function(gpmlValignValue) {
        pvjsonVerticalAlign = Strcase.paramCase(gpmlValignValue);
        pvjsonElement.verticalAlign = pvjsonVerticalAlign;
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

    pvjsonElement = GpmlUtilities.convertAttributesToJson(graphics, pvjsonElement, gpmlToPvjsonConverter, attributeDependencyOrder);

    var result = {};
    result.pvjsonElement = pvjsonElement;
    result.gpmlElement = gpmlElement;
    return result;
  }

};
