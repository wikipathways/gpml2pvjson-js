/// <reference path="rgbcolor.d.ts" />
/// <reference path="sax.d.ts" />

declare interface NodeDimensions {
		x: number;
		y: number;
		width: number;
		height: number;
		zIndex: number;
}

declare interface GroupDimensions extends NodeDimensions {
    topLeftCorner: {
			x: number;
			y: number;
		};
    bottomRightCorner: {
			x: number;
			y: number;
		};
}

declare interface PublicationXref {
	displayName: string;
	id: string;
	type: any;
}

declare interface Controller {
	type?: string | string[];
}

declare interface Controlled {
	left?: string;
	right?: string;
	participant?: string | string[];
	type?: string | string[];
}

type DataElementStringProperties = 'author' |
      'backgroundColor' |
      'cellularComponent' |
      'color' |
      'dataSource' |
      'dbName' | // e.g., Entrez Gene
      'dbId' | // xref identifier, e.g., 1234 for Entrez Gene 1234
      'displayName' |
      'drawAs' |
      'email' |
			//'entityReference' |
      'fontFamily' |
      'fontStyle' |
      'fontWeight' |
			'gpml:GroupRef' |
      'gpml:Style' |
			'gpmlElementName' |
      'href' |
      'id' | // @id
      'isAttachedTo' |
			'isPartOf' |
      'lastModified' |
      'license' |
      'maintainer' |
      'markerStart' |
      'markerEnd' |
			'name' |
      'organism' |
      'pvjsonType' |
      'standardName' |
      'strokeDasharray' |
      'textAlign' |
      'verticalAlign' |
			'wpType';

// This probably isn't a problem with parsing GPML,
// but if we need to parse non-numeric values like '0.5em',
// we can use something like this:
// https://github.com/sebmarkbage/art/blob/51ffce8164a555d652843241c2fdda52e186cbbd/parsers/svg/core.js#L170
type DataElementNumberProperties = 'borderWidth' |
      'fillOpacity' |
      'fontSize' |
      'height' |
      'padding' |
      'position' |
      'relX' |
      'relY' |
      'rotation' |
			'width' |
			'x' |
      'y' |
      'zIndex';

declare type DataElementWithStringProperties = {
	[K in DataElementStringProperties]?: string;
}

declare type DataElementWithNumberProperties = {
	[K in DataElementNumberProperties]?: number;
}

type DataElementStringArrayProperties = 'citation' |
	'comment' |
	'contains' |
	'lineStyle' |
	'type';

declare type DataElementWithStringArrayProperties = {
	[K in DataElementStringArrayProperties]?: string[];
}

declare interface DataElementManual {
	points: Point[];
}

declare type DataElement = DataElementWithStringProperties & DataElementWithNumberProperties & DataElementWithStringArrayProperties & DataElementManual;

type GPMLAttributeNames = 'xmlns' |
      'GroupId' |
      'GraphId' |
      'GraphRef' |
      'GroupRef' |
      'Name' |
      'TextLabel' |
      'Type' |
      'CellularComponent' |
      'Rotation' |
      'LineStyle' |
      'Shape' |
      'ShapeType' |
      'Attribute' |
      'FillColor' |
      'Color' |
      'LineThickness' |
      'Width' |
      'Height' |
      'RelX' |
      'RelY' |
      'CenterX' |
      'CenterY' |
      'ConnectorType' |
      'Point' |
      'Organism' |
      'Database' |
      'ID' |
      'Data-Source' |
			'ZOrder' |
      'Version';

type GPMLClassNames = 'PublicationXref' |
      'Point' |
      'Interaction' |
      'GraphicalLine' |
      'DataNode' |
      'Shape' |
      'Group' |
      'InfoBox' |
      'State';

declare type DataElementsByClass = {
	[K in GPMLClassNames]?: string[];
}

declare type DataManual = {
	'@context'?: string | any;
	name: string;
	organism: string;
	type: string | string[];
	// NOTE that data.elementMap may have more entries than data.elements.
	// For example, if the source GPML has one or more empty Groups, these
	// Groups will be in data.elementMap but not in data.elements.
	elementMap: {
		// TODO this could likely be improved
		[key: string]: DataElement
	},
	elements: DataElement[],
	GraphIdToGroupId: {
		[key: string]: string
	},
	GroupIdToGraphId: {
		[key: string]: string
	},
	containedIdsByGroupId: {
		[key: string]: string[]
	},
	node: string[];
	edge: string[];
	width: number;
	height: number;
	backgroundColor: string;
};

declare type Data = DataElementsByClass & DataManual;

declare type GPML_ATTRIBUTE_NAMES_AND_TYPES = {
	[K in GPMLAttributeNames]?: string;
}

declare interface GPMLElement extends SAXOpenTag<GPML_ATTRIBUTE_NAMES_AND_TYPES> {
}

// Here we are referring to GPML Anchor, not jsplumb anchor.
// GPML and jsplumb/pvjson use different meaning and architecture for the term "anchor."
// GPML uses anchor to refer to an actual element that specifies a position along an edge.
// pvjson copies jsplumb in using anchor to refer to the location of the point in terms of another element,
// which can be a node or an edge.
// When that other element is an edge, pvjson refers directly to the edge,
// unlike GPML, which refers to an element located at a position along the edge.
// see jsPlumb anchor model: http://jsplumbtoolkit.com/doc/anchors
// anchor: [ x, y, dx, dy ]
// where x: distance from left side along width axis as a percentage of the total width
//       y: distance from top side along height axis as a percentage of the total height
//       dx, dy: coordinates of a point that specifies how the edge emanates from the node 
// example: below is an anchor specifying an edge that emanates downward (0, 1) from the
// center (0.5) of the bottom side (1) of the node
// anchor: [ 0.5, 1, 0, 1 ]
// since this jsplumb-anchor is specified relative to an edge, it only has one dimension
// (position along the edge), unlike nodes, which can have two dimensions
// (along x dimension of node, along y dimension of node).
// So for edges, anchor[0] refers to position along the edge and anchor[1] is always a dummy value of 0.
declare type Anchor = number[];
/*
declare type Anchor = [
	number, // if node, fraction of x distance from left to right
					// if edge, fraction of distance along edge from start to end
	number, // if node, fraction of y distance from top to bottom
	 				// if edge, dummy value (always 0)
	number?, // x emanation (dx) for indicating angle at start
	number?, // y emanation (dy) for indicating angle at start
	number?, // x offset
	number?  // y offset
];
*/

declare interface Point {
	x?: number;
	y?: number;
	isAttachedTo?: string;
	anchor?: Anchor
}

// TODO how do I specify this? see http://json-ld.org/spec/latest/json-ld/#dfn-node-object
declare interface jsonldNodeObject {}
declare interface jsonldValueObjectWithType {
	'@value': string | number | boolean | null;
	'@type'?: string | null;
	'@index'?: string;
	'@context'?: any;
}
declare interface jsonldValueObjectWithLanguage {
	'@value': string | number | boolean | null;
	// TODO use an enum
	'@language'?: string | null;
	'@index'?: string;
	'@context'?: any;
}

declare type jsonldValueObject = jsonldValueObjectWithType | jsonldValueObjectWithLanguage;
declare type jsonldListSetPrimitive = string | number | boolean | null | jsonldNodeObject | jsonldValueObject;
declare type jsonldListSetValue = jsonldListSetPrimitive | jsonldListSetPrimitive[];

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
