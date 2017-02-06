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
