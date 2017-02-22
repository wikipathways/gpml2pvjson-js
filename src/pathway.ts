import * as GpmlUtilities from './gpml-utilities';

const PATHWAY_DEFAULTS = {
	attributes: {
		BoardHeight: {
			name: 'BoardHeight',
			value: 500
		},
		Name: {
			name: 'Name',
			value: 'Untitled Pathway'
		}
	}
};

export function applyDefaults(gpmlElement, defaults) {
	GpmlUtilities.applyDefaults(gpmlElement, [PATHWAY_DEFAULTS, defaults]);
	return gpmlElement;
};
