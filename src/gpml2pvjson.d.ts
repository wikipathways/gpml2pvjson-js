/// <reference path="./spinoffs/highland.d.ts" />
/// <reference path="./spinoffs/json.d.ts" />
/// <reference path="./spinoffs/rgbcolor.d.ts" />
/// <reference path="./spinoffs/sax.d.ts" />

// TODO look at how this definition file should be written.
// Is it best practice to essentially make this an ES module?
// That's what I need to do if I use the CXML-generated schema definitions
// in here, because CXML creates .d.ts files that use import/export.
// If I use import/export in this file, then declare doesn't work. Maybe it
// stops being an ambient/global declaration?
//
// Anyway, I think it's OK for now in terms of what gets published for this
// library, because the TS compiler extracts all the types into d.ts files.

export * from "../xmlns/pathvisio.org/GPML/2013a";

/* GPML */

type GPMLAttributeNames =
  | "xmlns"
  | "GroupId"
  | "GraphId"
  | "GraphRef"
  | "GroupRef"
  | "Name"
  | "TextLabel"
  | "Type"
  | "CellularComponent"
  | "Rotation"
  | "LineStyle"
  | "Shape"
  | "ShapeType"
  | "Attribute"
  | "FillColor"
  | "Color"
  | "LineThickness"
  | "Width"
  | "Height"
  | "RelX"
  | "RelY"
  | "CenterX"
  | "CenterY"
  | "ConnectorType"
  | "Point"
  | "Organism"
  | "Database"
  | "ID"
  | "Data-Source"
  | "ZOrder"
  | "Version";

type GPMLClassNames =
  | "PublicationXref"
  | "OpenControlledVocabulary"
  | "Anchor"
  | "Point"
  | "Interaction"
  | "GraphicalLine"
  | "DataNode"
  | "Label"
  | "Shape"
  | "Group"
  | "InfoBox"
  | "State";

type GPML_ATTRIBUTE_NAMES_AND_TYPES = { [K in GPMLAttributeNames]?: string };

export type GPMLElement = Record<string, any>;

/* pvjson */

export interface SegmentPoint {
  x: number;
  y: number;
  angle?: number;
}

export type Side = "top" | "right" | "bottom" | "left";
export interface StartSegmentDetailsMap {
  sideAttachedTo: Side;
  orientation: [number, number];
  angle: number; // radians
}

export interface OffsetOrientationAndPositionScalarsAlongAxis {
  positionScalar: number;
  orientationScalar: number;
  offsetScalar: number;
}

export interface Point {
  x: number;
  y: number;
  marker?: string;
}

// currently can only be first or last point
export interface AttachablePoint extends Point {
  tangentDirection?: number; // angle in radians
  orientation?: [number, number];
  isAttachedTo?: string;
  attachmentDisplay?: AttachmentDisplay;
}

export interface NodeDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface Corner {
  x: number;
  y: number;
}

export interface AttachmentDisplay {
  // for GPML States and Points:
  //   position: [
  //     distance to travel from left toward right / referenced entity width,
  //     distance to travel from top toward bottom / referenced entity height,
  //   ];
  //   because their attachment is defined in x, y
  //   vectors along the rectangular shape of what
  //   they're attached to.
  //
  // for GPML Anchors (which are attached to edges):
  //   position: [
  //     distance to travel from first toward last pt / referenced edge length,
  //     always zero, because an edge only has one dimension
  //   ];
  //   because their attachment is defined along
  //   a single axis, the axis of the edge to
  //   which they are attached.
  //
  // the origin is the top-left-most part of the entity to which
  // the other entity is attached.
  position: [number, number];
  relativeOffset?: [number, number];
  offset?: [number, number];
}

// This is not part of AttachmentDisplay, because the first point of an elbow
// connector has an orientation, even if it's not connected to anything.
export type Orientation = [number, number];

export interface Comment {
  content: string;
  source?: string;
}

type PvjsonEntityMergedStringProperties =
  | "author"
  | "backgroundColor"
  | "biopaxType"
  | "cellularComponent"
  | "color"
  | "controlled"
  | "controller"
  | "controlType"
  | "conversionDirection"
  | "dataSource"
  | "dbId" // xref identifier, e.g., 1234 for Entrez Gene 1234
  | "dbConventionalName" // e.g., Entrez Gene
  | "displayName"
  | "drawAs"
  | "email"
  //'entityReference' |
  | "fontFamily"
  | "fontStyle"
  | "fontWeight"
  //| "gpml:GroupRef"
  | "gpmlElementName"
  | "href"
  | "id" // @id
  | "isPartOf"
  | "kaavioType"
  | "lastModified"
  | "left"
  | "license"
  | "maintainer"
  | "markerEnd"
  | "markerStart"
  | "organism"
  | "right"
  | "source"
  | "standardName"
  | "strokeDasharray"
  | "textAlign"
  | "textContent"
  | "verticalAlign"
  | "wpInteractionType"
  | "wpType"
  | "year";

// This probably isn't a problem with parsing GPML,
// but if we need to parse non-numeric values like '0.5em',
// we can use something like this:
// https://github.com/sebmarkbage/art/blob/51ffce8164a555d652843241c2fdda52e186cbbd/parsers/svg/core.js#L170
type PvjsonEntityMergedNumberProperties =
  | "borderWidth"
  | "fillOpacity"
  | "fontSize"
  | "height"
  | "padding"
  | "position"
  | "relX"
  | "relY"
  | "rotation"
  | "textRotation"
  | "width"
  | "x"
  | "y"
  | "zIndex";

type PvjsonEntityMergedWithStringProperties = {
  [K in PvjsonEntityMergedStringProperties]?: string
};

type PvjsonEntityMergedWithNumberProperties = {
  [K in PvjsonEntityMergedNumberProperties]?: number
};

type PvjsonEntityMergedStringArrayProperties =
  | "authors"
  | "burrs"
  | "citations"
  | "contains"
  | "filters"
  | "lineStyle"
  | "sboInteractionType"
  | "participants"
  | "type";

type PvjsonEntityMergedWithStringArrayProperties = {
  [K in PvjsonEntityMergedStringArrayProperties]?: string[]
};

type PvjsonEntityMerged = PvjsonEntityMergedWithStringProperties &
  PvjsonEntityMergedWithNumberProperties &
  PvjsonEntityMergedWithStringArrayProperties & {
    attachmentDisplay?: AttachmentDisplay;
    comments?: Comment[];
    isAttachedTo?: string | string[];
    points?: Point[];
  };

// Includes GPML DataNode, Shape and Label
type PvjsonSingleFreeNodeRequiredKeys =
  | "backgroundColor"
  | "borderWidth"
  | "color"
  | "drawAs"
  | "height"
  | "id"
  | "gpmlElementName"
  | "kaavioType"
  | "padding"
  | "type"
  | "width"
  | "x"
  | "y"
  | "zIndex";
type PvjsonSingleFreeNodeOptionalKeys =
  | "burrs"
  | "citations"
  | "comments"
  | "cellularComponent"
  | "dbId"
  | "dbConventionalName"
  | "filters"
  | "fontWeight"
  | "isPartOf"
  | "rotation"
  | "textRotation"
  | "strokeDasharray"
  | "textAlign"
  | "verticalAlign"
  | "wpType";
export type PvjsonSingleFreeNode = {
  [K in PvjsonSingleFreeNodeRequiredKeys]: PvjsonEntityMerged[K]
} &
  { [K in PvjsonSingleFreeNodeOptionalKeys]?: PvjsonEntityMerged[K] };

type PvjsonGroupRequiredKeys =
  | "backgroundColor"
  | "borderWidth"
  | "color"
  | "contains"
  | "drawAs"
  | "height"
  | "id"
  | "gpmlElementName"
  | "kaavioType"
  | "padding"
  | "type"
  | "width"
  | "x"
  | "y"
  | "zIndex";
type PvjsonGroupOptionalKeys =
  | "burrs"
  | "cellularComponent"
  | "citations"
  | "comments"
  | "dbId"
  | "dbConventionalName"
  | "filters"
  | "strokeDasharray"
  | "textContent";
export type PvjsonGroup = {
  [K in PvjsonGroupRequiredKeys]: PvjsonEntityMerged[K]
} &
  { [K in PvjsonGroupOptionalKeys]?: PvjsonEntityMerged[K] };

type PathwayStarterRequiredKeys =
  | "fontSize"
  | "fontWeight"
  | "textAlign"
  | "verticalAlign";
export type PathwayStarter = PvjsonGroup &
  { [K in PathwayStarterRequiredKeys]: PvjsonEntityMerged[K] } & {
    // NOTE: the alignment and text properties only apply contents of current element.
    // They do not affect children.
    fontWeight: string;
    textAlign: string;
    verticalAlign: string;
    "@context"?: any;
    author?: string;
    dataSource?: string;
    email?: string;
    id?: string;
    isSimilarTo?: string;
    lastModified?: string;
    license?: string;
    maintainer?: string;
    name?: string;
    organism?: string;
  };

export interface Pathway extends PathwayStarter {
  "@context": any;
  name: string;
}

// decorations or other small elements attached to another element,
// e.g., GPML States and Anchors
type PvjsonBurrRequiredKeys =
  | "attachmentDisplay"
  | "backgroundColor"
  | "borderWidth"
  | "color"
  | "drawAs"
  | "height"
  | "id"
  | "gpmlElementName"
  | "kaavioType"
  | "padding"
  | "type"
  | "width"
  | "x"
  | "y"
  | "zIndex";
type PvjsonBurrOptionalKeys =
  | "citations"
  | "comments"
  | "dbId"
  | "dbConventionalName"
  | "filters"
  | "rotation"
  | "textRotation"
  | "strokeDasharray";
export type PvjsonBurr = {
  [K in PvjsonBurrRequiredKeys]: PvjsonEntityMerged[K]
} &
  { [K in PvjsonBurrOptionalKeys]?: PvjsonEntityMerged[K] } & {
    isAttachedTo: string;
  };

export type PvjsonNode = PvjsonSingleFreeNode | PvjsonGroup | PvjsonBurr;

type PvjsonEdgeRequiredKeys =
  | "id"
  | "color"
  | "drawAs"
  | "gpmlElementName"
  | "kaavioType"
  | "zIndex"
  | "type";
type PvjsonEdgeOptionalKeys =
  | "biopaxType"
  | "burrs"
  | "citations"
  | "comments"
  | "controlled"
  | "controller"
  | "controlType"
  | "conversionDirection"
  | "dbConventionalName"
  | "dbId"
  | "filters"
  | "isPartOf"
  | "left"
  | "markerEnd"
  | "markerStart"
  | "participants"
  | "right"
  | "sboInteractionType"
  | "strokeDasharray"
  | "wpInteractionType";
export type PvjsonEdge = {
  [K in PvjsonEdgeRequiredKeys]: PvjsonEntityMerged[K]
} &
  { [K in PvjsonEdgeOptionalKeys]?: PvjsonEntityMerged[K] } & {
    //explicitPoints?: any;
    isAttachedTo?: string[];
    points: Point[];
  };

type PvjsonInteractionRequiredKeys =
  | "biopaxType"
  | "gpmlElementName"
  | "sboInteractionType"
  | "wpInteractionType";
export type PvjsonInteraction = PvjsonEdge &
  { [K in PvjsonInteractionRequiredKeys]: PvjsonEntityMerged[K] } & {
    //interactionType: string;
  };

export interface Controlled extends PvjsonInteraction {
  left: string;
  right: string;
}

// example controller: an enzyme
// example Control: a catalysis
// example controlled: a conversion
export interface Control extends PvjsonEdge {
  controlled: string;
  controller: string;
  controlType: string;
}

type PvjsonPublicationXrefRequiredKeys =
  | "authors"
  | "gpmlElementName"
  | "id"
  | "kaavioType"
  | "source"
  | "standardName"
  | "textContent"
  | "type"
  | "year";
type PvjsonPublicationXrefOptionalKeys = "dbId" | "dbConventionalName";
export type PvjsonPublicationXref = {
  [K in PvjsonPublicationXrefRequiredKeys]: PvjsonEntityMerged[K]
} &
  { [K in PvjsonPublicationXrefOptionalKeys]?: PvjsonEntityMerged[K] } & {};

export type PvjsonEntity =
  | PvjsonSingleFreeNode
  | PvjsonGroup
  | PvjsonBurr
  | PvjsonEdge
  | PvjsonPublicationXref;

export type PvjsonEntityMap = {
  // TODO this could likely be improved
  [key: string]: PvjsonEntity;
};
