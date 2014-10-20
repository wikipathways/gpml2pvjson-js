var GpmlUtilities = require('./gpml-utilities.js')
  ;

module.exports = {
  defaults: {
    attributes: {
      Padding: {
        name: 'Padding',
        value: '0.5em'
      },
      ShapeType: {
        name: 'ShapeType',
        value: 'Rectangle'
      },
      Color: {
        name: 'Color',
        value: '000000'
      },
      FillColor: {
        name: 'FillColor',
        value: 'ffffff'
      },
      FontSize: {
        name:'FontSize',
        value:10
      },
      LineThickness: {
        name: 'LineThickness',
        value: 1
      },
      Align: {
        name: 'Align',
        value: 'Center'
      },
      Valign: {
        name: 'Valign',
        value: 'Middle'
      }
    }
  },
  applyDefaults: function(gpmlElement, defaults) {
    gpmlElement = GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
    return gpmlElement;
  },
  toPvjson: function(pvjson, state) {

    var referencedNode = pvjson.elements.filter(function(element){
      return element.id === state.isAttachedTo;
    })[0];
    
    state.zIndex = referencedNode.zIndex + 0.2;

    return state;
  }

};
