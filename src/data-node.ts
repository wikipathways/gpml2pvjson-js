import * as Graphics from './graphics';
import * as GpmlUtilities from './gpml-utilities';

export let defaults = {
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
	return GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
};
