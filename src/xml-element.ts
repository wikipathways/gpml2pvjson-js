import { find, isEmpty, isNaN } from 'lodash';
import { fromGPML as attributeFromGPML } from './attribute';
import { applyDefaults as baseApplyDefaults, convertAttributesToJson, transform, unionLSV } from './gpml-utilities';
import { decode } from 'he';
import { paramCase } from 'tower-strcase';
import RGBColor = require('rgbcolor');

import { applyDefaults as applyAnchorDefaults } from './anchor';
import { applyDefaults as applyPathwayDefaults } from './pathway';
import { applyDefaults as applyGroupDefaults } from './group';
import { applyDefaults as applyDataNodeDefaults } from './data-node';
import { applyDefaults as applyGraphicalLineDefaults } from './graphical-line';
import { applyDefaults as applyInteractionDefaults } from './interaction';
import { applyDefaults as applyLabelDefaults } from './label';
import { applyDefaults as applyShapeDefaults } from './shape';
import { applyDefaults as applyStateDefaults } from './state';

const defaultsAppliers = {
	Anchor: applyAnchorDefaults,
	Pathway: applyPathwayDefaults,
	Group: applyGroupDefaults,
	DataNode: applyDataNodeDefaults,
	GraphicalLine: applyGraphicalLineDefaults,
	Interaction: applyInteractionDefaults,
	Label: applyLabelDefaults,
	Shape: applyShapeDefaults,
	State: applyStateDefaults,
};

function parseAsNonNaNNumber(i: number | string): number {
	const parsed = Number(i);
	if (isNaN(parsed)) {
		throw new Error('Cannot parse "' + String(i) + '" as non-NaN number');
	}
	return parsed;
}

const DEFAULTS = {
	attributes: {
		FillColor: {
			name: 'FillColor',
			value: 'ffffff'
		}
	}
};

export function applyDefaults(gpmlElement) {
	const gpmlElementName = gpmlElement.name;
	if (defaultsAppliers.hasOwnProperty(gpmlElementName)) {
		return defaultsAppliers[gpmlElementName](gpmlElement, DEFAULTS);
	} else {
		return baseApplyDefaults(gpmlElement, DEFAULTS);
	}
};

export interface ToDataArgs {
	data: Data;
	dataElement: DataElement & Data;
	gpmlElement: GPMLElement;
}
export function fromGPML(args: ToDataArgs) {
	let data = args.data;
	let dataElement = args.dataElement;

	let gpmlElement = applyDefaults(args.gpmlElement);
	const gpmlElementName = dataElement.gpmlElementName = gpmlElement.name;

	// Note side-effects required for these values,
	// because subsequent values depend on them.
	let gpmlShapeType = '';
	let lineStyleIsDouble: boolean;
	let dataBorderWidth: number;
	let gpmlRotation: number;

	const ATTRIBUTE_DEPENDENCY_ORDER: GPMLAttributeNames[] = [
		'GraphId',
		'GroupId',
		'GraphRef',
		'GroupRef',
		'Name',
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
		'Version',
	];

	// processes Shape and ShapeType GPML attributes 
	function processShapeType(gpmlValue) {
		gpmlShapeType = dataElement.drawAs = gpmlValue;
	}

	const GPML_ALIGN_TO_TEXTALIGN = {
		Middle: 'center',
		Left: 'start',
		Right: 'end',
	};

	let gpmlToDataConverter = {
		Align: function(gpmlAlignValue) {
			dataElement.textAlign = GPML_ALIGN_TO_TEXTALIGN[gpmlAlignValue];
		},
		Attribute: function(gpmlValue) {
			// NOTE: in GPML, 'Attribute' is an XML _ELEMENT_ with the gpmlElementName "Attribute."
			// We push all the Attribute elements that are children of the current target
			// element onto an array in JSON before reaching this step.
			gpmlValue.forEach(function(attributeElement) {
				dataElement = attributeFromGPML(dataElement, gpmlElement, attributeElement)
			});
		},
		Author: function(gpmlValue) {
			if (gpmlValue) {
				dataElement.author = decode(gpmlValue);
			}
		},
		BiopaxRef: function(gpmlValue: string[]) {
			// NOTE: BiopaxRefs come into here grouped into an array.
			//       See tagNamesForSupplementalElementsWithText in main.ts
			if (!isEmpty(gpmlValue)) {
				dataElement.citation = gpmlValue;
			}
		},
		BoardHeight: function(gpmlValue) {
			dataElement.height = parseAsNonNaNNumber(gpmlValue);
		},
		BoardWidth: function(gpmlValue) {
			dataElement.width = parseAsNonNaNNumber(gpmlValue);
		},
		CenterX: function(gpmlValue) {
			dataElement.x = parseAsNonNaNNumber(gpmlValue) - dataElement.width / 2;
		},
		CenterY: function(gpmlValue) {
			dataElement.y = parseAsNonNaNNumber(gpmlValue) - dataElement.height / 2;

			let transformationSequence = [];

			// Correct GPML position and size values.
			//
			// Some GPML elements with ShapeTypes have Graphics values that
			// do not match what is visually displayed in PathVisio-Java.
			// Below are corrections for the GPML so that the display in
			// pvjs matches the display in PathVisio-Java.

			let xTranslation;
			let yTranslation;
			let xScale;
			let yScale;

			if (gpmlShapeType === 'Triangle') {
				// NOTE: the numbers below come from visually experimenting with different widths
				// in PathVisio-Java and making linear approximations of the translation
				// scaling required to make x, y, width and height values match what is visually
				// displayed in PathVisio-Java.
				xScale = ((dataElement.width + 0.04) / 1.07) / dataElement.width;
				yScale = ((dataElement.height - 0.14) / 1.15) / dataElement.height;
				xTranslation = 0.28 * dataElement.width - 2.00;
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
				xTranslation = 0.047 * dataElement.width + 0.01;
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
				yTranslation = dataElement.height * yScale / 2;

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
				xTranslation = 0.043 * dataElement.width + 0.01;
				yTranslation = 0.009 * dataElement.height - 15.94;

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

			dataElement = transform({
				element: dataElement,
				transformationSequence: transformationSequence
			});
		},
		Color: function(gpmlColorValue) {
			const cssColor = this.gpmlColorToCssColor(gpmlColorValue);
			dataElement.color = cssColor;
		},
		Comment: function(gpmlValue: string[]) {
			// NOTE: comments come into here grouped into an array.
			//       See tagNamesForSupplementalElementsWithText in main.ts
			if (!isEmpty(gpmlValue)) {
				dataElement.comment = gpmlValue.map((c) => decode(c));
			}
		},
		ConnectorType: function(gpmlConnectorTypeValue) {
			const gpmlConnectorType = gpmlConnectorTypeValue;
			dataElement.drawAs = gpmlConnectorType + 'Line';
		},
		Database: function(gpmlValue) {
			if (gpmlValue) {
				dataElement.dbName = gpmlValue.trim();
			}
		},
		'Data-Source': function(gpmlValue) {
			if (gpmlValue) {
				dataElement.dataSource = decode(gpmlValue);
			}
		},
		Email: function(gpmlValue) {
			if (gpmlValue) {
				dataElement.email = decode(gpmlValue);
			}
		},
		FillColor: function(gpmlFillColorValue) {
			const cssColor = this.gpmlColorToCssColor(gpmlFillColorValue);
			if (gpmlShapeType.toLowerCase() !== 'none') {
				dataElement.backgroundColor = cssColor;
			} else {
				dataElement.backgroundColor = 'transparent';
			}
		},
		FillOpacity: function(gpmlFillOpacityValue) {
			const cssFillOpacity = parseAsNonNaNNumber(gpmlFillOpacityValue);
			dataElement.fillOpacity = cssFillOpacity;
		},
		FontName: function(gpmlFontNameValue) {
			dataElement.fontFamily = gpmlFontNameValue;
		},
		FontSize: function(gpmlFontSizeValue) {
			dataElement.fontSize = parseAsNonNaNNumber(gpmlFontSizeValue);
		},
		FontStyle: function(gpmlFontStyleValue) {
			const cssFontStyle = gpmlFontStyleValue.toLowerCase();
			dataElement.fontStyle = cssFontStyle;
		},
		FontWeight: function(gpmlFontWeightValue) {
			const cssFontWeight = gpmlFontWeightValue.toLowerCase();
			dataElement.fontWeight = cssFontWeight;
		},
		GraphId: function(gpmlValue) {
			dataElement.id = gpmlValue;
		},
		GraphRef: function(gpmlValue) {
			dataElement.isAttachedTo = gpmlValue;
		},
		GroupId: function(gpmlValue: string) {
			data.GraphIdToGroupId[dataElement.id] = gpmlValue;
		},
		GroupRef: function(gpmlValue) {
			let groupContents = data.containedIdsByGroupId[gpmlValue] = data.containedIdsByGroupId[gpmlValue] || [];
			groupContents.push(dataElement.id);
		},
		Height: function(gpmlValue) {
			// NOTE: this will be corrected, if needed, when CenterY is evaluated
			dataElement.height = parseAsNonNaNNumber(gpmlValue) + dataBorderWidth;
			if (lineStyleIsDouble) {
				dataElement.height += dataBorderWidth;
			}
		},
		Href: function(gpmlHrefValue) {
			if (gpmlHrefValue) {
				dataElement.href = encodeURI(decode(gpmlHrefValue));
			}
		},
		ID: function(gpmlValue) {
			if (gpmlValue) {
				dataElement.dbId = gpmlValue.trim();
			}
		},
		'Last-Modified': function(gpmlValue) {
			dataElement.lastModified = gpmlValue;
		},
		License: function(gpmlValue) {
			if (gpmlValue) {
				dataElement.license = decode(gpmlValue);
			}
		},
		LineStyle: function(gpmlLineStyleValue) {
			dataElement.lineStyle = gpmlLineStyleValue;
			let dataStrokeDasharray;
			// TODO hard-coding these here is not the most maintainable
			if (gpmlLineStyleValue === 'Broken') {
				dataStrokeDasharray = '5,3';
				dataElement.strokeDasharray = dataStrokeDasharray;
			} else if (gpmlLineStyleValue === 'Double') {
				lineStyleIsDouble = true;
			}
		},
		LineThickness: function(gpmlLineThicknessValue) {
			dataBorderWidth = parseAsNonNaNNumber(gpmlLineThicknessValue);
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
			// data width/height values will not match GPML Width/Height values.
			//
			// data width = GPML Width + GPML LineThickness
			// data height = GPML Height + GPML LineThickness
			// (one half LineThickness on either side yields a full LineThickness to add
			// to width/height).
			//
			// Also note that for double lines, LineThickness refers to the the border
			// width of each line and the space between each line, meaning the border width
			// for the double line as a whole will be three times the listed LineThickness.

			dataElement.borderWidth = dataBorderWidth;
		},
		Maintainer: function(gpmlValue) {
			if (gpmlValue) {
				dataElement.maintainer = decode(gpmlValue);
			}
		},
		Name: function(nameValue) {
			if (nameValue) {
				dataElement.name = decode(nameValue);
				const splitName = nameValue.split(' (');
				if (!!splitName &&
						splitName.length === 2 &&
							!!nameValue.match(/\(/g) &&
								nameValue.match(/\(/g).length === 1 &&
									!!nameValue.match(/\)/g) &&
										nameValue.match(/\)/g).length === 1) {
					dataElement.standardName = splitName[0];
					dataElement.displayName = splitName[1].replace(')', '');
				} else {
					dataElement.standardName = nameValue;
					dataElement.displayName = nameValue;
				}
			}
		},
		Organism: function(gpmlValue) {
			dataElement.organism = gpmlValue;
		},
		Padding: function(gpmlPaddingValue) {
			dataElement.padding = gpmlPaddingValue;
		},
		Point: function(gpmlValue) {
			// Saving this to fully convert later (after every appropriate element has been put into data.elementMap).
			dataElement['gpml:Point'] = gpmlValue;
		},
		Position: function(gpmlPositionValue) {
			dataElement.attachmentDisplay = {
				position: [parseAsNonNaNNumber(gpmlPositionValue)]
			};
		},
		RelX: function(gpmlValue) {
			let attachmentDisplay = dataElement.attachmentDisplay = dataElement.attachmentDisplay || {} as attachmentDisplay;
			let position = attachmentDisplay.position = attachmentDisplay.position || [];
			const gpmlRelX = parseAsNonNaNNumber(gpmlValue);
			position[0] = (gpmlRelX + 1) / 2;
		},
		RelY: function(gpmlValue) {
			let attachmentDisplay = dataElement.attachmentDisplay = dataElement.attachmentDisplay || {} as attachmentDisplay;
			let position = attachmentDisplay.position = attachmentDisplay.position || [];
			const gpmlRelY = parseAsNonNaNNumber(gpmlValue);
			position[1] = (-1 * gpmlRelY - 1) / 2;
		},
		Rotation: function(gpmlValue) {
			// GPML can hold a rotation value for State elements in an element
			// named "Attribute" like this:
			// Key="org.pathvisio.core.StateRotation"
			// From discussion with AP and KH, we've decided to ignore this value,
			// because we don't actually want States to be rotated.

			gpmlRotation = parseAsNonNaNNumber(gpmlValue);

			// GPML saves rotation in radians, even though PathVisio-Java displays rotation in degrees.
			// Convert from radians to degrees:
			const dataRotation = gpmlRotation * 180 / Math.PI;
			if (gpmlRotation !== 0) {
				dataElement.rotation = dataRotation;
			}

			/*
			// This conversion changes the rotation to reflect the angle between the green rotation
			// control dot in PathVisio-Java and the X-axis.
			// The units are radians, unlike the units for dataRotation.
			var angleToControlPoint = 2 * Math.PI - gpmlRotation;
			//*/
		},
		Shape: processShapeType,
		ShapeType: processShapeType,
		//Shape: this.ShapeType,
		Style: function(gpmlValue) {
			if (gpmlElementName === 'Group') {
				dataElement['gpml:Style'] = gpmlValue;
				dataElement.type = unionLSV(dataElement.type, 'Group' + gpmlValue) as string[];
			} else {
				throw new Error('Did not expect Style attribute on ' + gpmlElementName);
			}
		},
		TextLabel: function(gpmlTextLabelValue) {
			if (gpmlTextLabelValue) {
				dataElement.displayName = decode(gpmlTextLabelValue);
			}
		},
		Type: function(gpmlValue) {
			let wpType;
			if (wpType) {
				wpType = gpmlValue;
			} else if (gpmlElementName === 'DataNode') {
				// NOTE: when the DataNode is set to have a Type of "Unknown" in PathVisio-Java,
				// it is serialized into GPML without a Type attribute.
				wpType = 'Unknown';
			}
			if (wpType) {
				dataElement.wpType = gpmlValue;
			}
		},
		Valign: function(gpmlValignValue) {
			dataElement.verticalAlign = paramCase(gpmlValignValue);
		},
		Version: function(gpmlValue) {
			// This usually appears to be referring to the version from the DataSource,
			// not to the WikiPathways version.
			dataElement.dataSource += ', version: ' + gpmlValue;
		},
		Width: function(gpmlValue) {
			// NOTE: this will be corrected, if needed, when CenterY is evaluated
			dataElement.width = parseAsNonNaNNumber(gpmlValue) + dataBorderWidth;
			if (lineStyleIsDouble) {
				dataElement.width += dataBorderWidth;
			}
		},
		ZOrder: function(gpmlZOrderValue) {
			dataElement.zIndex = parseAsNonNaNNumber(gpmlZOrderValue);
		},
		// everything below in this object: helper values/functions
		gpmlColorToCssColor: function(gpmlColor) {
			let color;
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

	dataElement = convertAttributesToJson(
			gpmlElement,
			dataElement,
			gpmlToDataConverter,
			ATTRIBUTE_DEPENDENCY_ORDER
	);

	dataElement.type = [gpmlElementName];

	data[gpmlElementName].push(dataElement.id);

	if (gpmlElement.name !== 'Pathway') {
		data.elementMap[dataElement.id] = dataElement;
	} else {
		data = dataElement;
	}

	return data;
};
