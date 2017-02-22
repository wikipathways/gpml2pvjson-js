import { applyDefaults as baseApplyDefaults, unionLSV } from './gpml-utilities';

const wpTypes2BiopaxTypes = {
  'Complex': 'Complex',
	// TODO which one of the following two should we use?
  'GeneProduct': 'Dna',
  //'GeneProduct': ['Dna', 'Rna', 'Protein'],
  'Metabolite': 'SmallMolecule',
  'Pathway': 'Pathway',
  'Protein': 'Protein',
  'Rna': 'Rna',
  'Unknown': 'PhysicalEntity',
  // Non-standard Types
  'GeneProdKegg enzymeuct': 'Protein',
  'SimplePhysicalEntity': 'PhysicalEntity',
  'Modifier': 'SmallMolecule',
  'State': 'SmallMolecule',
};

export let DATA_NODE_DEFAULTS = {
	attributes: {
		Align: {
			name: 'Align',
			value: 'Center'
		},
		Color: {
			name: 'Color',
			value: '000000'
		},
		FontSize: {
			name:'FontSize',
			value:10
		},
		LineThickness: {
			name: 'LineThickness',
			value: 1
		},
		Padding: {
			name: 'Padding',
			value: '0.5em'
		},
		ShapeType: {
			name: 'ShapeType',
			value: 'Rectangle'
		},
		Valign: {
			name: 'Valign',
			value: 'Top'
		},
		ZOrder: {
			name: 'ZOrder',
			value: 0
		},
	}
};

export function applyDefaults(gpmlElement, defaults) {
	gpmlElement.attributes.Type = gpmlElement.attributes.Type || {value: 'Unknown'};
	return baseApplyDefaults(gpmlElement, [DATA_NODE_DEFAULTS, defaults]);
};

export function postProcess(data, dataNode) {
	// Convert GPML DataNode Type to a term from the GPML or BioPAX vocabulary,
	// using a Biopax class when possible (like biopax:Protein),
	// but otherwise using a GPML class.
	const wpType = dataNode.wpType;
	const biopaxType = wpTypes2BiopaxTypes[wpType] || 'PhysicalEntity';
	dataNode.type = unionLSV(dataNode.type, wpType, 'biopax:' + biopaxType);
	return dataNode;
};
