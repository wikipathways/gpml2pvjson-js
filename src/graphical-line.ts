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

// TODO this isn't getting the linetype info for determining whether activity is direct or indirect yet
export const gpmlArrowHeadToSemanticMappings = {
	'Arrow':'Arrow'
};

//export function fromGPML(pvjs, gpmlSelection, graphicalLineSelection, callback) {
//	var jsonAnchorGraphicalLine,
//		anchor,
//		jsonAnchor,
//		points,
//		jsonPoints,
//		graphicalLineType,
//		target,
//		targetId,
//		groupRef,
//		source,
//		sourceId,
//		dataElements,
//		dataPath = {};
//};
