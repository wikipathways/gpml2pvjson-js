import _ = require('lodash');
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
	var defaultsByStyle = {
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
	var groupStyle = gpmlElement.attributes.Style;
	gpmlElement = GpmlUtilities.applyDefaults(gpmlElement, [defaultsByStyle[groupStyle.value], this.defaults, defaults]);
	return gpmlElement;
};

export function getGroupDimensions(group): GroupDimensions {
	let dimensions = <GroupDimensions>{};
	dimensions.topLeftCorner = {
		x: Infinity,
		y: Infinity
	};
	dimensions.bottomRightCorner = {
		x: 0,
		y: 0
	};
	// TODO what happens if this were set to '0.5em'?
	var padding = parseFloat(group.padding);
	var borderWidth = group.borderWidth;

	var groupContents = group.contains;
	groupContents = _.toArray(groupContents);

	dimensions.zIndex = Infinity;

	groupContents.forEach(function(groupContent) {
		var points = groupContent['gpml:Point'];

		if (!points) { // If groupContent is a node (notice the NOT)
			dimensions.topLeftCorner.x = Math.min(dimensions.topLeftCorner.x, groupContent.x);
			dimensions.topLeftCorner.y = Math.min(dimensions.topLeftCorner.y, groupContent.y);
			dimensions.bottomRightCorner.x = Math.max(dimensions.bottomRightCorner.x, groupContent.x + groupContent.width);
			dimensions.bottomRightCorner.y = Math.max(dimensions.bottomRightCorner.y, groupContent.y + groupContent.height);
		} else { // If groupContent is an edge
			var firstPointAttributes = points[0].attributes;
			var firstPointX = firstPointAttributes.X.value;
			var firstPointY = firstPointAttributes.Y.value;
			var lastPointAttributes = points[points.length - 1].attributes;
			var lastPointX = lastPointAttributes.X.value;
			var lastPointY = lastPointAttributes.Y.value;
			dimensions.topLeftCorner.x = Math.min(dimensions.topLeftCorner.x, firstPointX, lastPointX);
			dimensions.topLeftCorner.y = Math.min(dimensions.topLeftCorner.y, firstPointY, lastPointY);
			dimensions.bottomRightCorner.x = Math.max(dimensions.bottomRightCorner.x, firstPointX, lastPointX);
			dimensions.bottomRightCorner.y = Math.max(dimensions.bottomRightCorner.y, firstPointY, lastPointY);
		}
		dimensions.x = dimensions.topLeftCorner.x - padding - borderWidth;
		dimensions.y = dimensions.topLeftCorner.y - padding - borderWidth;
		dimensions.width = (dimensions.bottomRightCorner.x - dimensions.topLeftCorner.x) + 2 * (padding + borderWidth);
		dimensions.height = (dimensions.bottomRightCorner.y - dimensions.topLeftCorner.y) + 2 * (padding + borderWidth);
		dimensions.zIndex = Math.min(dimensions.zIndex, groupContent.zIndex);
	});

	// TODO refactor to avoid magic number. It's currently used as a hack to put the group behind its contents.
	dimensions.zIndex = dimensions.zIndex - 0.1;

	if (typeof dimensions.x === 'undefined' || isNaN(dimensions.x) || dimensions.x === null || typeof dimensions.y === 'undefined' || isNaN(dimensions.y) || dimensions.y === null || typeof dimensions.width === 'undefined' || isNaN(dimensions.width) || dimensions.width === null || typeof dimensions.height === 'undefined' || isNaN(dimensions.height) || dimensions.height === null) {
		throw new Error('Error calculating group dimensions. Cannot calculate one or more of the following: x, y, width, height.');
	}

	return dimensions;
};


export function toPvjson(pvjson, group) {

	// TODO once GPML supports it, we should create entityReferences for Groups of Type "Complex" and "Pathway"

	var id = group.id;

	var contents = pvjson.elements.filter(function(element){
		return element['gpml:GroupRef'] === group['gpml:GroupId'];
	})
	.map(function(content) {
		delete content['gpml:GroupRef'];
		content.isPartOf = id;
		return content;
	});
	
	// GPML shouldn't have empty groups, but since PathVisio-Java has a bug that sometimes results in empty groups,
	// we need to detect and delete them.
	if (contents.length === 0) {
		_.pull(pvjson.elements, group);
		// TODO make sure group is deleted
		return;
	}

	delete group['gpml:GroupId'];

	group.contains = contents;
	var dimensions = getGroupDimensions(group);
	group.y = dimensions.y;
	group.x = dimensions.x;
	group.width = dimensions.width;
	group.height = dimensions.height;
	group.zIndex = dimensions.zIndex;

	return group;
};
