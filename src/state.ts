import { applyDefaults as baseApplyDefaults } from './gpml-utilities';

const STATE_DEFAULTS = {
	attributes: {
		Padding: {
			name: 'Padding',
			value: '0.1em'
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
};

export function applyDefaults(gpmlElement, defaults) {
	return baseApplyDefaults(gpmlElement, [STATE_DEFAULTS, defaults]);
};
