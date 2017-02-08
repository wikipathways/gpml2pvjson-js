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
	type?: string;
}

declare interface Controlled {
	left?: string;
	right?: string;
	participant?: string | string[];
	type?: string;
}

type PvjsonElementStringProperties = 'id' |
      'shape' |
      'textAlign' |
      'color' |
      'dataSource' |
      'email' |
      'backgroundColor' |
      'fontFamily' |
      'fontStyle' |
      'fontWeight' |
      'isAttachedTo' |
      'href' |
      'lastModified' |
      'license' |
      'strokeDasharray' |
      'maintainer' |
      'standardName' |
      'displayName' |
      'type' |
      'verticalAlign' |
      'organism' |
      'padding' |
      'author';

type PvjsonElementNumberProperties = 'x' |
      'y' |
			'width' |
			'height' |
      'fillOpacity' |
      'borderWidth' |
      'relX' |
      'relY' |
      'zIndex' |
      'rotation' |
      'position' |
      'fontSize';

declare type PvjsonElementWithStringProperties = {
	[K in PvjsonElementStringProperties]?: string;
}

declare type PvjsonElementWithNumberProperties = {
	[K in PvjsonElementNumberProperties]?: number;
}

declare interface PvjsonElementWithXrefProperties {
	xref: string[];
}

declare interface PvjsonElementWithImageProperties {
	image: {
		'@context': {
			'@vocab': 'http://schema.org/';
		};
		width?: number;
		height?: number;
	};
}

declare type PvjsonElement = PvjsonElementWithStringProperties & PvjsonElementWithNumberProperties & PvjsonElementWithXrefProperties & PvjsonElementWithImageProperties;

declare interface Pvjson {
	standardName?: string;
	organism?: string;
	elements?:	any[];
	'@context'?: string | any;
	type?: string | string[];
}

type GPMLAttributeNames = 'xmlns' |
      'GroupId' |
      'GraphId' |
      'GraphRef' |
      'GroupRef' |
      'Name' |
      'IsPartOf' |
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
