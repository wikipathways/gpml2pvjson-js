import { applyDefaults as baseApplyDefaults, unionLSV } from './gpml-utilities';

export const wpTypes2BiopaxTypes = {
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
		Align: 'Center',
		Color: '000000',
		FontSize: 10,
		LineThickness: 1,
		Padding: '0.1em',
		ShapeType: 'Rectangle',
		Valign: 'Top',
		ZOrder: 0,
	}
};

export function applyDefaults(gpmlElement, defaults) {
	gpmlElement.attributes.Type = gpmlElement.attributes.Type || {value: 'Unknown'};
	return baseApplyDefaults(gpmlElement, [DATA_NODE_DEFAULTS, defaults]);
};
