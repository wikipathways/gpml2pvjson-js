import * as GpmlUtilities from './gpml-utilities';

export let defaults = {
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
};

export function applyDefaults(gpmlElement, defaults) {
	gpmlElement = GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
	return gpmlElement;
};

export function toPvjson(pvjson, state) {
	var referencedNode = pvjson.elements.filter(function(element){
		return element.id === state.isAttachedTo;
	})[0];
	
	state.zIndex = referencedNode.zIndex + 0.2;

	return state;
};
