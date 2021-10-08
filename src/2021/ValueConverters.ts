import {
  curry,
  findIndex,
  flow,
  get,
  isEmpty,
  isNaN,
  isString,
  kebabCase,
  map
} from "lodash/fp";
const RGBColor = require("rgbcolor");
import * as VError from "verror";
import { decode } from "he";

import {
  generatePublicationXrefId,
  transform,
  unionLSV
} from "../gpml-utilities";
import { normalize, radiansToDegrees } from "../spinoffs/Angle";
import { isDefinedCXML } from "../gpml-utilities";
import { AttachmentDisplay } from "../gpml2pvjson";

// TODO are these ever used? PathVisio-Java
// does not accept them as inputs in the
// rotation input field in the UI.
// TODO if they are used, are the notes in
// the XSD correct, or would "Right" actually
// be 0 radians?
const GPML_ROTATION_SIDE_TO_RAD = {
  Top: 0,
  Right: 0.5 * Math.PI,
  Bottom: Math.PI,
  Left: (3 / 2) * Math.PI
};

function decodeIfNotEmpty(input) {
  return isEmpty(input) ? input : decode(input);
}

function parseAsNonNaNNumber(i: number | string): number {
  const parsed = Number(i);
  if (isNaN(parsed)) {
    throw new Error('Cannot parse "' + String(i) + '" as non-NaN number');
  }
  return parsed;
}

//*****************
// Value Converters
//*****************

// NOTE: we use He.decode for many of these
// because at some point some GPML files were
// processed w/out using UTF-8, leaving some
// strings garbled, such as author names.

// TODO backpageHead could be further processed to yield displayName and standardName

export function identifier(gpmlElement) {
  return gpmlElement.hasOwnProperty("identifier") ? gpmlElement.identifier : gpmlElement.Xref.identifier;
}
export const dataSource = flow(
  get("dataSource"),
  decodeIfNotEmpty
);

/*
Meanings of width
-----------------

In PathVisio-Java, GPML width/height for GPML Shapes is
inconsistent when zoomed in vs. when at default zoom level.

When zoomed in, GPML width/height refers to the distance from center of stroke (border)
one one edge to center of stroke (border) on the opposite edge, meaning that shapes that
run up to the edge are cropped.

When at default zoom level, GPML width/height refers to the distance from outer edge of
stroke (border) to outer edge of stroke (border) with no cropping.

Because of this, LineThickness is also inconsistent.
When zoomed in: approx. one half of specified LineThickness.
When at default zoom level: approx. full specified LineThickness.

For double lines, LineThickness refers to the the stroke (border) width of each line and
the space between each line, meaning the stroke (border) width
for the double line as a whole will be three times the listed LineThickness.

For pvjs, we define GPML width/height to be from outer edge of stroke (border) on one
side to outer edge of stroke (border) on the opposite site, meaning visible width/height
may not exactly match between pvjs and PathVisio.
See issue https://github.com/PathVisio/pathvisio/issues/59

* DOM box model
 - box-sizing: border-box
	 visible width = width
		 (width means border + padding + width of the content)
		 (see https://css-tricks.com/international-box-sizing-awareness-day/)
 - box-sizing: content-box
	 visible width = width + border + padding 
		 (width means width of the content)
* PathVisio-Java
 - Zoomed in
	 - borderStyle NOT Double
		 visible width ≈ GPMLWidth
		 visible height ≈ GPMLHeight
		 (matches box-sizing: border-box)
	 - borderStyle Double
		 visible width ≈ width + 1.5 * LineThickness
		 visible height ≈ height + 1.5 * LineThickness
 - Zoomed out
	 - borderStyle NOT Double
		 visible width ≈ GPMLWidth + LineThickness
		 visible height ≈ GPMLHeight + LineThickness
		 (matches box-sizing: border-box)
		 (one half LineThickness on either side yields a full LineThickness to add
			to width/height).
	 - borderStyle Double
		 visible width = width + 3 * LineThickness
		 visible height = height + 3 * LineThickness
* SVG: visible width = width + stroke-width
* kaavio/pvjs: same as DOM box model with box-sizing: border-box
//*/
const getDimension = curry(function(dimensionName, gpmlElement) {
  const dimension = gpmlElement.Graphics[dimensionName];
  if (
    gpmlElement.Graphics.borderStyle == "Double"
  ) {
    return dimension + borderWidth(gpmlElement);
  } else if (
    gpmlElement.Graphics.lineStyle == "Double"
  ) {
    return dimension + lineWidth(gpmlElement);
  } else {
    return dimension;
  }
});
export const height = getDimension("height");
export const width = getDimension("width");

export function centerX(gpmlElement) {
  return gpmlElement.Graphics.centerX - width(gpmlElement) / 2;
}

export function centerY(gpmlElement) {
  return gpmlElement.Graphics.centerY - height(gpmlElement) / 2;
}

export function rotation(gpmlElement): number {
  // NOTE: the rotation input field in the PathVisio-Java UI expects degrees,
  // but GPML expresses rotation in radians. The XSD indicates GPML can also
  // use directional strings, although I haven't seen one used in actual GPML.
  // For both the PathVisio-Java UI and GPML, a positive value means clockwise
  // rotation.

  // NOTE: GPML can hold a rotation value for State elements in an element
  // named "Attribute" like this:
  // Key="org.pathvisio.core.StateRotation"
  // From discussion with AP and KH, we've decided to ignore this value,
  // because we don't actually want States to be rotated.

  const { Graphics } = gpmlElement;
  const rotation = !isDefinedCXML(Graphics.rotation) ? 0 : Graphics.rotation;

  // NOTE: Output is in degrees, because that's what the SVG transform
  // attribute accepts. Don't get confused, because we use radians in
  // the edge processing.
  //
  // NOTE: to make it as simple as possible for users to work with pvjson,
  // we're normalizing these rotation values so they are always positive values
  // between 0 and 2 * Math.PI, e.g.,
  // (3/2) * Math.PI, not -1 * Math.PI/2 or (7/3) * Math.PI
  return radiansToDegrees(
    normalize(
      GPML_ROTATION_SIDE_TO_RAD.hasOwnProperty(rotation)
        ? GPML_ROTATION_SIDE_TO_RAD[rotation]
        : parseAsNonNaNNumber(rotation)
    )
  );
}

export const textLabel = flow(
  get("textLabel"),
  decodeIfNotEmpty
);

// TODO is this ever used?
// The only way I see to create underlined text in PathVisio-Java
// is to create a Label and fill in the Link field.
// But the resulting GPML does not have a fontDecoration attribute.
export function getTextDecorationFromGPMLElement(gpmlElement) {
  const { fontDecoration, fontStrikethru } = gpmlElement.Graphics;
  let outputChunks = [];
  const fontDecorationDefined =
    isDefinedCXML(fontDecoration) && fontDecoration === "Underline";
  const fontStrikethruDefined =
    isDefinedCXML(fontStrikethru) && fontStrikethru === "Strikethru";
  if (fontDecorationDefined || fontStrikethruDefined) {
    if (fontDecorationDefined) {
      outputChunks.push("underline");
    }
    if (fontStrikethruDefined) {
      outputChunks.push("line-through");
    }
  } else {
    outputChunks.push("none");
  }
  return outputChunks.join(" ");
}
export const hAlign = flow(
  get("Graphics.hAlign"),
  kebabCase
);
export const fontDecoration = getTextDecorationFromGPMLElement;
export const fontStrikethru = getTextDecorationFromGPMLElement;
export const fontStyle = flow(
  get("Graphics.fontStyle"),
  kebabCase
);
export const fontWeight = flow(
  get("Graphics.fontWeight"),
  kebabCase
);
export const vAlign = flow(
  get("Graphics.vAlign"),
  kebabCase
);

export const Href = flow(
  get("Href"),
  decodeIfNotEmpty,
  encodeURI
);

export function gpmlColorToCssColor(colorValue) {
  const colorValueLowerCased = colorValue.toLowerCase();
  // TODO: RGBColor can't handle 8 character color hex values,
  // but GPML2021 uses them. I'm temporarily just passing along
  // selected values, but that's not a good solution.

  // If this is an 8-digit hex code
  if (/^[0-9a-f]{8}$/i.test(colorValueLowerCased)) {
    if (colorValueLowerCased.slice(-2) == "00") {
      return "transparent";
    } else {
      return `#${colorValueLowerCased}`;
    }
  } else if (["transparent", "none"].indexOf(colorValueLowerCased) > -1) {
    return colorValueLowerCased;
  } else {
    let color = new RGBColor(colorValue);
    if (!color.ok) {
      throw new VError(
        `
				Failed to get a valid CSS color for gpmlColorToCssColor(${colorValue})
				Is there an invalid border, textColor or fillColor in the GPML?
				`
      );
      // TODO should we use this?
      // return "#c0c0c0";
    }
    return color.toHex();
  }
}

export const borderColor = flow(
  get("Graphics.borderColor"),
  gpmlColorToCssColor
);

export const lineColor = flow(
  get("Graphics.lineColor"),
  gpmlColorToCssColor
);

export const textColor = flow(
  get("Graphics.textColor"),
  gpmlColorToCssColor
);

export function fillColor(gpmlElement) {
  const { fillColor, shapeType } = gpmlElement.Graphics;
  // If it's a GPML Group, DataNode, Shape, Label or State, it needs a
  // shapeType in order for it to have a fillColor, but a
  // GPML Interaction or GraphicalLine can have a fillColor
  // without having a shapeType.
  return (!!shapeType && shapeType.toLowerCase() !== "none") ||
    (gpmlElement.hasOwnProperty("Waypoints") && gpmlElement.Waypoints.hasOwnProperty("Point"))
    ? gpmlColorToCssColor(fillColor)
    : "transparent";
}

export function borderWidth(gpmlElement) {
  const { borderWidth, shapeType } = gpmlElement.Graphics;
  // See note near height converter regarding borderWidth.

  // If it's a GPML Group, DataNode, Shape, Label or State, it needs a
  // shapeType in order for it to have a borderWidth > 0, but a
  // GPML Interaction or GraphicalLine can have a borderWidth > 0
  // without having a shapeType.
  if (!isDefinedCXML(borderWidth)) {
    return 0;
  } else if (isDefinedCXML(shapeType) && shapeType.toLowerCase() !== "none") {
    return borderWidth;
  } else {
    return 0;
  }
}

export function lineWidth(gpmlElement) {
  const { lineWidth, shapeType } = gpmlElement.Graphics;
  // See note near height converter regarding lineWidth.

  // If it's a GPML Group, DataNode, Shape, Label or State, it needs a
  // shapeType in order for it to have a lineWidth > 0, but a
  // GPML Interaction or GraphicalLine can have a lineWidth > 0
  // without having a shapeType.
  if (!isDefinedCXML(lineWidth)) {
    return 0;
  } else {
    return lineWidth;
  }
}

export function connectorType(gpmlElement): string {
  const { connectorType } = gpmlElement.Graphics;
  return connectorType + "Line";
}

// We return a partial attachmentDisplay, because it's
// merged with the other items as we come across them.
export function position(gpmlElement): AttachmentDisplay {
  const { position } = gpmlElement;
  return {
    position: [position, 0],
    // a GPML Anchor never has an offset
    offset: [0, 0]
  } as AttachmentDisplay;
}

/**
 * getPositionAndRelativeOffsetScalarsAlongAxis
 *
 * @param relValue {number}
 * @return {OffsetOrientationAndPositionScalarsAlongAxis}
 */
function getPositionAndRelativeOffsetScalarsAlongAxis(
  relValue: number
): { relativeOffsetScalar: number; positionScalar: number } {
  let relativeOffsetScalar;
  let positionScalar;

  const relativeToUpperLeftCorner = (relValue + 1) / 2;
  if (relativeToUpperLeftCorner < 0 || relativeToUpperLeftCorner > 1) {
    if (relativeToUpperLeftCorner < 0) {
      positionScalar = 0;
      relativeOffsetScalar = relativeToUpperLeftCorner;
    } else {
      positionScalar = 1;
      relativeOffsetScalar = relativeToUpperLeftCorner - 1;
    }
  } else {
    positionScalar = relativeToUpperLeftCorner;
    relativeOffsetScalar = 0;
  }

  if (!isFinite(positionScalar) || !isFinite(relativeOffsetScalar)) {
    throw new Error(
      `Expected finite values for positionScalar ${positionScalar} and relativeOffsetScalar ${relativeOffsetScalar}`
    );
  }

  return { relativeOffsetScalar, positionScalar };
}

// We actually handle both relX and relY together
// when we hit relX and then ignoring when we
// hit relY.
// We return a partial attachmentDisplay, because it's
// merged with the other items as we come across them.
export function relX(gpmlElement): AttachmentDisplay {
  // first is for a State (?), second is for a Point
  const relXRelYContainer = isDefinedCXML(gpmlElement.Graphics)
    ? gpmlElement.Graphics
    : gpmlElement;
  const { relX, relY } = relXRelYContainer;

  const {
    relativeOffsetScalar: relativeOffsetScalarX,
    positionScalar: positionScalarX
  } = getPositionAndRelativeOffsetScalarsAlongAxis(relX);

  const {
    relativeOffsetScalar: relativeOffsetScalarY,
    positionScalar: positionScalarY
  } = getPositionAndRelativeOffsetScalarsAlongAxis(relY);

  return {
    position: [positionScalarX, positionScalarY],
    // we can't calculate absolute offset until we get the
    // referenced element width/height
    offset: ([] as number[]) as [number, number],
    relativeOffset: [relativeOffsetScalarX, relativeOffsetScalarY]
  };
}
