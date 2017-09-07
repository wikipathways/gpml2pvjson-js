import {
  clone,
  findIndex,
  flow,
  get,
  isEmpty,
  isNaN,
  isString,
  kebabCase,
  map,
  toLower
} from "lodash/fp";
import {
  generatePublicationXrefId,
  transform,
  unionLSV
} from "./gpml-utilities";
import { decode } from "he";
import RGBColor = require("rgbcolor");

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
// GPML2013a incorrectly used "rdf:id" where it was intented
// to use "rdf:ID". We corrected that error before processing,
// but CXML turns "rdf:ID" into "ID", and since we already have
// a property "ID" on the element, CXML uses "$ID".
export const $ID = flow(get("$ID"), generatePublicationXrefId);
export const DB = flow(get("DB.content"), decodeIfNotEmpty);
export const TITLE = flow(get("TITLE.content"), decodeIfNotEmpty);
export const SOURCE = flow(get("SOURCE.content"), decodeIfNotEmpty);
export const YEAR = get("YEAR.content");
//export const AUTHORS = map(flow(get("AUTHORS.content"), decodeIfNotEmpty));
//*
export function AUTHORS(gpmlElement) {
  return gpmlElement.AUTHORS.map(author => decodeIfNotEmpty(author.content));
}
export function BiopaxRef(gpmlElement) {
  return gpmlElement.BiopaxRef.map(generatePublicationXrefId);
}
//*/

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
  const actualLineThickness = LineThickness._exists === false
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
  const actualLineThickness = LineThickness._exists === false
    ? 0
    : findIndex(gpmlElement.Attribute, function({ Key, Value }) {
        return Key === "org.pathvisio.DoubleLineProperty";
      }) > -1
      ? LineThickness * 2
      : LineThickness;
  return Width + actualLineThickness;
}

const NON_NUMERIC_GPML_ROTATION_VALUES = {
  Top: 0,
  Right: 0.5 * Math.PI,
  Bottom: Math.PI,
  Left: 3 / 2 * Math.PI
};

export function Rotation(gpmlElement) {
  // NOTE: GPML can hold a rotation value for State elements in an element
  // named "Attribute" like this:
  // Key="org.pathvisio.core.StateRotation"
  // From discussion with AP and KH, we've decided to ignore this value,
  // because we don't actually want States to be rotated.

  const { Graphics } = gpmlElement;
  const Rotation = Graphics.Rotation._exists === false ? 0 : Graphics.Rotation;

  const rotationRadians = NON_NUMERIC_GPML_ROTATION_VALUES.hasOwnProperty(
    Rotation
  )
    ? NON_NUMERIC_GPML_ROTATION_VALUES[Rotation]
    : parseAsNonNaNNumber(Rotation);

  if (rotationRadians !== 0) {
    // GPML saves rotation in radians, even though PathVisio-Java displays rotation in degrees.
    // Convert from radians to degrees:
    return rotationRadians * 180 / Math.PI;
  }
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

export const FontStyle = flow(get("Graphics.FontStyle"), toLower);
export const FontWeight = flow(get("Graphics.FontWeight"), toLower);
export const Valign = flow(get("Graphics.Valign"), kebabCase);

export const Href = flow(get("Href"), decodeIfNotEmpty, encodeURI);

export function gpmlColorToCssColor(colorValue) {
  if (colorValue.toLowerCase() === "transparent") {
    return "transparent";
  } else {
    let color = new RGBColor(colorValue);
    if (color.ok) {
      return color.toHex();
    } else {
      console.warn(
        'Could not convert GPML Color or FillColor value of "' +
          colorValue +
          '" to a valid CSS color. Using "#c0c0c0" as a fallback.'
      );
      return "#c0c0c0";
    }
  }
}

export const Color = function(gpmlElement) {
  const { Color } = gpmlElement.Graphics;
  const result = gpmlColorToCssColor(Color);
  return result;
};

export function FillColor(gpmlElement) {
  const { FillColor, ShapeType } = gpmlElement.Graphics;
  const result = !!ShapeType && ShapeType.toLowerCase() !== "none"
    ? gpmlColorToCssColor(FillColor)
    : "transparent";
}

export function ConnectorType(gpmlElement) {
  const { ConnectorType } = gpmlElement.Graphics;
  return ConnectorType + "Line";
}

export function Position(gpmlElement) {
  const { Position } = gpmlElement;
  return {
    position: [Position]
  };
}

// actually handling both RelX and RelY
export function RelX(gpmlElement) {
  const { RelX, RelY } = gpmlElement.Graphics;
  return {
    position: [(RelX + 1) / 2, (RelY + 1) / 2]
  };
}
