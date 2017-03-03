import { applyDefaults as baseApplyDefaults } from './gpml-utilities';

const ANCHOR_DEFAULTS = {
	attributes: {
		Shape: {
			name: 'Shape',
			value: 'None'
		}
	},
	Graphics: {
		attributes: {
			LineThickness: {
				name: 'LineThickness',
				value: 0
			}
		}
	}
};

export function applyDefaults(gpmlElement, defaults) {
	var defaultsByShapeType = {
		Circle: {
			attributes: {
				Height: {
					name: 'Height',
					value: 8
				},
				LineThickness: {
					name: 'LineThickness',
					value: 0
				},
				Shape: {
					name: 'Shape',
					value: 'Circle'
				},
				Width: {
					name: 'Width',
					value: 8
				}
			}
		},
		None: {
			attributes: {
				Height: {
					name: 'Height',
					value: 4
				},
				LineThickness: {
					name: 'LineThickness',
					value: 0
				},
				Shape: {
					name: 'Shape',
					value: 'None'
				},
				Width: {
					name: 'Width',
					value: 4
				}
			}
		}
	};
	const drawAs = !!gpmlElement.attributes.Shape ? gpmlElement.attributes.Shape.value : 'None';
	return baseApplyDefaults(gpmlElement, [defaultsByShapeType[drawAs], ANCHOR_DEFAULTS, defaults]);
};
