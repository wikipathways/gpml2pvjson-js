import { omit } from 'lodash';
import { applyDefaults as baseApplyDefaults, intersectsLSV, unionLSV } from './gpml-utilities';

const biopaxEdgeTypes = [
  'Interaction',
  'Control',
  'TemplateReactionRegulation',
  'Catalysis',
  'Modulation',
  'Conversion',
  'BiochemicalReaction',
  'TransportWithBiochemicalReaction',
  'ComplexAssembly',
  'Degradation',
  'Transport',
  'TransportWithBiochemicalReaction',
  'GeneticInteraction',
  'MolecularInteraction',
  'TemplateReaction'
];
const biopaxEdgeTypesPrefixed = biopaxEdgeTypes.map(x => 'biopax:' + x);

// Handle 'Style' attributes for GPML 'Group' elements,
// using the closest Biopax term available for the mappings below.
// Once all the elements are converted, we come back to this and
// set any 'Pathways' with no interactions to be Complexes.
const GROUP_STYLE_TO_BIOPAX = {
	'Group': 'Pathway',
	'None': 'Pathway',
	'Complex': 'Complex',
	'Pathway': 'Pathway'
};

const GROUP_STYLE_TO_DRAW_AS = {
	'Group': 'None',
	'None': 'None',
	'Complex': 'Complex',
	'Pathway': 'Rectangle'
};

export const GROUP_DEFAULTS = {
	attributes: {
		Align: {
			name: 'Align',
			value: 'Center'
		},
		Color: {
			name: 'Color',
			value: '808080'
		},
		Valign: {
			name: 'Valign',
			value: 'Middle'
		},
		FontSize: {
			name: 'FontSize',
			value: 1
		},
		FontWeight: {
			name: 'FontWeight',
			value: 'Bold'
		},
		LineThickness: {
			name: 'LineThickness',
			value: 1
		},
		FillOpacity: {
			name: 'FillOpacity',
			value: 0.1
		},
		Style: {
			name: 'Style',
			value: 'None'
		}
	}
};

export function applyDefaults(gpmlElement, defaults) {
	const defaultsByStyle = {
		None: {
			attributes: {
				Padding: {
					name: 'Padding',
					value: 8
				},
				ShapeType: {
					name: 'ShapeType',
					value: 'Rectangle'
				},
				LineStyle: {
					name: 'LineStyle',
					value: 'Broken'
				},
				FillColor: {
					name: 'FillColor',
					value: 'B4B464'
				},
			}
		},
		Group: {
			attributes: {
				Padding: {
					name: 'Padding',
					value: 8
				},
				ShapeType: {
					name: 'ShapeType',
					value: 'None'
				},
				LineStyle: {
					name: 'LineStyle',
					value: 'Broken'
				},
				FillColor: {
					name: 'FillColor',
					value: 'Transparent'
				},
			}
		},
		Complex: {
			attributes: {
				Padding: {
					name: 'Padding',
					value: 11
				},
				ShapeType: {
					name: 'ShapeType',
					value: 'Complex'
				},
				LineStyle: {
					name: 'LineStyle',
					value: 'Solid'
				},
				FillColor: {
					name: 'FillColor',
					value: 'B4B464'
				},
			}
		},
		Pathway: {
			attributes: {
				Padding: {
					name: 'Padding',
					value: 8
				},
				ShapeType: {
					name: 'ShapeType',
					value: 'Rectangle'
				},
				LineStyle: {
					name: 'LineStyle',
					value: 'Broken'
				},
				FillColor: {
					name: 'FillColor',
					value: '00FF00'
				},
			}
		}
	};

	gpmlElement.attributes.Style = gpmlElement.attributes.Style || {value: 'None'};
	const groupStyle = gpmlElement.attributes.Style;
	gpmlElement = baseApplyDefaults(gpmlElement, [defaultsByStyle[groupStyle.value], GROUP_DEFAULTS, defaults]);
	return gpmlElement;
};

// TODO should we allow padding to be a value like '0.5em'?
export function getGroupDimensions(padding: number, borderWidth: number, groupContents: (DataElement & Edge)[]): GroupDimensions {
	let dimensions = <GroupDimensions>{};
	dimensions.topLeftCorner = {
		x: Infinity,
		y: Infinity
	};
	dimensions.bottomRightCorner = {
		x: 0,
		y: 0
	};

	groupContents.forEach(function(groupContent) {
		const points = groupContent.points;

		if (groupContent.hasOwnProperty('x') && groupContent.hasOwnProperty('y') &&
				groupContent.hasOwnProperty('width') && groupContent.hasOwnProperty('height')) { // If groupContent is a node
			dimensions.topLeftCorner.x = Math.min(dimensions.topLeftCorner.x, groupContent.x);
			dimensions.topLeftCorner.y = Math.min(dimensions.topLeftCorner.y, groupContent.y);
			dimensions.bottomRightCorner.x = Math.max(dimensions.bottomRightCorner.x, groupContent.x + groupContent.width);
			dimensions.bottomRightCorner.y = Math.max(dimensions.bottomRightCorner.y, groupContent.y + groupContent.height);
		} else if (!!points) { // If groupContent is an edge
			const firstPoint = points[0];
			const firstPointX = firstPoint.x;
			const firstPointY = firstPoint.y;
			const lastPoint = points[points.length - 1];
			const lastPointX = lastPoint.x;
			const lastPointY = lastPoint.y;
			dimensions.topLeftCorner.x = Math.min(dimensions.topLeftCorner.x, firstPointX, lastPointX);
			dimensions.topLeftCorner.y = Math.min(dimensions.topLeftCorner.y, firstPointY, lastPointY);
			dimensions.bottomRightCorner.x = Math.max(dimensions.bottomRightCorner.x, firstPointX, lastPointX);
			dimensions.bottomRightCorner.y = Math.max(dimensions.bottomRightCorner.y, firstPointY, lastPointY);
		} else {
			throw new Error(`Unexpected content (id: "${groupContent.id}", type: "${groupContent.kaavioType}") in Group`);
		}
		dimensions.x = dimensions.topLeftCorner.x - padding - borderWidth;
		dimensions.y = dimensions.topLeftCorner.y - padding - borderWidth;
		dimensions.width = (dimensions.bottomRightCorner.x - dimensions.topLeftCorner.x) + 2 * (padding + borderWidth);
		dimensions.height = (dimensions.bottomRightCorner.y - dimensions.topLeftCorner.y) + 2 * (padding + borderWidth);
	});

	if (typeof dimensions.x === 'undefined' ||
			isNaN(dimensions.x) ||
				dimensions.x === null ||
					typeof dimensions.y === 'undefined' ||
						isNaN(dimensions.y) ||
							dimensions.y === null ||
								typeof dimensions.width === 'undefined' ||
									isNaN(dimensions.width) ||
										dimensions.width === null ||
											typeof dimensions.height === 'undefined' ||
												isNaN(dimensions.height) ||
													dimensions.height === null) {
		throw new Error('Error calculating group dimensions. Cannot calculate one or more of the following: x, y, width, height.');
	}

	return dimensions;
};

export function postProcess(data, group: DataElement) {
	const containedElements = group.contains.map((id) => data.elementMap[id]);

	const dimensions = getGroupDimensions(
			group.padding,
			group.borderWidth,
			containedElements
	);
	group.y = dimensions.y;
	group.x = dimensions.x;
	group.width = dimensions.width;
	group.height = dimensions.height;

	// Convert GPML Group Style to a Biopax class, like Complex
	const containsEdge = containedElements.reduce(function(accumulator, item) {
		const isEdge = intersectsLSV(biopaxEdgeTypes, item.type);
		accumulator = accumulator || isEdge;
		return accumulator;
	}, false);
	const biopaxType = containsEdge ? (GROUP_STYLE_TO_BIOPAX[group['gpml:Style']] || 'Pathway') : 'Complex';
	group.type = unionLSV(group.type, biopaxType) as string[];

	return omit(group, ['gpml:Style']);
};
