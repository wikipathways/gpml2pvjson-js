/// <reference path="../rgbcolor.d.ts" />
/// <reference path="./json.d.ts" />
/// <reference path="../xmlns/pathvisio.org/GPML/2013a.d.ts" />
//// <reference path="../../cxml/test/xmlns/pathvisio.org/GPML/2013a.d.ts" />

//////// <reference path="./topublish/rx-sax/XPathParser.d.ts" />

/* GPML */

// TODO compile this as part of the build step for this package
//import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";
//import * as GPML2013a from "../../cxml/test/xmlns/pathvisio.org/GPML/2013a";

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

declare type GPML_ATTRIBUTE_NAMES_AND_TYPES = {
  [K in GPMLAttributeNames]?: string
};

declare type GPMLElement = Record<string, any>;

interface Pathway {
  contains: string[];
  height: number;
  organism: string;
  name: string;
  width: number;
  author?: string;
  comments?: Comment[];
  dataSource?: string;
  email?: string;
  lastModified?: string;
  license?: string;
  maintainer?: string;
  type: string[];
}

/* pvjson */

// decorations or other small elements attached to another element,
// e.g., GPML States and Anchors
interface Burr {
  drawAs: number;
  isAttachedTo: string;
  attachmentDisplay?: AttachmentDisplay;
}

interface Point {
  x?: number;
  y?: number;
  isAttachedTo?: string;
  attachmentDisplay?: AttachmentDisplay;
}

interface NodeDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface Corner {
  x: number;
  y: number;
}

interface AttachmentDisplay {
  // position takes two numbers for GPML States and Points, but
  // just one for GPML Anchors, which are attached to edges.
  position: number[];
  offset?: [number, number];
  orientation?: [number, number];
}

interface Comment {
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
  | "dbName" // e.g., Entrez Gene
  | "displayName"
  | "drawAs"
  | "email"
  //'entityReference' |
  | "fontFamily"
  | "fontStyle"
  | "fontWeight"
  //| "gpml:GroupRef"
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
  | "width"
  | "x"
  | "y"
  | "zIndex";

declare type PvjsonEntityMergedWithStringProperties = {
  [K in PvjsonEntityMergedStringProperties]?: string
};

declare type PvjsonEntityMergedWithNumberProperties = {
  [K in PvjsonEntityMergedNumberProperties]?: number
};

type PvjsonEntityMergedStringArrayProperties =
  | "authors"
  | "burrs"
  | "citation"
  | "contains"
  | "lineStyle"
  | "sboInteractionType"
  | "participants"
  | "type";

declare type PvjsonEntityMergedWithStringArrayProperties = {
  [K in PvjsonEntityMergedStringArrayProperties]?: string[]
};

declare type PvjsonEntityMerged = PvjsonEntityMergedWithStringProperties &
  PvjsonEntityMergedWithNumberProperties &
  PvjsonEntityMergedWithStringArrayProperties & {
    attachmentDisplay?: AttachmentDisplay;
    comments?: Comment[];
    isAttachedTo?: string | string[];
    points?: Point[];
  };

type PvjsonNodeRequiredKeys =
  | "borderWidth"
  | "color"
  | "drawAs"
  | "height"
  | "id"
  | "kaavioType"
  | "padding"
  | "type"
  | "width"
  | "x"
  | "y"
  | "zIndex";
type PvjsonNodeOptionalKeys =
  | "attachmentDisplay"
  | "cellularComponent"
  | "contains"
  | "dbId"
  | "dbName"
  | "isPartOf"
  | "rotation"
  | "strokeDasharray";
type PvjsonNode = { [K in PvjsonNodeRequiredKeys]: PvjsonEntityMerged[K] } &
  { [K in PvjsonNodeOptionalKeys]?: PvjsonEntityMerged[K] } & {
    isAttachedTo?: string;
  };

type PvjsonEdgeRequiredKeys =
  | "id"
  | "drawAs"
  | "color"
  | "drawAs"
  | "kaavioType"
  | "zIndex"
  | "type";
type PvjsonEdgeOptionalKeys =
  | "dbId"
  | "dbName"
  | "attachmentDisplay"
  | "strokeDasharray"
  | "markerStart"
  | "markerEnd"
  | "isPartOf"
  | "biopaxType"
  | "wpInteractionType"
  | "sboInteractionType"
  | "dbId"
  | "conversionDirection"
  | "dbName"
  | "participants"
  | "controlType"
  | "controller"
  | "controlled"
  | "left"
  | "right";
type PvjsonEdge = { [K in PvjsonEdgeRequiredKeys]: PvjsonEntityMerged[K] } &
  { [K in PvjsonEdgeOptionalKeys]?: PvjsonEntityMerged[K] } & {
    //explicitPoints?: any;
    isAttachedTo?: string[];
    points: Point[];
  };

type PvjsonInteractionRequiredKeys =
  | "biopaxType"
  | "wpInteractionType"
  | "sboInteractionType";
type PvjsonInteraction = PvjsonEdge &
  { [K in PvjsonInteractionRequiredKeys]: PvjsonEntityMerged[K] } & {
    //interactionType: string;
  };

interface Controlled extends PvjsonInteraction {
  left: string;
  right: string;
}

// example controller: an enzyme
// example Control: a catalysis
// example controlled: a conversion
interface Control extends PvjsonEdge {
  controlled: string;
  controller: string;
  controlType: string;
}

type PvjsonPublicationXrefRequiredKeys =
  | "id"
  | "type"
  | "year"
  | "authors"
  | "source"
  | "standardName";
type PvjsonPublicationXrefOptionalKeys = "displayName" | "dbId" | "dbName";
type PvjsonPublicationXref = {
  [K in PvjsonPublicationXrefRequiredKeys]: PvjsonEntityMerged[K]
} &
  { [K in PvjsonPublicationXrefOptionalKeys]?: PvjsonEntityMerged[K] } & {};

type PvjsonEntity = PvjsonNode | PvjsonEdge | PvjsonPublicationXref;

declare type PvjsonEntityMap = {
  // TODO this could likely be improved
  [key: string]: PvjsonEntity;
};

declare type DataManual = {
  "@context"?: string | any;
  tagName: string;
  organism: string;
  type: string | string[];
  // NOTE that data.elementMap may have more entries than data.elements.
  // For example, if the source GPML has one or more empty Groups, these
  // Groups will be in data.elementMap but not in data.elements.
  elementMap: PvjsonEntityMap;
  elements: PvjsonEntity[];
  GraphIdToGroupId: {
    [key: string]: string;
  };
  GroupIdToGraphId: {
    [key: string]: string;
  };
  containedIdsByGroupId: {
    [key: string]: string[];
  };
  node: string[];
  edge: string[];
  width: number;
  height: number;
  backgroundColor: string;
};

declare type Container = {
  // NOTE that data.elementMap may have more entries than data.elements.
  // For example, if the source GPML has one or more empty Groups, these
  // Groups will be in data.elementMap but not in data.elements.
  elementMap: PvjsonEntityMap;
  elements: PvjsonEntity[];
  GraphIdToGroupId: {
    [key: string]: string;
  };
  containedIdsByGroupId: {
    [key: string]: string[];
  };
  node: string[];
  edge: string[];
} & { [K in GPMLClassNames]?: string[] };

declare type PvjsonEntitiesByClass = { [K in GPMLClassNames]?: string[] };
declare type Data = PvjsonEntitiesByClass & DataManual;

/* jsonld and jsonld-extra */

// TODO how do I specify this? see http://json-ld.org/spec/latest/json-ld/#dfn-node-object
// any JSON object that is not in the JSON-LD context and that meets one of these criteria:
// * does not contain the @value, @list, or @set keywords, or
// * not the top-most JSON object in the JSON-LD document consisting of no other members than @graph and @context.
//
// Since I don't know how to do this for now, I'll just use a modification of Map.
// Maybe one of the commented out options is more appropriate?
declare type jsonldNodeObject = {
  //[key: string]: jsonPrimitive | jsonPrimitive[];
  //[key: string]: jsonldNodeObject;
  [key: string]: jsonldListSetPrimitive;
};
declare type jsonPrimitive =
  | string
  | number
  | boolean
  | null
  | jsonldNodeObject;
interface jsonldValueObjectWithType {
  "@value": string | number | boolean | null;
  "@type"?: string | null;
  "@index"?: string;
  "@context"?: any;
}
interface jsonldValueObjectWithLanguage {
  "@value": string | number | boolean | null;
  // TODO use an enum
  "@language"?: string | null;
  "@index"?: string;
  "@context"?: any;
}

declare type jsonldValueObject =
  | jsonldValueObjectWithType
  | jsonldValueObjectWithLanguage;
declare type jsonldListSetPrimitive =
  | string
  | number
  | boolean
  | null
  | jsonldNodeObject
  | jsonldValueObject;
declare type jsonldListSetValue =
  | jsonldListSetPrimitive
  | jsonldListSetPrimitive[];

//const COMMON_PROPS: ReadonlyArray<keyof PvjsonEntity> = [
//	'color',
//	'dbName', // e.g., Entrez Gene
//	'dbId', // xref identifier, e.g., 1234 for Entrez Gene 1234
//	'displayName',
//	'gpmlElementName',
//	'href',
//	'id', // @id
//	'isAttachedTo',
//	'drawAs',
//	'strokeDasharray',
//	'wpType',
//	'borderWidth',
//	'zIndex',
//	'rotation',
//	'comment',
//	'type',
//	'citation',
//];
//
//const PATHWAY_PROPS: ReadonlyArray<keyof PvjsonEntity> = COMMON_PROPS.concat([
//	'author',
//	'dataSource',
//	'email',
//	'lastModified',
//	'license',
//	'maintainer',
//	'organism',
//]);
//
//const NODE_PROPS: ReadonlyArray<keyof PvjsonEntity> = [
//	'x',
//	'y',
//	'width',
//	'height',
//	'backgroundColor',
//	'textAlign',
//	'fontFamily',
//	'fontStyle',
//	'fontWeight',
//	'padding',
//	'standardName',
//	'verticalAlign',
//	'fillOpacity',
//	'fontSize',
//];
//
//const GROUP_PROPS: ReadonlyArray<keyof PvjsonEntity> = NODE_PROPS.concat([
//	'contains',
//	'style',
//]);
//
//const EDGE_PROPS: ReadonlyArray<keyof PvjsonEntity> = COMMON_PROPS.concat([
//	'position',
//	'points',
//]);
