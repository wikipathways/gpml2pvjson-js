import { cloneDeep, defaultsDeep, difference, find, flatten, intersection, isArray, isEmpty, keys, map, reduce, toPairs, union } from 'lodash';
import { applyDefaults as baseApplyDefaults, intersectsLSV, unionLSV } from './gpml-utilities';

let INTERACTION_DEFAULTS = {
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
};

const biopaxPhysicalEntityTypes = [
  'Protein',
  'Dna',
  'Rna',
  'SmallMolecule',
  'Gene',
  'PhysicalEntity',
  'Complex'
];
const biopaxPhysicalEntityTypesPrefixed = biopaxPhysicalEntityTypes.map(x => 'biopax:' + x);

const biopaxNodeTypes = biopaxPhysicalEntityTypes.concat([
  'PublicationXref',
  'UnificationXref',
  'RelationshipXref',
  'ProteinReference',
  'DnaReference',
  'RnaReference',
  'SmallMoleculeReference',
  'Pathway'
]);
const biopaxNodeTypesPrefixed = biopaxNodeTypes.map(x => 'biopax:' + x);

const markerNameToIdentifierMappings = {
  // NOTE we are inferring more specific type based on participant type(s)
  // as well as any controls on the interaction
  Arrow: {
    biopax: {
      name: 'Interaction'
    },
    sbo: ['SBO:0000167', 'SBO:0000393', 'SBO:0000394'],
		wp: 'DirectedInteraction', // TODO is there a better match?
  },
  TBar: {
    biopax:{
      name:'Control',
      controlType:'INHIBITION'
    },
    sbo:['SBO:0000169'],
		wp: 'Inhibition',
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
    sbo:['SBO:0000169'],
		wp: 'Inhibition',
  },
  'mim-conversion':{
    biopax:{
      name:'Conversion'
    },
    sbo:['SBO:0000182'],
		wp: 'Conversion',
  },
  'mim-necessary-stimulation':{
    biopax:{
      name:'Control',
      controlType:'ACTIVATION' // does anyone object?
    },
    sbo:['SBO:0000171'],
		wp: 'Stimulation',
  },
  'mim-binding':{
    biopax:{
      // ComplexAssembly is generally too highly specified
      // to accurately model the data in our average pathway,
      // but in some cases, it could be a more appropriate
      // mapping.
      name:'MolecularInteraction'
    },
    sbo:['SBO:0000177'], // this is non-covalent binding in SBO
		wp: 'Binding',
  },
  'mim-stimulation':{
    biopax:{
      name:'Control',
      controlType:'ACTIVATION' // does anyone object?
    },
    sbo:['SBO:0000170'],
		wp: 'Stimulation',
  },
  'mim-modification':{
    biopax:{
      name: 'BiochemicalReaction'
    },
    sbo:['SBO:0000210'],
		wp: 'DirectedInteraction', // TODO is there a better match?
  },
  'mim-catalysis':{
    biopax:{
      name:'Catalysis'
    },
    sbo:['SBO:0000172'],
		wp: 'Catalysis',
  },
  'mim-cleavage':{
    biopax:{
      name:'Degradation'
    },
    sbo:['SBO:0000178'],
		wp: 'DirectedInteraction', // TODO is there a better match?
  },
  'mim-covalent-bond':{
    biopax:{
      name:'BiochemicalReaction'
    },
    sbo:['SBO:0000210'], // this doesn't exactly match, but it seems the closest
		wp: 'DirectedInteraction', // TODO is there a better match?
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
    sbo:['SBO:0000374'],
		wp: 'TranscriptionTranslation',
  }
};

export function applyDefaults(gpmlElement, defaults) {
	gpmlElement = baseApplyDefaults(gpmlElement, [INTERACTION_DEFAULTS, defaults]);
	return gpmlElement;
};

function convertConversionToGenericInteraction(interaction) {
	console.warn('This Conversion fails BioPAX validator:)');
	console.warn(interaction);
	interaction.type = ['Interaction'];
	interaction.participant = [interaction.left, interaction.right];
	delete interaction.left;
	delete interaction.right;
	delete interaction.conversionDirection;
	delete interaction.sboInteractionType;
	delete interaction.wpInteractionType;
	return interaction;
}

function convertCatalysisToGenericInteraction(interaction) {
	console.warn('This Catalysis fails BioPAX validator:)');
	console.warn(interaction);
	interaction.type = ['Interaction'];
	interaction.participant = [interaction.controlled, interaction.controller];
	delete interaction.controlled;
	delete interaction.controller;
	delete interaction.interactionType;
	return interaction;
}

export function postProcess(data, interaction) {
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
	if (interaction.markerStart) {
		marker = interaction.markerStart;
		// sometimes the graphical terminology (startMarker, endMarker) won't line up
		// with the graph terminology.
		sourceId = interaction.points[interaction.points.length - 1].isAttachedTo;
		targetId = interaction.points[0].isAttachedTo;
	} else if (interaction.markerEnd) {
		marker = interaction.markerEnd;
		sourceId = interaction.points[0].isAttachedTo;
		targetId = interaction.points[interaction.points.length - 1].isAttachedTo;
	} else {
		marker = 'none';
		sourceId = interaction.points[0].isAttachedTo;
		targetId = interaction.points[interaction.points.length - 1].isAttachedTo;
	}

	// this can be overridden with a more specific term below

	let elementMap = data.elementMap;

	if (!sourceId || !targetId) {
		console.warn('Unconnected Interaction(s) present in this pathway.');
		return interaction;
	}

	var elements = data.elements;
	sourceNode = elementMap[sourceId];
	targetNode = elementMap[targetId];

	if (marker === 'Arrow') {
		var sourceIsEdge = !!sourceNode.points;
		var targetIsEdge = !!targetNode.points;
		var sourceIsBiopaxPhysicalEntity = intersectsLSV(
				biopaxPhysicalEntityTypesPrefixed,
				sourceNode.type
		);
		var targetIsBiopaxPhysicalEntity = intersectsLSV(
				biopaxPhysicalEntityTypesPrefixed,
				targetNode.type
		);
		var sourceIsBiopaxPhysicalEntityOrPathway = sourceIsBiopaxPhysicalEntity ||
			intersectsLSV('Pathway', sourceNode.type);
		var targetIsBiopaxPhysicalEntityOrPathway = targetIsBiopaxPhysicalEntity ||
			intersectsLSV('Pathway', targetNode.type);
		//*
		if (sourceIsBiopaxPhysicalEntity && targetIsBiopaxPhysicalEntity) {
			// TODO is this a safe assumption? The resulting JSON will have a BioPAX
			// type of Conversion, which is a superclass for the closest BioPAX terms
			// to mim-cleavage and mim-binding.
			// The plain arrow could also theoretically represent mim-transcription-translation,
			// but our pathways use DataNodes of type GeneProduct to cover that. They don't
			// usually indicate Gene -> RNA -> Protein
			marker = 'mim-conversion';
		//*/
		} else if ((sourceIsEdge && targetIsBiopaxPhysicalEntityOrPathway) ||
							 (sourceIsBiopaxPhysicalEntityOrPathway && targetIsEdge)) {
			// TODO is this a safe assumption? It's unreasonable for it to be an inhibition.
			// If it's actually supposed to be a mim-catalysis or mim-necessary-stimulation
			// instead of a mim-stimulation, the resulting JSON will still not be exactly wrong,
			// because both mim-stimulation and mim-necessary-stimulation are mapped to
			// a BioPAX Control w/ controlType ACTIVATION, and Control is a superclass
			// of Catalysis.
			marker = 'mim-stimulation';
		}
	}

	var identifierMappings = markerNameToIdentifierMappings[marker];
	let biopaxType: string;
	if (!!identifierMappings) {
		const biopaxMappings = identifierMappings.biopax;
		if (!!biopaxMappings && !!biopaxMappings.name) {
			biopaxType = interaction.biopaxType = 'biopax:' + biopaxMappings.name;
			const biopaxControlType: string = biopaxMappings.controlType;
			if (biopaxControlType) {
				interaction.biopaxControlType = biopaxControlType;
			}
		}
		const wpInteractionType = identifierMappings.wp;
		if (!!wpInteractionType) {
			interaction.wpInteractionType = wpInteractionType;
		}
		const sboInteractionType = identifierMappings.sbo;
		if (!!sboInteractionType) {
			interaction.sboInteractionType = sboInteractionType;
		}
		interaction.type = unionLSV(interaction.type, biopaxType, wpInteractionType, sboInteractionType);
	}

	/* this below is an attempt to model interactions using named graphs
	interaction.relationGraph = [{
		id: sourceId,
		relation: targetId
	}];
	//*/

	// and this is an attempt to model interactions using Biopax
	// TODO still need to consider things like CovalentBindingFeature, etc.
	if (intersectsLSV(['biopax:Interaction', 'biopax:MolecularInteraction'], biopaxType)) {
		interaction.participant = [];
		interaction.participant.push(sourceId);
		interaction.participant.push(targetId);
	} else if (intersectsLSV(['biopax:Control', 'biopax:Catalysis'], biopaxType)) {
		if (!!identifierMappings && !!identifierMappings.controlType) {
			interaction.controlType = identifierMappings.controlType;
		}
		interaction.controller = sourceId;
		interaction.controlled = targetId;
	} else if (intersectsLSV(['biopax:Conversion', 'biopax:BiochemicalReaction', 'biopax:Degradation'], biopaxType)) {
		// TODO this isn't actually checking the other marker to
		// make sure it also indicates conversion
		if (!!interaction.markerStart && !!interaction.markerEnd) {
			interaction.conversionDirection = 'REVERSIBLE';
		} else {
			interaction.conversionDirection = 'LEFT-TO-RIGHT';
		}
		interaction.left = sourceId;
		interaction.right = targetId;
	} else {
		interaction.participant = [];
		interaction.participant.push(sourceId);
		interaction.participant.push(targetId);
	}

	/*
	if (marker === 'mim-binding' || marker === 'mim-covalent-bond') {
		// TODO something with entityFeature, BindingFeature, CovalentBindingFeature, bindsTo...
	}
	//*/

	if (intersectsLSV(interaction.type, 'biopax:Catalysis')) {
		var controlled: Controlled = elementMap[interaction.controlled];
		var controller: Controller = elementMap[interaction.controller];

		if (!intersectsLSV(biopaxNodeTypesPrefixed, controller.type)) {
			// If the controller is not a Pathway or PhysicalEntity,
			// we make this interaction generic, because it's not a valid
			// Catalysis.

			if (intersectsLSV(controller.type, 'Group')) {
				controller.type = 'Complex';
			} else {
				convertCatalysisToGenericInteraction(interaction);
			}
		}

		// If it's still a Catalysis, we need to make the controlled be a Conversion.
		if (intersectsLSV('biopax:Catalysis', interaction.type) &&
				intersectsLSV('biopax:Interaction', controlled.type)) {
			controlled.type = unionLSV(controlled.type, 'biopax:Conversion') as string[];
			var participants = controlled.participant;
			if (isArray(participants) && participants.length >= 2) {
				controlled.left = participants[0];
				controlled.right = participants[1];
				delete controlled.participant;
			} else {
				convertConversionToGenericInteraction(controlled);
				convertCatalysisToGenericInteraction(interaction);
			}
		}
	}

	return interaction;
}

