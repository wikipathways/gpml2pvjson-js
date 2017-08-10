/// <reference path="rgbcolor.d.ts" />
//// <reference path="src/topublish/rx-sax/XPathParser.d.ts" />
/// <reference path="src/json.d.ts" />

/* GPML */

// TODO compile this as part of the build step for this package
//import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";
import * as GPML2013a from "../cxml/test/xmlns/pathvisio.org/GPML/2013a";

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

declare type GPMLElement = typeof GPML2013a.document.Pathway &
  typeof GPML2013a.DataNodeType.prototype &
  typeof GPML2013a.GraphicalLineType.prototype &
  typeof GPML2013a.GroupType.prototype &
  typeof GPML2013a.InteractionType.prototype &
  typeof GPML2013a.LabelType.prototype &
  typeof GPML2013a.ShapeType.prototype &
  typeof GPML2013a.StateType.prototype;

/* pvjson */

// decorations or other small elements attached to another element,
// e.g., GPML States and Anchors
interface Burr {
  drawAs: number;
  isAttachedTo: string;
  attachmentDisplay?: attachmentDisplay;
}

interface Point {
  x?: number;
  y?: number;
  isAttachedTo?: string;
  attachmentDisplay?: attachmentDisplay;
}

interface NodeDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface GroupDimensions extends NodeDimensions {
  topLeftCorner: {
    x: number;
    y: number;
  };
  bottomRightCorner: {
    x: number;
    y: number;
  };
}

interface PublicationXref {
  id: string;
  type: string[];
  displayName?: string;
}

interface Controller {
  type?: string | string[];
}

interface Controlled {
  left?: string;
  right?: string;
  participant?: string | string[];
  type?: string | string[];
}

interface attachmentDisplay {
  // position takes two numbers for GPML States and Points, but
  // just one for GPML Anchors, which are attached to edges.
  position: number[];
  offset?: [number, number];
  orientation?: [number, number];
}

type DataElementStringProperties =
  | "author"
  | "backgroundColor"
  | "cellularComponent"
  | "color"
  | "dataSource"
  | "dbName" // e.g., Entrez Gene
  | "dbId" // xref identifier, e.g., 1234 for Entrez Gene 1234
  | "displayName"
  | "drawAs"
  | "email"
  //'entityReference' |
  | "fontFamily"
  | "fontStyle"
  | "fontWeight"
  | "gpml:GroupRef"
  | "gpml:Style"
  | "gpmlElementName"
  | "href"
  | "id" // @id
  | "isPartOf"
  | "lastModified"
  | "license"
  | "maintainer"
  | "tagName"
  | "organism"
  | "kaavioType"
  | "standardName"
  | "strokeDasharray"
  | "textAlign"
  | "verticalAlign"
  | "wpType";

// This probably isn't a problem with parsing GPML,
// but if we need to parse non-numeric values like '0.5em',
// we can use something like this:
// https://github.com/sebmarkbage/art/blob/51ffce8164a555d652843241c2fdda52e186cbbd/parsers/svg/core.js#L170
type DataElementNumberProperties =
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

declare type DataElementWithStringProperties = {
  [K in DataElementStringProperties]?: string
};

declare type DataElementWithNumberProperties = {
  [K in DataElementNumberProperties]?: number
};

type DataElementStringArrayProperties =
  | "burrs"
  | "citation"
  | "comment"
  | "contains"
  | "lineStyle"
  | "type";

declare type DataElementWithStringArrayProperties = {
  [K in DataElementStringArrayProperties]?: string[]
};

interface DataElementManual {
  attachmentDisplay?: attachmentDisplay;
  isAttachedTo?: string;
}

declare type DataElement = DataElementWithStringProperties &
  DataElementWithNumberProperties &
  DataElementWithStringArrayProperties &
  DataElementManual;

interface EdgeManual {
  markerStart?: string;
  markerEnd?: string;
  explicitPoints?: any;
  points?: Point[];
  attachmentDisplay?: attachmentDisplay;
  isAttachedTo?: string[];
}

declare type Edge = DataElementWithStringProperties &
  DataElementWithNumberProperties &
  DataElementWithStringArrayProperties &
  EdgeManual;
//declare type Edge = DataElementWithStringProperties & DataElementWithNumberProperties & EdgeManual;
//declare type Edge = EdgeManual;

declare type DataElementsByClass = { [K in GPMLClassNames]?: string[] };

declare type DataElementMap = {
  // TODO this could likely be improved
  [key: string]: DataElement | Edge;
};

declare type DataManual = {
  "@context"?: string | any;
  tagName: string;
  organism: string;
  type: string | string[];
  // NOTE that data.elementMap may have more entries than data.elements.
  // For example, if the source GPML has one or more empty Groups, these
  // Groups will be in data.elementMap but not in data.elements.
  elementMap: DataElementMap;
  elements: DataElement[];
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
  elementMap: DataElementMap;
  elements: DataElement[];
  GraphIdToGroupId: {
    [key: string]: string;
  };
  containedIdsByGroupId: {
    [key: string]: string[];
  };
  node: string[];
  edge: string[];
} & { [K in GPMLClassNames]?: string[] };

declare type Data = DataElementsByClass & DataManual;

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

//const COMMON_PROPS: ReadonlyArray<keyof DataElement> = [
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
//const PATHWAY_PROPS: ReadonlyArray<keyof DataElement> = COMMON_PROPS.concat([
//	'author',
//	'dataSource',
//	'email',
//	'lastModified',
//	'license',
//	'maintainer',
//	'organism',
//]);
//
//const NODE_PROPS: ReadonlyArray<keyof DataElement> = [
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
//const GROUP_PROPS: ReadonlyArray<keyof DataElement> = NODE_PROPS.concat([
//	'contains',
//	'style',
//]);
//
//const EDGE_PROPS: ReadonlyArray<keyof DataElement> = COMMON_PROPS.concat([
//	'position',
//	'points',
//]);