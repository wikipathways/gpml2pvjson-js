import * as	GpmlUtilities from './gpml-utilities';

const GRAPHICAL_LINE_DEFAULTS = {
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

export function applyDefaults(gpmlElement, defaults) {
	gpmlElement = GpmlUtilities.applyDefaults(gpmlElement, [GRAPHICAL_LINE_DEFAULTS, defaults]);
	return gpmlElement;
};
