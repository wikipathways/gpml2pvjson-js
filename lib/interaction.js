var _ = require('lodash');
var Anchor = require('./anchor.js');
var Graphics = require('./graphics.js');
var GpmlUtilities = require('./gpml-utilities.js');
var Point = require('./point.js');
var strcase = require('tower-strcase');
var utils = require('./utils.js');

var dereferenceElement = utils.dereferenceElement;

var biopaxEdgeTypes = utils.biopax.edgeTypes;
var biopaxNodeTypes = utils.biopax.nodeTypes;
var biopaxPhysicalEntityTypes = utils.biopax.physicalEntityTypes;
var biopaxTypes = utils.biopax.allTypes;

var markerNameToIdentifierMappings = {
  // NOTE we are inferring more specific type based on participant type(s)
  // as well as any controls on the interaction
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
      // ComplexAssembly is generally too highly specified
      // to accurately model the data in our average pathway,
      // but in some cases, it could be a more appropriate
      // mapping.
      name:'MolecularInteraction'
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
  },
  'none':{
    biopax:{
      name:'Interaction'
    },
    sbo:['SBO:0000374']
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
    var pvjson = args.pvjson;
    var pvjsonInteraction = args.pvjsonElement;
    var anchor;
    var points;
    var relationType;
    var targetId;
    var targetNode;
    var groupRef;
    var source;
    var sourceId;
    var sourceNode;

    var marker;
    if (pvjsonInteraction.markerStart) {
      marker = pvjsonInteraction.markerStart;
      // sometimes the graphical terminology (startMarker, endMarker) won't line up
      // with the graph terminology.
      sourceId = pvjsonInteraction.points[pvjsonInteraction.points.length - 1].isAttachedTo;
      targetId = pvjsonInteraction.points[0].isAttachedTo;
    } else if (pvjsonInteraction.markerEnd) {
      marker = pvjsonInteraction.markerEnd;
      sourceId = pvjsonInteraction.points[0].isAttachedTo;
      targetId = pvjsonInteraction.points[pvjsonInteraction.points.length - 1].isAttachedTo;
    } else {
      marker = 'none';
      sourceId = pvjsonInteraction.points[0].isAttachedTo;
      targetId = pvjsonInteraction.points[pvjsonInteraction.points.length - 1].isAttachedTo;
    }

    // this can be overridden with a more specific term below
    var biopaxType = 'Interaction';
    if (sourceId && targetId) {
      var elements = pvjson.elements;
      sourceNode = dereferenceElement(elements, sourceId);
      targetNode = dereferenceElement(elements, targetId);

      var markerStringCase = strcase.paramCase(marker);

      if (markerStringCase === 'arrow') {
        var sourceIsEdge = !!sourceNode.points;
        var targetIsEdge = !!targetNode.points;
        var sourceIsBiopaxPhysicalEntity = utils.isBiopaxType(
            biopaxPhysicalEntityTypes, sourceNode.type);
        var targetIsBiopaxPhysicalEntity = utils.isBiopaxType(
            biopaxPhysicalEntityTypes, targetNode.type);
        var sourceIsBiopaxPhysicalEntityOrPathway = sourceIsBiopaxPhysicalEntity ||
          utils.isBiopaxType(['Pathway'], sourceNode.type);
        var targetIsBiopaxPhysicalEntityOrPathway = targetIsBiopaxPhysicalEntity ||
          utils.isBiopaxType(['Pathway'], targetNode.type);
        //*
        if (sourceIsBiopaxPhysicalEntity && targetIsBiopaxPhysicalEntity) {
          // TODO is this a safe assumption? The resulting JSON will have a BioPAX
          // type of Conversion, which is a superclass for the closest BioPAX terms
          // to mim-cleavage and mim-binding.
          // The plain arrow could also theoretically represent mim-transcription-translation,
          // but our pathways use DataNodes of type GeneProduct to cover that. They don't
          // usually indicate Gene -> RNA -> Protein
          markerStringCase = 'mim-conversion';
        //*/
        } else if ((sourceIsEdge && targetIsBiopaxPhysicalEntityOrPathway) ||
                   (sourceIsBiopaxPhysicalEntityOrPathway && targetIsEdge)) {
          // TODO is this a safe assumption? It's unreasonable for it to be an inhibition.
          // If it's actually supposed to be a mim-catalysis or mim-necessary-stimulation
          // instead of a mim-stimulation, the resulting JSON will still not be exactly wrong,
          // because both mim-stimulation and mim-necessary-stimulation are mapped to
          // a BioPAX Control w/ controlType ACTIVATION, and Control is a superclass
          // of Catalysis.
          markerStringCase = 'mim-stimulation';
        }
      }

      var identifierMappings = markerNameToIdentifierMappings[markerStringCase];
      if (!!identifierMappings && !!identifierMappings.biopax && !!identifierMappings.biopax.name) {
        biopaxType = identifierMappings.biopax.name;
      }

      /* this below is an attempt to model interactions using named graphs
      pvjsonInteraction.relationGraph = [{
        id: sourceId,
        relation: targetId
      }];
      //*/

      // and this is an attempt to model interactions using Biopax
      // TODO still need to consider things like CovalentBindingFeature, etc.
      if (['Interaction', 'MolecularInteraction'].indexOf(biopaxType) > -1) {
        pvjsonInteraction.participant = [];
        pvjsonInteraction.participant.push(sourceId);
        pvjsonInteraction.participant.push(targetId);
        if (pvjsonInteraction.id === 'b8884') {
          console.log('pvjsonInteraction225');
          console.log(pvjsonInteraction);
          console.log('sourceId');
          console.log(sourceId);
          console.log('targetId');
          console.log(targetId);
          console.log('biopaxType');
          console.log(biopaxType);
        }
      } else if (['Control', 'Catalysis'].indexOf(biopaxType) > -1) {
        if (!!identifierMappings && !!identifierMappings.controlType) {
          pvjsonInteraction.controlType = identifierMappings.controlType;
        }
        pvjsonInteraction.controller = sourceId;
        pvjsonInteraction.controlled = targetId;
      } else if (['Conversion', 'BiochemicalReaction', 'Degradation'].indexOf(biopaxType) > -1) {
        // TODO this isn't actually checking the other marker to
        // make sure it also indicates conversion
        if (!!pvjsonInteraction.markerStart && !!pvjsonInteraction.markerEnd) {
          pvjsonInteraction.conversionDirection = 'REVERSIBLE';
        } else {
          pvjsonInteraction.conversionDirection = 'LEFT-TO-RIGHT';
        }
        pvjsonInteraction.left = sourceId;
        pvjsonInteraction.right = targetId;
      } else {
        pvjsonInteraction.participant = [];
        pvjsonInteraction.participant.push(sourceId);
        pvjsonInteraction.participant.push(targetId);
      }

      /*
      if (markerStringCase === 'mim-binding' || markerStringCase === 'mim-covalent-bond') {
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
