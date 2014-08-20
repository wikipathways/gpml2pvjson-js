'use strict';

var Strcase = require('tower-strcase')
  , _ = require('lodash')
  , RGBColor = require('rgbcolor')
  , GpmlUtilities = require('./gpml-utilities.js')
  ;

module.exports = {
  defaults: {
    'FontSize':{
      'Type':'FontSize',
      'Value':10
    }
  },

  toPvjson: function(pvjson, graphics, currentPvjsonClassElement, currentGpmlClassElement) {
    if (!pvjson || !graphics || !currentGpmlClassElement || !currentPvjsonClassElement) {
      throw new Error('Missing input element(s) in graphics.toPvjson()');
    }

    var attribute,
      i,
      gpmlDoubleLineProperty = '',
      graphicsDefaults = currentGpmlClassElement.Graphics,
      pvjsonHeight,
      pvjsonWidth,
      pvjsonBorderWidth,
      gpmlShapeType = '',
      pvjsonShape,
      pvjsonZIndex,
      pvjsonTextAlign,
      pvjsonVerticalAlign,
      pvjsonRelY,
      pvjsonX,
      pvjsonY
      ;

    var attributeDependencyOrder = [
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
      LineStyle: function(gpmlLineStyleValue){
        var pvjsonStrokeDasharray;
        // TODO hard-coding these here is not the most maintainable
        if (gpmlLineStyleValue === 'Broken') {
          pvjsonStrokeDasharray = '5,3';
          currentPvjsonClassElement.strokeDasharray = pvjsonStrokeDasharray;
        }
        else if (gpmlLineStyleValue === 'Double') {
          gpmlDoubleLineProperty = '-double';
          // The line below is left here for future reference, but after discussing with AP, the desired behavior is for the entire shape to be filled. -AR
          //currentPvjsonClassElement.fillRule = 'evenodd';
        }
        return pvjsonStrokeDasharray;
      },
      ShapeType: function(gpmlShapeTypeValue){
        gpmlShapeType = gpmlShapeTypeValue;
        pvjsonShape = Strcase.paramCase(gpmlShapeType) + gpmlDoubleLineProperty;
        currentPvjsonClassElement.shape = pvjsonShape;
        return pvjsonShape;
      },
      ConnectorType: function(gpmlConnectorTypeValue){
        var gpmlConnectorType = gpmlConnectorTypeValue;
        pvjsonShape = Strcase.paramCase('line-' + gpmlConnectorType) + gpmlDoubleLineProperty;
        currentPvjsonClassElement.shape = pvjsonShape;
        return pvjsonShape;
      },
      FillColor: function(gpmlFillColorValue){
        var cssColor = this.gpmlColorToCssColor(gpmlFillColorValue);
        if (gpmlShapeType.toLowerCase() !== 'none') {
          currentPvjsonClassElement.backgroundColor = cssColor;
        }
        else {
          currentPvjsonClassElement.backgroundColor = 'transparent';
        }
      },
      FillOpacity: function(gpmlFillOpacityValue){
        var cssFillOpacity = parseFloat(gpmlFillOpacityValue);
        currentPvjsonClassElement.fillOpacity = cssFillOpacity;
      },
      Color: function(gpmlColorValue){
        var cssColor = this.gpmlColorToCssColor(gpmlColorValue);
        currentPvjsonClassElement.color = cssColor;
      },
      Padding: function(gpmlPaddingValue){
        var cssPadding;
        if (_.isNumber(gpmlPaddingValue)) {
          cssPadding = parseFloat(gpmlPaddingValue);
        }
        else {
          cssPadding = gpmlPaddingValue;
        }
        currentPvjsonClassElement.padding = cssPadding;
      },
      FontSize: function(gpmlFontSizeValue){
        var cssFontSize;
        if (_.isNumber(gpmlFontSizeValue)) {
          cssFontSize = parseFloat(gpmlFontSizeValue);
        }
        else {
          cssFontSize = gpmlFontSizeValue;
        }
        currentPvjsonClassElement.fontSize = cssFontSize;
      },
      FontName: function(gpmlFontNameValue){
        var cssFontFamily = gpmlFontNameValue;
        currentPvjsonClassElement.fontFamily = cssFontFamily;
      },
      FontStyle: function(gpmlFontStyleValue){
        var cssFontStyle = gpmlFontStyleValue.toLowerCase();
        currentPvjsonClassElement.fontStyle = cssFontStyle;
      },
      FontWeight: function(gpmlFontWeightValue){
        var cssFontWeight = gpmlFontWeightValue.toLowerCase();
        currentPvjsonClassElement.fontWeight = cssFontWeight;
      },
      Rotation: function(gpmlRotationValue) {
        // GPML can hold a rotation value for State elements in an element named "Attribute" like this:
        // Key="org.pathvisio.core.StateRotation"
        // From discussion with AP and KH, we've decided to ignore this value, because we don't actually want States to be rotated.
        gpmlRotationValue = parseFloat(gpmlRotationValue);
        var pvjsonRotation = gpmlRotationValue * 180/Math.PI; //converting from radians to degrees
        currentPvjsonClassElement.rotation = pvjsonRotation;
        return pvjsonRotation;
      },
      LineThickness: function(gpmlLineThicknessValue) {
        pvjsonBorderWidth = parseFloat(gpmlLineThicknessValue);
        currentPvjsonClassElement.borderWidth = pvjsonBorderWidth;
        return pvjsonBorderWidth;
      },
      Position: function(gpmlPositionValue) {
        var pvjsonPosition = parseFloat(gpmlPositionValue);
        currentPvjsonClassElement.position = pvjsonPosition;
        return pvjsonPosition;
      },
      Width: function(gpmlWidthValue) {
        gpmlWidthValue = parseFloat(gpmlWidthValue);
        pvjsonWidth = gpmlWidthValue + pvjsonBorderWidth;
        currentPvjsonClassElement.width = pvjsonWidth;
        return pvjsonWidth;
      },
      Height: function(gpmlHeightValue) {
        gpmlHeightValue = parseFloat(gpmlHeightValue);
        pvjsonHeight = gpmlHeightValue + pvjsonBorderWidth;
        currentPvjsonClassElement.height = pvjsonHeight;
        return pvjsonHeight;
      },
      CenterX: function(gpmlCenterXValue) {
        gpmlCenterXValue = parseFloat(gpmlCenterXValue);
        pvjsonX = gpmlCenterXValue - pvjsonWidth/2;
        currentPvjsonClassElement.x = pvjsonX;
        return pvjsonX;
      },
      CenterY: function(gpmlCenterYValue) {
        gpmlCenterYValue = parseFloat(gpmlCenterYValue);
        pvjsonY = gpmlCenterYValue - pvjsonHeight/2;
        currentPvjsonClassElement.y = pvjsonY;
        return pvjsonY;
      },
      /*
      RelX: function(gpmlRelXValue) {
        var pvjsonRelX = parseFloat(gpmlRelXValue);
        currentPvjsonClassElement.relX = pvjsonRelX;
        parentElement = gpmlPathwaySelection.find('[GraphId=' + gpmlParentElement.attr('GraphRef') + ']');
        //if (parentElement.length < 1) throw new Error('cannot find parent');
        var parentCenterX = parseFloat(parentElement.find('Graphics').attr('CenterX'));
        var parentWidth = parseFloat(parentElement.find('Graphics').attr('Width'));
        var parentZIndex = parseFloat(parentElement.find('Graphics').attr('ZOrder'));
        var gpmlCenterXValue = parentCenterX + gpmlRelXValue * parentWidth/2;
        pvjsonX = gpmlCenterXValue - pvjsonWidth/2;
        currentPvjsonClassElement.x = pvjsonX || 0;
        currentPvjsonClassElement.zIndex = parentZIndex + 0.2 || 0;
        //pvjsonText.containerPadding = '0';
        //pvjsonText.fontSize = '10';
        return pvjsonX;
      },
      RelY: function(gpmlRelYValue) {
        var pvjsonRelY = parseFloat(gpmlRelYValue);
        currentPvjsonClassElement.relY = pvjsonRelY;
        var parentCenterY = parseFloat(parentElement.find('Graphics').attr('CenterY'));
        var parentHeight = parseFloat(parentElement.find('Graphics').attr('Height'));
        var elementCenterY = parentCenterY + pvjsonRelY * parentHeight/2;
        // TODO do we need to consider LineThickness (strokewidth) here?
        pvjsonY = elementCenterY - pvjsonHeight/2;
        currentPvjsonClassElement.y = pvjsonY || 0;
        // TODO this and other elements here are hacks
        //pvjsonText.containerY = pvjsonY + 12;
        return pvjsonY;
      },
      //*/
      Align: function(gpmlAlignValue) {
        pvjsonTextAlign = Strcase.paramCase(gpmlAlignValue);
        currentPvjsonClassElement.textAlign = pvjsonTextAlign;
        return pvjsonTextAlign;
      },
      Valign: function(gpmlValignValue) {
        pvjsonVerticalAlign = Strcase.paramCase(gpmlValignValue);
        currentPvjsonClassElement.verticalAlign = pvjsonVerticalAlign;
        return pvjsonVerticalAlign;
      },
      ZOrder: function(gpmlZOrderValue) {
        pvjsonZIndex = parseFloat(gpmlZOrderValue);
        currentPvjsonClassElement.zIndex = pvjsonZIndex;
        return pvjsonZIndex;
      },
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
      }
    };

    if (!!graphicsDefaults && !!graphicsDefaults.attributes) {
      _.defaults(graphics.attributes, graphicsDefaults.attributes);
    }

    currentPvjsonClassElement = GpmlUtilities.convertAttributesToJson(graphics, currentPvjsonClassElement, gpmlToPvjsonConverter, attributeDependencyOrder);
    return currentPvjsonClassElement;
  },

};
