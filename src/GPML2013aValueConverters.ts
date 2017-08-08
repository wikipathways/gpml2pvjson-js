import {
  findIndex,
  flow,
  get,
  isEmpty,
  isNaN,
  kebabCase,
  map,
  toLower
} from "lodash/fp";
import {
  applyDefaults as baseApplyDefaults,
  convertAttributesToJson,
  generatePublicationXrefId,
  transform,
  unionLSV
} from "./gpml-utilities";
import { decode } from "he";
import RGBColor = require("rgbcolor");

function parseAsNonNaNNumber(i: number | string): number {
  const parsed = Number(i);
  if (isNaN(parsed)) {
    throw new Error('Cannot parse "' + String(i) + '" as non-NaN number');
  }
  return parsed;
}

// Value Converters

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

export const Author = flow(get("Author"), decode);
export const DataSource = flow(get("Data-Source"), decode);
export const Email = flow(get("Email"), decode);
export const Maintainer = flow(get("Maintainer"), decode);
export const Name = flow(get("Name"), decode);

export const TextLabel = flow(get("TextLabel"), decode);

export const FontStyle = flow(get("Graphics.FontStyle"), toLower);
export const FontWeight = flow(get("Graphics.FontWeight"), toLower);
export const Valign = flow(get("Graphics.Valign"), kebabCase);

export const Href = flow(get("Href"), decode, encodeURI);

export function gpmlColorToCssColor(gpmlElement) {
  const { Color } = gpmlElement.Graphics;
  if (Color.toLowerCase() === "transparent") {
    return "transparent";
  } else {
    let color = new RGBColor(Color);
    if (color.ok) {
      return color.toHex();
    } else {
      console.warn(
        'Could not convert GPML Color value of "' +
          Color +
          '" to a valid CSS color. Using "#c0c0c0" as a fallback.'
      );
      return "#c0c0c0";
    }
  }
}

export const Color = gpmlColorToCssColor;

export function FillColor(gpmlElement) {
  const { Color, ShapeType } = gpmlElement.Graphics;
  return !!ShapeType && ShapeType.toLowerCase() !== "none"
    ? gpmlColorToCssColor(gpmlElement)
    : "transparent";
}

export function ConnectorType(gpmlElement) {
  const { ConnectorType } = gpmlElement.Graphics;
  return ConnectorType + "Line";
}

//// ******* OLD ********
//import { applyDefaults as applyAnchorDefaults } from "./anchor";
//import { applyDefaults as applyPathwayDefaults } from "./pathway";
//import { applyDefaults as applyGroupDefaults } from "./group";
//import { applyDefaults as applyDataNodeDefaults } from "./data-node";
//import { applyDefaults as applyGraphicalLineDefaults } from "./graphical-line";
//import { applyDefaults as applyInteractionDefaults } from "./interaction";
//import { applyDefaults as applyLabelDefaults } from "./label";
//import { applyDefaults as applyShapeDefaults } from "./shape";
//import { applyDefaults as applyStateDefaults } from "./state";
//
//const defaultsAppliers = {
//  Anchor: applyAnchorDefaults,
//  Pathway: applyPathwayDefaults,
//  Group: applyGroupDefaults,
//  DataNode: applyDataNodeDefaults,
//  GraphicalLine: applyGraphicalLineDefaults,
//  Interaction: applyInteractionDefaults,
//  Label: applyLabelDefaults,
//  Shape: applyShapeDefaults,
//  State: applyStateDefaults
//};
//
//const DEFAULTS = {
//  attributes: {
//    FillColor: "ffffff"
//  }
//};
//
//export function applyDefaults(gpmlElement) {
//  const gpmlElementName = gpmlElement.tagName;
//  if (defaultsAppliers.hasOwnProperty(gpmlElementName)) {
//    return defaultsAppliers[gpmlElementName](gpmlElement, DEFAULTS);
//  } else {
//    return baseApplyDefaults(gpmlElement, DEFAULTS);
//  }
//}
//
//export function fromGPML(
//  data: Data,
//  dataElement: DataElement & Data,
//  inputGPMLElement: GPMLElement
//) {
//  const gpmlElement = applyDefaults(inputGPMLElement);
//  const gpmlElementName = (dataElement.gpmlElementName = gpmlElement.tagName);
//
//  // Note side-effects required for these values,
//  // because subsequent values depend on them.
//  let gpmlRotation: number;
//
//  const ATTRIBUTE_DEPENDENCY_ORDER: GPMLAttributeNames[] = [
//    "GraphId",
//    "GroupId",
//    "GraphRef",
//    "GroupRef",
//    "Name",
//    "TextLabel",
//    "Type",
//    "CellularComponent",
//    "Rotation",
//    "LineStyle",
//    "Shape",
//    "ShapeType",
//    "Attribute",
//    "FillColor",
//    "Color",
//    "LineThickness",
//    "Width",
//    "Height",
//    "RelX",
//    "RelY",
//    "CenterX",
//    "CenterY",
//    "ConnectorType",
//    "Point",
//    "Organism",
//    "Database",
//    "ID",
//    "Data-Source",
//    "Version"
//  ];
//
//  let gpmlToDataConverter = {
//    BiopaxRef: function(gpmlValue: string[]) {
//      // NOTE: BiopaxRefs come into here grouped into an array.
//      //       See SUPPLEMENTAL_ELEMENTS_WITH_TEXT in toPvjson.ts
//      if (!isEmpty(gpmlValue)) {
//        dataElement.citation = gpmlValue.map(generatePublicationXrefId);
//      }
//    },
//    GroupId: function(gpmlValue: string) {
//      data.GraphIdToGroupId[dataElement.id] = gpmlValue;
//    },
//    GroupRef: function(gpmlValue) {
//      let groupContents = (data.containedIdsByGroupId[gpmlValue] =
//        data.containedIdsByGroupId[gpmlValue] || []);
//      groupContents.push(dataElement.id);
//    },
//    Padding: function(gpmlPaddingValue) {
//      dataElement.padding = gpmlPaddingValue;
//    },
//    Point: function(gpmlValue) {
//      // Saving this to fully convert later (after every appropriate element has been put into data.elementMap).
//      dataElement["gpml:Point"] = gpmlValue;
//    },
//    Position: function(gpmlPositionValue) {
//      dataElement.attachmentDisplay = {
//        position: [parseAsNonNaNNumber(gpmlPositionValue)]
//      };
//    },
//    RelX: function(gpmlValue) {
//      let attachmentDisplay = (dataElement.attachmentDisplay =
//        dataElement.attachmentDisplay || ({} as attachmentDisplay));
//      let position = (attachmentDisplay.position =
//        attachmentDisplay.position || []);
//      const gpmlRelX = parseAsNonNaNNumber(gpmlValue);
//      position[0] = (gpmlRelX + 1) / 2;
//    },
//    RelY: function(gpmlValue) {
//      let attachmentDisplay = (dataElement.attachmentDisplay =
//        dataElement.attachmentDisplay || ({} as attachmentDisplay));
//      let position = (attachmentDisplay.position =
//        attachmentDisplay.position || []);
//      const gpmlRelY = parseAsNonNaNNumber(gpmlValue);
//      position[1] = (gpmlRelY + 1) / 2;
//    }
//  };
//
//  dataElement = convertAttributesToJson(
//    gpmlElement,
//    dataElement,
//    gpmlToDataConverter,
//    ATTRIBUTE_DEPENDENCY_ORDER
//  );
//
//  data[gpmlElementName].push(dataElement.id);
//
//  if (gpmlElement.tagName !== "Pathway") {
//    data.elementMap[dataElement.id] = dataElement;
//  } else {
//    data = dataElement;
//  }
//
//  return data;
//}
