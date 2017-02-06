import * as _ from 'lodash';
//import * as Anchor from './anchor';
import * as Attribute from './attribute';
import * as GpmlUtilities from './gpml-utilities';
import * as He from 'he';
import * as Point from './point';
import * as Strcase from 'tower-strcase';
import RGBColor = require('rgbcolor');
import * as utils from './utils';
import * as Xref from './xref';

var typeMappings = utils.typeMappings;
var tmEntityGpmlPlain2EntityNormalizedPrefixed =
    typeMappings.entityGpmlPlain2entityNormalizedPrefixed;

import * as anchor from './anchor';
export let Anchor = anchor;
import * as pathway from './pathway';
export let Pathway = pathway;
import * as group from './group';
export let Group = group;
import * as dataNode from './data-node';
export let DataNode = dataNode;
import * as graphicalLine from './graphical-line';
export let GraphicalLine = graphicalLine;
import * as interaction from './interaction';
export let Interaction = interaction;
import * as label from './label';
export let Label = label;
import * as shape from './shape';
export let Shape = shape;
import * as state from './state';
export let State = state;

function parseAsNonNaNNumber(i: number | string): number {
	const parsed = Number(i);
	if (_.isNaN(parsed)) {
		throw new Error('Cannot parse "' + String(i) + '" as non-NaN number');
	}
	return parsed;
}

export let defaults = {
	attributes: {
		FillColor: {
			name: 'FillColor',
			value: 'ffffff'
		}
	}
};

export function applyDefaults(gpmlElement) {
	var tagName = gpmlElement.name;
	if (!!this[tagName]) {
		return this[tagName].applyDefaults(gpmlElement, this.defaults);
	} else {
		return GpmlUtilities.applyDefaults(gpmlElement, this.defaults);
	}
};

export interface ToPvjsonArgs {
	pvjson: Pvjson;
	pvjsonElement: PvjsonElement & Pvjson;
	gpmlElement: GPMLElement;
}
export function toPvjson(args: ToPvjsonArgs) {
	var pvjson = args.pvjson;
	var pvjsonElement = args.pvjsonElement;
	var gpmlElement = args.gpmlElement;
	var attribute;
	var i;
	var pvjsonStrokeWidth;
	var pvjsonShape;
	var pvjsonZIndex;
	var pvjsonRelX;
	var pvjsonRelY;
	var pvjsonDisplayName;
	var pvjsonHref;
	var tagName = gpmlElement.name;
	var type;
	var lineStyleIsDouble;
	var pvjsonBorderWidth;
	var gpmlShapeType = '';
	var pvjsonTextAlign;
	var pvjsonVerticalAlign;
	var gpmlRotation;
	var gpmlDatabase;

	var attributeDependencyOrder = [
		'GroupId',
		'GraphId',
		'GraphRef',
		'GroupRef',
		'Name',
		'IsPartOf',
		'TextLabel',
		'Type',
		'CellularComponent',
		'Rotation',
		'LineStyle',
		'Shape',
		'ShapeType',
		'Attribute',
		'FillColor',
		'Color',
		'LineThickness',
		'Width',
		'Height',
		'RelX',
		'RelY',
		'CenterX',
		'CenterY',
		'ConnectorType',
		'Point',
		'Organism',
		'Database',
		'ID',
		'Data-Source',
		'Version'
	];

	function handleShapeType(gpmlValue) {
		gpmlShapeType = gpmlValue;
		// most graphics libraries use the term 'ellipse', so we're converting
		// the GPML terms 'Oval' and 'Circle' to match
		if (gpmlValue === 'Oval' || gpmlValue === 'Circle') {
			pvjsonShape = 'Ellipse';
		} else {
			pvjsonShape = gpmlValue;
		}

		// Note: if the LineStyle is "Double," then "-double" will be
		// appended to pvjsonElement.shape when "Attributes" are handled.

		pvjsonShape = Strcase.paramCase(pvjsonShape);
		pvjsonElement.shape = pvjsonShape;
	}

	var gpmlToPvjsonConverter = {
		Align: function(gpmlAlignValue) {
			pvjsonTextAlign = Strcase.paramCase(gpmlAlignValue);
			pvjsonElement.textAlign = pvjsonTextAlign;
		},
		Attribute: function(gpmlValue) {
			// NOTE: in GPML, 'Attribute' is an XML _ELEMENT_ with the tagName "Attribute."
			// We push all the Attribute elements that are children of the current target
			// element onto an array in JSON before reaching this step.
			gpmlValue.forEach(function(attributeElement) {
				pvjsonElement = Attribute.toPvjson({
					gpmlElement: gpmlElement,
					pvjsonElement: pvjsonElement,
					attributeElement: attributeElement
				});
			});
		},
		Author: function(gpmlValue) {
			pvjsonElement.author = gpmlValue;
		},
		'gpml:BiopaxRef': function(gpmlValue) {
			let xrefs = pvjsonElement.xref || [];
			xrefs.push(gpmlValue);
			// TODO will gpmlValue always be a string?
			pvjsonElement.xref = xrefs;
		},
		BoardHeight: function(gpmlValue) {
			pvjsonElement.image = pvjsonElement.image || {
				'@context': {
					'@vocab': 'http://schema.org/'
				}
			};
			pvjsonElement.image.height = parseAsNonNaNNumber(gpmlValue);
		},
		BoardWidth: function(gpmlValue) {
			pvjsonElement.image = pvjsonElement.image || {
				'@context': {
					'@vocab': 'http://schema.org/'
				}
			};
			pvjsonElement.image.width = parseAsNonNaNNumber(gpmlValue);
		},
		CenterX: function(gpmlValue) {
			pvjsonElement.x = parseAsNonNaNNumber(gpmlValue) - pvjsonElement.width / 2;
		},
		CenterY: function(gpmlValue) {
			pvjsonElement.y = parseAsNonNaNNumber(gpmlValue) - pvjsonElement.height / 2;

			var transformationSequence = [];

			// Correct GPML position and size values.
			//
			// Some shapes have GPML values that do not match what is
			// visually displayed in PathVisio-Java.
			// Below are corrections for the GPML so that the display in pvjs
			// will match the display in PathVisio-Java.

			var xTranslation;
			var yTranslation;
			var xScale;
			var yScale;

			if (gpmlShapeType === 'Triangle') {
				// NOTE: the numbers below come from visually experimenting with different widths
				// in PathVisio-Java and making linear approximations of the translation
				// scaling required to make x, y, width and height values match what is visually
				// displayed in PathVisio-Java.
				xScale = ((pvjsonElement.width + 0.04) / 1.07) / pvjsonElement.width;
				yScale = ((pvjsonElement.height - 0.14) / 1.15) / pvjsonElement.height;
				xTranslation = 0.28 * pvjsonElement.width - 2.00;
				yTranslation = 0;

				if (typeof gpmlRotation === 'number' && gpmlRotation !== 0) {
					transformationSequence.push({
						key: 'rotate',
						value: gpmlRotation
					});
				}

				transformationSequence.push({
					key: 'translate',
					value: [xTranslation, yTranslation]
				});

				if (typeof gpmlRotation === 'number' && gpmlRotation !== 0) {
					transformationSequence.push({
						key: 'rotate',
						value: (-1) * gpmlRotation
					});
				}

				transformationSequence.push({
					key: 'scale',
					value: [xScale, yScale]
				});

			} else if (gpmlShapeType === 'Hexagon') {
				xScale = 1;
				yScale = 0.88;
				transformationSequence.push({
					key: 'scale',
					value: [xScale, yScale]
				});
			} else if (gpmlShapeType === 'Pentagon') {
				xScale = 0.90;
				yScale = 0.95;
				xTranslation = 0.047 * pvjsonElement.width + 0.01;
				yTranslation = 0;

				if (typeof gpmlRotation === 'number' && gpmlRotation !== 0) {
					transformationSequence.push({
						key: 'rotate',
						value: gpmlRotation
					});
				}

				transformationSequence.push({
					key: 'translate',
					value: [xTranslation, yTranslation]
				});

				if (typeof gpmlRotation === 'number' && gpmlRotation !== 0) {
					transformationSequence.push({
						key: 'rotate',
						value: (-1) * gpmlRotation
					});
				}

				transformationSequence.push({
					key: 'scale',
					value: [xScale, yScale]
				});
			} else if (gpmlShapeType === 'Arc') {
				xScale = 1;
				yScale = 0.5;
				xTranslation = 0;
				yTranslation = pvjsonElement.height * yScale / 2;

				if (typeof gpmlRotation === 'number' && gpmlRotation !== 0) {
					transformationSequence.push({
						key: 'rotate',
						value: gpmlRotation
					});
				}

				transformationSequence.push({
					key: 'translate',
					value: [xTranslation, yTranslation]
				});

				if (typeof gpmlRotation === 'number' && gpmlRotation !== 0) {
					transformationSequence.push({
						key: 'rotate',
						value: (-1) * gpmlRotation
					});
				}

				transformationSequence.push({
					key: 'scale',
					value: [xScale, yScale]
				});
			}
			/*
			else if (gpmlShapeType === 'Sarcoplasmic Reticulum') {
			// TODO: enable this after comparing results from old converter
				xScale = 0.76;
				yScale = 0.94;
				xTranslation = 0.043 * pvjsonElement.width + 0.01;
				yTranslation = 0.009 * pvjsonElement.height - 15.94;

				if (typeof gpmlRotation === 'number' && gpmlRotation !== 0) {
					transformationSequence.push({
						key: 'rotate',
						value: gpmlRotation
					});
				}

				transformationSequence.push({
					key: 'translate',
					value: [xTranslation, yTranslation]
				});

				if (typeof gpmlRotation === 'number' && gpmlRotation !== 0) {
					transformationSequence.push({
						key: 'rotate',
						value: (-1) * gpmlRotation
					});
				}

				transformationSequence.push({
					key: 'scale',
					value: [xScale, yScale]
				});
			}
			//*/

			pvjsonElement = GpmlUtilities.transform({
				element: pvjsonElement,
				transformationSequence: transformationSequence
			});
		},
		Color: function(gpmlColorValue) {
			var cssColor = this.gpmlColorToCssColor(gpmlColorValue);
			pvjsonElement.color = cssColor;
		},
		Comment: function(gpmlValue) {
			pvjsonElement['gpml:Comment'] = gpmlValue;
		},
		ConnectorType: function(gpmlConnectorTypeValue) {
			var gpmlConnectorType = gpmlConnectorTypeValue;
			pvjsonShape = Strcase.paramCase('line-' + gpmlConnectorType);
			pvjsonElement.shape = pvjsonShape;
		},
		Database: function(gpmlValue) {
			gpmlDatabase = gpmlValue;
		},
		'Data-Source': function(gpmlValue) {
			pvjsonElement.dataSource = gpmlValue;
		},
		Email: function(gpmlValue) {
			pvjsonElement.email = gpmlValue;
		},
		FillColor: function(gpmlFillColorValue) {
			var cssColor = this.gpmlColorToCssColor(gpmlFillColorValue);
			if (gpmlShapeType.toLowerCase() !== 'none') {
				pvjsonElement.backgroundColor = cssColor;
			} else {
				pvjsonElement.backgroundColor = 'transparent';
			}
		},
		FillOpacity: function(gpmlFillOpacityValue) {
			var cssFillOpacity = parseAsNonNaNNumber(gpmlFillOpacityValue);
			pvjsonElement.fillOpacity = cssFillOpacity;
		},
		FontName: function(gpmlFontNameValue) {
			var cssFontFamily = gpmlFontNameValue;
			pvjsonElement.fontFamily = cssFontFamily;
		},
		FontSize: function(gpmlFontSizeValue) {
			pvjsonElement.fontSize = parseAsNonNaNNumber(gpmlFontSizeValue);
		},
		FontStyle: function(gpmlFontStyleValue) {
			var cssFontStyle = gpmlFontStyleValue.toLowerCase();
			pvjsonElement.fontStyle = cssFontStyle;
		},
		FontWeight: function(gpmlFontWeightValue) {
			var cssFontWeight = gpmlFontWeightValue.toLowerCase();
			pvjsonElement.fontWeight = cssFontWeight;
		},
		GraphId: function(gpmlValue) {
			pvjsonElement.id = gpmlValue;
		},
		GraphRef: function(gpmlValue) {
			pvjsonElement.isAttachedTo = gpmlValue;
		},
		GroupId: function(gpmlValue) {
			pvjsonElement['gpml:GroupId'] = gpmlValue;
		},
		GroupRef: function(gpmlValue) {
			pvjsonElement['gpml:GroupRef'] = gpmlValue;
			//pvjsonElement.isPartOf = gpmlValue;
		},
		Height: function(gpmlValue) {
			// NOTE: this will be corrected, if needed, when CenterY is evaluated
			pvjsonElement.height = parseAsNonNaNNumber(gpmlValue) + pvjsonBorderWidth;
			if (lineStyleIsDouble) {
				pvjsonElement.height += pvjsonBorderWidth;
			}
		},
		Href: function(gpmlHrefValue) {
			pvjsonHref = encodeURI(He.decode(gpmlHrefValue));
			pvjsonElement.href = pvjsonHref;
		},
		// TODO what if there were multiple Xrefs for a single element?
		ID: function(gpmlValue) {
			var result = Xref.toPvjson({
				pvjson: pvjson,
				gpmlElement: gpmlElement,
				pvjsonElement: pvjsonElement,
				xref: {
					Database: gpmlDatabase.trim(),
					ID: gpmlValue.trim()
				}
			});

			pvjson = result.pvjson;
			pvjsonElement = result.pvjsonElement || pvjsonElement;
		},
		'Last-Modified': function(gpmlValue) {
			pvjsonElement.lastModified = gpmlValue;
		},
		License: function(gpmlValue) {
			pvjsonElement.license = gpmlValue;
		},
		LineStyle: function(gpmlLineStyleValue) {
			var pvjsonStrokeDasharray;
			// TODO hard-coding these here is not the most maintainable
			if (gpmlLineStyleValue === 'Broken') {
				pvjsonStrokeDasharray = '5,3';
				pvjsonElement.strokeDasharray = pvjsonStrokeDasharray;
			} else if (gpmlLineStyleValue === 'Double') {
				lineStyleIsDouble = true;
			}
		},
		LineThickness: function(gpmlLineThicknessValue) {
			pvjsonBorderWidth = parseAsNonNaNNumber(gpmlLineThicknessValue);
			// In PathVisio-Java, GPML Width/Height for GPML Shapes is
			// inconsistent when zoomed in vs. when at default zoom level.
			//
			// When zoomed in, GPML Width/Height refers to the distance from
			// center of border to center of border, meaning that shapes that
			// run up to the edge will be cropped.
			//
			// When at default zoom level, GPML Width/Height refers to the distance
			// from outer edge of border to outer edge of border (no cropping).
			//
			// Because of this, LineThickness for Rectangle and RoundedRectangle
			// is also inconsistent.
			// When zoomed in: one half of specified LineThickness.
			// When at default zoom level: full specified LineThickness.
			//
			// For pvjs, we attempt to match the view from PathVisio-Java when zoomed out,
			// but we define width/height as outer border edge to outer border edge, meaning
			// pvjson width/height values will not match GPML Width/Height values.
			//
			// pvjson width = GPML Width + GPML LineThickness
			// pvjson height = GPML Height + GPML LineThickness
			// (one half LineThickness on either side yields a full LineThickness to add
			// to width/height).
			//
			// Also note that for double lines, LineThickness refers to the the border
			// width of each line and the space between each line, meaning the border width
			// for the double line as a whole will be three times the listed LineThickness.

			pvjsonElement.borderWidth = pvjsonBorderWidth;
		},
		Maintainer: function(gpmlValue) {
			pvjsonElement.maintainer = gpmlValue;
		},
		Name: function(nameValue) {
			var splitName = nameValue.split(' (');
			if (!!splitName &&
					splitName.length === 2 &&
						!!nameValue.match(/\(/g) &&
							nameValue.match(/\(/g).length === 1 &&
								!!nameValue.match(/\)/g) &&
									nameValue.match(/\)/g).length === 1) {
				pvjsonElement.standardName = splitName[0];
				pvjsonElement.displayName = splitName[1].replace(')', '');
			} else {
				pvjsonElement.standardName = nameValue;
				pvjsonElement.displayName = nameValue;
			}
		},
		Organism: function(gpmlValue) {
			pvjsonElement.organism = gpmlValue;
		},
		Padding: function(gpmlPaddingValue) {
			pvjsonElement.padding = gpmlPaddingValue;
		},
		Point: function(gpmlValue) {
			// Saving this to fully convert once pvjson.elements array is done being filled.
			pvjsonElement['gpml:Point'] = gpmlValue;
		},
		Position: function(gpmlPositionValue) {
			var pvjsonPosition = parseAsNonNaNNumber(gpmlPositionValue);
			pvjsonElement.position = pvjsonPosition;
		},
		RelX: function(gpmlValue) {
			pvjsonRelX = parseAsNonNaNNumber(gpmlValue);
			pvjsonElement.relX = pvjsonRelX;
		},
		RelY: function(gpmlValue) {
			pvjsonRelY = parseAsNonNaNNumber(gpmlValue);
			pvjsonElement.relY = pvjsonRelY;

			if (!!pvjsonElement.isAttachedTo &&
					typeof pvjsonElement.x === 'undefined' &&
						typeof pvjsonElement.y === 'undefined') {
				var referencedElement = _.find(pvjson.elements, {'id': pvjsonElement.isAttachedTo});

				var referencedElementCenterX = referencedElement.x + referencedElement.width / 2;
				var referencedElementCenterY = referencedElement.y + referencedElement.height / 2;

				var pvjsonElementCenterX = referencedElementCenterX +
						pvjsonRelX * referencedElement.width / 2;
				var pvjsonElementCenterY = referencedElementCenterY +
						pvjsonRelY * referencedElement.height / 2;

				pvjsonElement.x = pvjsonElementCenterX - pvjsonElement.width / 2;
				pvjsonElement.y = pvjsonElementCenterY - pvjsonElement.height / 2;

				pvjsonElement.zIndex = referencedElement.zIndex + 0.2;
			}
		},
		/*
		RelX: function(gpmlRelXValue) {
			var pvjsonRelX = parseFloat(gpmlRelXValue);
			pvjsonElement.relX = pvjsonRelX;
			parentElement = gpmlPathwaySelection.find('[GraphId=' +
					gpmlParentElement.attr('GraphRef') + ']');
			//if (parentElement.length < 1) throw new Error('cannot find parent');
			var parentCenterX = parseFloat(parentElement.find('Graphics').attr('CenterX'));
			var parentWidth = parseFloat(parentElement.find('Graphics').attr('Width'));
			var parentZIndex = parseFloat(parentElement.find('Graphics').attr('ZOrder'));
			var gpmlCenterXValue = parentCenterX + gpmlRelXValue * parentWidth/2;
			pvjsonX = gpmlCenterXValue - pvjsonWidth/2;
			pvjsonElement.x = pvjsonX || 0;
			pvjsonElement.zIndex = parentZIndex + 0.2 || 0;
			//pvjsonText.containerPadding = '0';
			//pvjsonText.fontSize = '10';
			return pvjsonX;
		},
		RelY: function(gpmlRelYValue) {
			var pvjsonRelY = parseFloat(gpmlRelYValue);
			pvjsonElement.relY = pvjsonRelY;
			var parentCenterY = parseFloat(parentElement.find('Graphics').attr('CenterY'));
			var parentHeight = parseFloat(parentElement.find('Graphics').attr('Height'));
			var elementCenterY = parentCenterY + pvjsonRelY * parentHeight/2;
			// TODO do we need to consider LineThickness (strokewidth) here?
			pvjsonY = elementCenterY - pvjsonHeight/2;
			pvjsonElement.y = pvjsonY || 0;
			// TODO this and other elements here are hacks
			//pvjsonText.containerY = pvjsonY + 12;
			return pvjsonY;
		},
		//*/
		Rotation: function(gpmlValue) {
			// GPML can hold a rotation value for State elements in an element
			// named "Attribute" like this:
			// Key="org.pathvisio.core.StateRotation"
			// From discussion with AP and KH, we've decided to ignore this value,
			// because we don't actually want States to be rotated.

			gpmlRotation = parseAsNonNaNNumber(gpmlValue);

			// GPML saves rotation in radians, even though PathVisio-Java displays rotation in degrees.
			// Convert from radians to degrees:
			var pvjsonRotation = gpmlRotation * 180 / Math.PI;
			if (gpmlRotation !== 0) {
				pvjsonElement.rotation = pvjsonRotation;
			}

			/*
			// This conversion changes the rotation to reflect the angle between the green rotation
			// control dot in PathVisio-Java and the X-axis.
			// The units are radians, unlike the units for pvjsonRotation.
			var angleToControlPoint = 2 * Math.PI - gpmlRotation;
			//*/
		},
		Shape: handleShapeType,
		ShapeType: handleShapeType,
		//Shape: this.ShapeType,
		Style: function(gpmlValue) {
			// Handle 'Style' attributes for GPML 'Group' elements,
			// using the closest Biopax term available for the mappings below.
			// Once all the elements are converted, we come back to this and
			// set any 'Pathways' with no interactions to be Complexes.
			var gpmlGroupStyleToBiopaxEntityTypeMappings = {
				'Group': 'Pathway',
				'None': 'Pathway',
				'Complex': 'Complex',
				'Pathway': 'Pathway'
			};

			if (tagName === 'Group') {
				// Convert GPML Group Style to a Biopax class, like Complex
				pvjsonElement.type = gpmlGroupStyleToBiopaxEntityTypeMappings[gpmlValue] || 'Pathway';
			} else {
				pvjsonElement['gpml:Style'] = 'gpml:' + gpmlValue;
			}
		},
		TextLabel: function(gpmlTextLabelValue) {
			pvjsonDisplayName = He.decode(gpmlTextLabelValue);
			pvjsonElement.displayName = pvjsonDisplayName;
		},
		Type: function(gpmlValue) {
			// NOTE: when the DataNode is set to have a Type of "Unknown" in PathVisio-Java,
			// it is serialized into GPML without a Type attribute.
			var gpmlDataNodeType = gpmlValue || 'Unknown';

			if (tagName === 'DataNode') {
				// Convert GPML DataNode Type to a term from the GPML or BioPAX vocabulary,
				// using a Biopax class when possible (like biopax:Protein),
				// but otherwise using a GPML class.
				pvjsonElement.type = tmEntityGpmlPlain2EntityNormalizedPrefixed[gpmlValue] ||
						'biopax:PhysicalEntity';
			} else {
				pvjsonElement['gpml:Type'] = 'gpml:' + gpmlValue;
			}
		},
		Valign: function(gpmlValignValue) {
			pvjsonVerticalAlign = Strcase.paramCase(gpmlValignValue);
			pvjsonElement.verticalAlign = pvjsonVerticalAlign;
		},
		Version: function(gpmlValue) {
			// This usually appears to be referring to the version from the DataSource,
			// not to the WikiPathways version.
			pvjsonElement.dataSource += ', version: ' + gpmlValue;
		},
		Width: function(gpmlValue) {
			// NOTE: this will be corrected, if needed, when CenterY is evaluated
			pvjsonElement.width = parseAsNonNaNNumber(gpmlValue) + pvjsonBorderWidth;
			if (lineStyleIsDouble) {
				pvjsonElement.width += pvjsonBorderWidth;
			}
		},
		ZOrder: function(gpmlZOrderValue) {
			pvjsonZIndex = parseAsNonNaNNumber(gpmlZOrderValue);
			pvjsonElement.zIndex = pvjsonZIndex;
		},
		// everything below in this object: helper values/functions
		gpmlColorToCssColor: function(gpmlColor) {
			var color;
			if (gpmlColor.toLowerCase() === 'transparent') {
				return 'transparent';
			} else {
				color = new RGBColor(gpmlColor);
				if (color.ok) {
					return color.toHex();
				} else {
					console.warn('Could not convert GPML Color value of "' + gpmlColor +
											 '" to a valid CSS color. Using "#c0c0c0" as a fallback.');
					return '#c0c0c0';
				}
			}
		}
	};

	pvjsonElement.type = pvjsonElement.type || 'gpml:' + tagName;

	pvjsonElement = GpmlUtilities.convertAttributesToJson(
			gpmlElement, pvjsonElement, gpmlToPvjsonConverter, attributeDependencyOrder);
	pvjsonElement['gpml:element'] = 'gpml:' + gpmlElement.name;

	if (gpmlElement.name !== 'Pathway') {
		pvjson.elements.push(pvjsonElement);
	} else {
		pvjson = pvjsonElement;
	}

	return pvjson;
};
