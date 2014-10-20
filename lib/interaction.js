var Graphics = require('./graphics.js')
  , GpmlUtilities = require('./gpml-utilities.js')
  , Point = require('./point.js')
  , strcase = require('tower-strcase')
  , Anchor = require('./anchor.js')
  , _ = require('lodash')
  ;

var markerNameToIdentifierMappings = {
  'arrow': {
    biopax:{
      name:'Interaction'
    },
    sbo:['SBO:0000167', 'SBO:0000393', 'SBO:0000394']
  },
  't-bar': {
    biopax:{
      name:'Control',
      controlType:'INHIBITION'
    },
    sbo:['SBO:0000169']
  },
  'mim-gap': { // are there Biopax and SBO mappings for this?
    biopax:{
      name:'Interaction'
    }
  },
  'mim-branching-right': { // are there Biopax and SBO mappings for this?
    biopax:{
      name:'Interaction'
    }
  },
  'mim-branching-left': { // are there Biopax and SBO mappings for this?
    biopax:{
      name:'Interaction'
    }
  },
  'mim-inhibition':{
    biopax:{
      name:'Control',
      controlType:'INHIBITION'
    },
    sbo:['SBO:0000169']
  },
  'mim-conversion':{
    biopax:{
      name:'Conversion'
    },
    sbo:['SBO:0000182']
  },
  'mim-necessary-stimulation':{
    biopax:{
      name:'Control',
      controlType:'ACTIVATION' // does anyone object?
    },
    sbo:['SBO:0000171']
  },
  'mim-binding':{
    biopax:{
      name:'MolecularInteraction' // what about ComplexAssembly?
    },
    sbo:['SBO:0000177'] // this is non-covalent binding in SBO
  },
  'mim-stimulation':{
    biopax:{
      name:'Control',
      controlType:'ACTIVATION' // does anyone object?
    },
    sbo:['SBO:0000170']
  },
  'mim-modification':{
    biopax:{
      name:'BiochemicalReaction'
    },
    sbo:['SBO:0000210']
  },
  'mim-catalysis':{
    biopax:{
      name:'Catalysis'
    },
    sbo:['SBO:0000172']
  },
  'mim-cleavage':{
    biopax:{
      name:'Degradation'
    },
    sbo:['SBO:0000178']
  },
  'mim-covalent-bond':{
    biopax:{
      name:'BiochemicalReaction'
    },
    sbo:['SBO:0000210'], // this doesn't exactly match, but it seems the closest
  },
  'mim-transcription-translation':{
    biopax:{
      name:'GeneticInteraction'
    },
    sbo:['SBO:0000183', 'SBO:0000184']
  }
};

module.exports = {
  defaults: {
    attributes: {
      Color: {
        name: 'Color',
        value: '000000'
      },
      ConnectorType: {
        name: 'ConnectorType',
        value: 'Straight'
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
  },
  applyDefaults: function(gpmlElement, defaults) {
    gpmlElement = GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
    return gpmlElement;
  },

  toPvjson: function(args) {
    var pvjson = args.pvjson
      , pvjsonInteraction = args.pvjsonElement
      , anchor
      , points
      , relationType
      , target
      , targetId
      , groupRef
      , source
      , sourceId
      ;

    var sourceNode, targetNode, marker;
    if (!!pvjsonInteraction.markerStart) {
      marker = pvjsonInteraction.markerStart;
      // sometimes the graphical terminology (startMarker, endMarker) won't line up with the graph terminology.
      sourceNode = pvjsonInteraction.points[pvjsonInteraction.points.length - 1].isAttachedTo;
      targetNode = pvjsonInteraction.points[0].isAttachedTo;
    } else if (!!pvjsonInteraction.markerEnd) {
      marker = pvjsonInteraction.markerEnd;
      sourceNode = pvjsonInteraction.points[0].isAttachedTo;
      targetNode = pvjsonInteraction.points[pvjsonInteraction.points.length - 1].isAttachedTo;
    }

    // this can be overridden with a more specific term below
    var biopaxType = 'Interaction';
    if (!!sourceNode && !!targetNode) {
      var markerInStringCase = strcase.paramCase(marker);
      var identifierMappings = markerNameToIdentifierMappings[markerInStringCase];
      if (!!identifierMappings && !!identifierMappings.biopax && !!identifierMappings.biopax.name) {
        biopaxType = identifierMappings.biopax.name;
      }

      /* this below is an attempt to model interactions using named graphs
      pvjsonInteraction.relationGraph = [{
        id: sourceNode,
        relation: targetNode
      }];
      //*/
      
      // and this is an attempt to model interactions using Biopax
      // TODO still need to consider things like CovalentBindingFeature, etc.
      if (biopaxType === 'Interaction' && !!identifierMappings && !!identifierMappings.controlType) {
        pvjsonInteraction.participants = [];
        pvjsonInteraction.participants.push(sourceNode);
        pvjsonInteraction.participants.push(targetNode);
      } else if (biopaxType === 'Control' || biopaxType === 'Catalysis') {
        if (!!identifierMappings && !!identifierMappings.controlType) {
          pvjsonInteraction.controlType = identifierMappings.controlType;
        }
        pvjsonInteraction.controller = sourceNode;
        pvjsonInteraction.controlled = targetNode;
      } else if (biopaxType === 'Conversion' || biopaxType === 'BiochemicalReaction') {
        if (!!pvjsonInteraction.markerStart && !!pvjsonInteraction.markerEnd) { // TODO this isn't actually checking the other marker to make sure it also indicates conversion
          pvjsonInteraction.conversionDirection = 'REVERSIBLE';
        } else {
          pvjsonInteraction.conversionDirection = 'LEFT-TO-RIGHT';
        }
        pvjsonInteraction.left = sourceNode;
        pvjsonInteraction.right = targetNode;
      } else {
        pvjsonInteraction.participants = [];
        pvjsonInteraction.participants.push(sourceNode);
        pvjsonInteraction.participants.push(targetNode);
      }

      /*
      if (markerInStringCase === 'mim-binding' || markerInStringCase === 'mim-covalent-bond') {
        // TODO something with entityFeature, BindingFeature, CovalentBindingFeature, bindsTo...
      }
      //*/

      if (!!identifierMappings && !!identifierMappings.sbo && identifierMappings.sbo.length > 0) {
        pvjsonInteraction.interactionType = identifierMappings.sbo;
      }
    } else {
      console.warn('Unconnected Interaction(s) present in this pathway.');
    }
    pvjsonInteraction.type = biopaxType;

    return pvjsonInteraction;

  }
};
