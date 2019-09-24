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
// Rotation input field in the UI.
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

export function ID(gpmlElement) {
  if (gpmlElement.hasOwnProperty("ID")) {
    const { ID } = gpmlElement;
    return isString(ID) ? ID : ID.content;
  } else {
    return gpmlElement.Xref.ID;
  }
}
// GPML2013-ish incorrectly used "rdf:id" where it was intented
// to use "rdf:ID". We corrected that error before processing,
// but CXML turns "rdf:ID" into "ID", and since we already have
// a property "ID" on the element, CXML uses "$ID".
export const $ID = flow(
  get("$ID"),
  generatePublicationXrefId
);
export const DB = flow(
  get("DB.content"),
  decodeIfNotEmpty
);
export const TITLE = flow(
  get("TITLE.content"),
  decodeIfNotEmpty
);
export const SOURCE = flow(
  get("SOURCE.content"),
  decodeIfNotEmpty
);
// TODO: why doesn't TypeScript like the following?
//export const YEAR = get("YEAR.content");
export const YEAR = function(x) {
  return x.YEAR.content;
  //return get("YEAR.content");
};
export const AUTHORS = flow(
  get("AUTHORS"),
  map(
    flow(
      get("content"),
      decodeIfNotEmpty
    )
  )
);
export const BiopaxRef = flow(
  get("BiopaxRef"),
  map(generatePublicationXrefId)
);

/*
Meanings of Width
-----------------

In PathVisio-Java, GPML Width/Height for GPML Shapes is
inconsistent when zoomed in vs. when at default zoom level.

When zoomed in, GPML Width/Height refers to the distance from center of stroke (border)
one one edge to center of stroke (border) on the opposite edge, meaning that shapes that
run up to the edge are cropped.

When at default zoom level, GPML Width/Height refers to the distance from outer edge of
stroke (border) to outer edge of stroke (border) with no cropping.

Because of this, LineThickness is also inconsistent.
When zoomed in: approx. one half of specified LineThickness.
When at default zoom level: approx. full specified LineThickness.

For double lines, LineThickness refers to the the stroke (border) width of each line and
the space between each line, meaning the stroke (border) width
for the double line as a whole will be three times the listed LineThickness.

For pvjs, we define GPML Width/Height to be from outer edge of stroke (border) on one
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
	 - LineStyle NOT Double
		 visible width ≈ GPMLWidth
		 visible height ≈ GPMLHeight
		 (matches box-sizing: border-box)
	 - LineStyle Double
		 visible width ≈ Width + 1.5 * LineThickness
		 visible height ≈ Height + 1.5 * LineThickness
 - Zoomed out
	 - LineStyle NOT Double
		 visible width ≈ GPMLWidth + LineThickness
		 visible height ≈ GPMLHeight + LineThickness
		 (matches box-sizing: border-box)
		 (one half LineThickness on either side yields a full LineThickness to add
			to width/height).
	 - LineStyle Double
		 visible width = Width + 3 * LineThickness
		 visible height = Height + 3 * LineThickness
* SVG: visible width = width + stroke-width
* kaavio/pvjs: same as DOM box model with box-sizing: border-box
//*/
const getDimension = curry(function(dimensionName, gpmlElement) {
  const dimension = gpmlElement.Graphics[dimensionName];
  if (
    findIndex(function({ Key, Value }) {
      return Key === "org.pathvisio.DoubleLineProperty";
    }, gpmlElement.Attribute) > -1
  ) {
    return dimension + LineThickness(gpmlElement);
  } else {
    return dimension;
  }
});
export const Height = getDimension("Height");
export const Width = getDimension("Width");

export function CenterX(gpmlElement) {
  const { CenterX } = gpmlElement.Graphics;
  return CenterX - Width(gpmlElement) / 2;
}

export function CenterY(gpmlElement) {
  const { CenterY } = gpmlElement.Graphics;
  return CenterY - Height(gpmlElement) / 2;
}

export function Rotation(gpmlElement): number {
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
  const Rotation = !isDefinedCXML(Graphics.Rotation) ? 0 : Graphics.Rotation;

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
      GPML_ROTATION_SIDE_TO_RAD.hasOwnProperty(Rotation)
        ? GPML_ROTATION_SIDE_TO_RAD[Rotation]
        : parseAsNonNaNNumber(Rotation)
    )
  );
}

export function LineStyle(gpmlElement) {
  const { LineStyle } = gpmlElement.Graphics;
  // TODO hard-coding this here is not the most maintainable
  if (LineStyle === "Solid") {
    // this gets converted to strokeDasharray,
    // and we don't need this value when it's
    // solid, so we return undefined, because
    // then this won't be included.
    return;
  } else if (LineStyle === "Broken") {
    return "5,3";
  } else {
    throw new Error(`Unrecognized LineStyle: ${LineStyle}`);
  }
}

export const Author = flow(
  get("Author"),
  decodeIfNotEmpty
);
export const DataSource = flow(
  get("Data-Source"),
  decodeIfNotEmpty
);
export const Email = flow(
  get("Email"),
  decodeIfNotEmpty
);
export const Maintainer = flow(
  get("Maintainer"),
  decodeIfNotEmpty
);
export const Name = flow(
  get("Name"),
  decodeIfNotEmpty
);

export const TextLabel = flow(
  get("TextLabel"),
  decodeIfNotEmpty
);

// TODO is this ever used?
// The only way I see to create underlined text in PathVisio-Java
// is to create a Label and fill in the Link field.
// But the resulting GPML does not have a FontDecoration attribute.
export function getTextDecorationFromGPMLElement(gpmlElement) {
  const { FontDecoration, FontStrikethru } = gpmlElement.Graphics;
  let outputChunks = [];
  const fontDecorationDefined =
    isDefinedCXML(FontDecoration) && FontDecoration === "Underline";
  const fontStrikethruDefined =
    isDefinedCXML(FontStrikethru) && FontStrikethru === "Strikethru";
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
export const Align = flow(
  get("Graphics.Align"),
  kebabCase
);
export const FontDecoration = getTextDecorationFromGPMLElement;
export const FontStrikethru = getTextDecorationFromGPMLElement;
export const FontStyle = flow(
  get("Graphics.FontStyle"),
  kebabCase
);
export const FontWeight = flow(
  get("Graphics.FontWeight"),
  kebabCase
);
export const Valign = flow(
  get("Graphics.Valign"),
  kebabCase
);

export const Href = flow(
  get("Href"),
  decodeIfNotEmpty,
  encodeURI
);

export function gpmlColorToCssColor(colorValue) {
  const colorValueLowerCased = colorValue.toLowerCase();
  if (["transparent", "none"].indexOf(colorValueLowerCased) > -1) {
    return colorValueLowerCased;
  } else {
    let color = new RGBColor(colorValue);
    if (!color.ok) {
      throw new VError(
        `
				Failed to get a valid CSS color for gpmlColorToCssColor(${colorValue})
				Is there an invalid Color or FillColor in the GPML?
				`
      );
      // TODO should we use this?
      // return "#c0c0c0";
    }
    return color.toHex();
  }
}

export const Color = flow(
  get("Graphics.Color"),
  gpmlColorToCssColor
);

export function FillColor(gpmlElement) {
  const { FillColor, ShapeType } = gpmlElement.Graphics;
  // If it's a GPML Group, DataNode, Shape, Label or State, it needs a
  // ShapeType in order for it to have a FillColor, but a
  // GPML Interaction or GraphicalLine can have a FillColor
  // without having a ShapeType.
  return (!!ShapeType && ShapeType.toLowerCase() !== "none") ||
    gpmlElement.Graphics.hasOwnProperty("Point")
    ? gpmlColorToCssColor(FillColor)
    : "transparent";
}

export function LineThickness(gpmlElement) {
  const { LineThickness, ShapeType } = gpmlElement.Graphics;
  // See note near Height converter regarding LineThickness.

  // If it's a GPML Group, DataNode, Shape, Label or State, it needs a
  // ShapeType in order for it to have a LineThickness > 0, but a
  // GPML Interaction or GraphicalLine can have a LineThickness > 0
  // without having a ShapeType.
  if (!isDefinedCXML(LineThickness)) {
    return 0;
  } else if (isDefinedCXML(ShapeType) && ShapeType.toLowerCase() !== "none") {
    /*
		return findIndex(function({ Key, Value }) {
			return Key === "org.pathvisio.DoubleLineProperty";
		}, gpmlElement.Attribute) > -1 ? LineThickness * 3 : LineThickness;
		//*/

    /*
		return findIndex(function({ Key, Value }) {
			return Key === "org.pathvisio.DoubleLineProperty";
		}, gpmlElement.Attribute) > -1 ? LineThickness : LineThickness * 2;
		//*/

    //return LineThickness * 2;
    return LineThickness;
  } else if (gpmlElement.Graphics.hasOwnProperty("Point")) {
    return LineThickness;
  } else {
    return 0;
  }
}

export function ConnectorType(gpmlElement): string {
  const { ConnectorType } = gpmlElement.Graphics;
  return ConnectorType + "Line";
}

// We return a partial attachmentDisplay, because it's
// merged with the other items as we come across them.
export function Position(gpmlElement): AttachmentDisplay {
  const { Position } = gpmlElement;
  return {
    position: [Position, 0],
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

// We actually handle both RelX and RelY together
// when we hit RelX and then ignoring when we
// hit RelY.
// We return a partial attachmentDisplay, because it's
// merged with the other items as we come across them.
export function RelX(gpmlElement): AttachmentDisplay {
  // first is for a State (?), second is for a Point
  const RelXRelYContainer = isDefinedCXML(gpmlElement.Graphics)
    ? gpmlElement.Graphics
    : gpmlElement;
  const { RelX, RelY } = RelXRelYContainer;

  const {
    relativeOffsetScalar: relativeOffsetScalarX,
    positionScalar: positionScalarX
  } = getPositionAndRelativeOffsetScalarsAlongAxis(RelX);

  const {
    relativeOffsetScalar: relativeOffsetScalarY,
    positionScalar: positionScalarY
  } = getPositionAndRelativeOffsetScalarsAlongAxis(RelY);

  return {
    position: [positionScalarX, positionScalarY],
    // we can't calculate absolute offset until we get the
    // referenced element width/height
    offset: ([] as number[]) as [number, number],
    relativeOffset: [relativeOffsetScalarX, relativeOffsetScalarY]
  };
}
