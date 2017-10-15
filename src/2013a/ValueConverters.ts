import {
  findIndex,
  flow,
  get,
  isEmpty,
  isNaN,
  isString,
  kebabCase,
  map
} from "lodash/fp";
import RGBColor = require("rgbcolor");
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
  Left: 3 / 2 * Math.PI
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
export const $ID = flow(get("$ID"), generatePublicationXrefId);
export const DB = flow(get("DB.content"), decodeIfNotEmpty);
export const TITLE = flow(get("TITLE.content"), decodeIfNotEmpty);
export const SOURCE = flow(get("SOURCE.content"), decodeIfNotEmpty);
export const YEAR = get("YEAR.content");
export const AUTHORS = flow(
  get("AUTHORS"),
  map(flow(get("content"), decodeIfNotEmpty))
);
export const BiopaxRef = flow(get("BiopaxRef"), map(generatePublicationXrefId));

export function CenterX(gpmlElement) {
  const { CenterX, Width } = gpmlElement.Graphics;
  return CenterX - Width / 2;
}

export function CenterY(gpmlElement) {
  const { CenterX, CenterY, Width, Height } = gpmlElement.Graphics;
  return CenterY - Height / 2;
}

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
export function Height(gpmlElement) {
  const { Height, LineThickness } = gpmlElement.Graphics;
  // NOTE: this will be corrected, if needed, when CenterY is evaluated
  const actualLineThickness = !isDefinedCXML(LineThickness)
    ? 0
    : findIndex(gpmlElement.Attribute, function({ Key, Value }) {
        return Key === "org.pathvisio.DoubleLineProperty";
      }) > -1
      ? LineThickness * 2
      : LineThickness;
  return Height + actualLineThickness;
}

export function Width(gpmlElement) {
  const { Width, LineThickness } = gpmlElement.Graphics;
  // NOTE: this will be corrected, if needed, when CenterY is evaluated
  const actualLineThickness = !isDefinedCXML(LineThickness)
    ? 0
    : findIndex(gpmlElement.Attribute, function({ Key, Value }) {
        return Key === "org.pathvisio.DoubleLineProperty";
      }) > -1
      ? LineThickness * 2
      : LineThickness;
  return Width + actualLineThickness;
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

export const Author = flow(get("Author"), decodeIfNotEmpty);
export const DataSource = flow(get("Data-Source"), decodeIfNotEmpty);
export const Email = flow(get("Email"), decodeIfNotEmpty);
export const Maintainer = flow(get("Maintainer"), decodeIfNotEmpty);
export const Name = flow(get("Name"), decodeIfNotEmpty);

export const TextLabel = flow(get("TextLabel"), decodeIfNotEmpty);

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
export const Align = flow(get("Graphics.Align"), kebabCase);
export const FontDecoration = getTextDecorationFromGPMLElement;
export const FontStrikethru = getTextDecorationFromGPMLElement;
export const FontStyle = flow(get("Graphics.FontStyle"), kebabCase);
export const FontWeight = flow(get("Graphics.FontWeight"), kebabCase);
export const Valign = flow(get("Graphics.Valign"), kebabCase);

export const Href = flow(get("Href"), decodeIfNotEmpty, encodeURI);

export function gpmlColorToCssColor(colorValue) {
  if (colorValue.toLowerCase() === "transparent") {
    return "transparent";
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

/*
import * as GPML2013aValueMappings from "./GPML2013aValueMappings.json";
function getFromValueMappings(gpmlValue) {
  return GPML2013aValueMappings[gpmlValue];
}
export const Shape = flow(get("Shape"), getFromValueMappings);
export const ShapeType = flow(get("Graphics.ShapeType"), getFromValueMappings);
//*/

export const Color = flow(get("Graphics.Color"), gpmlColorToCssColor);

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
  return (!!ShapeType && ShapeType.toLowerCase() !== "none") ||
    gpmlElement.Graphics.hasOwnProperty("Point")
    ? LineThickness
    : 0;
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
    offset: [] as [number, number],
    relativeOffset: [relativeOffsetScalarX, relativeOffsetScalarY]
  };
}
