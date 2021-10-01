import { defaultsDeepAll } from "lodash/fp";

const FontAttributes = {
  hAlign: "Center",
  fontDecoration: "Normal",
  fontName: "Arial",
  fontSize: 12,
  fontStrikethru: "Normal",
  fontStyle: "Normal",
  fontWeight: "Normal",
  lineHeight: 1.1,
  overflow: "hidden",
  textOverflow: "clip",
  vAlign: "Top",
  whiteSpace: "pre"
};

const ShapeStyleAttributes = {
  borderColor: "000000",
  textColor: "000000",
  borderStyle: "Solid",
  borderWidth: 1,
  // the following is/are not in the XSD
  padding: 8
};

export const Pathway = {
  // These not in the XSD
  boardHeight: 500,
  title: "Untitled Pathway"
};

export const DataNode = {
  "type": "Unknown",
  Graphics: defaultsDeepAll([
    {
      fillColor: "ffffff",
      shapeType: "Rectangle"
    },
    FontAttributes,
    ShapeStyleAttributes
  ])
};

export const Group = {
  // these aren't explicitly set in the XSD but maybe should be.
  Graphics: {
    hAlign: "Center",
    borderColor: "808080",
    textColor: "808080",
    vAlign: "Middle",
    fontSize: 1,
    fontWeight: "Bold",
    borderWidth: 1,
    fillOpacity: 0.1
  },
  "type": "None"
};

export const Anchor = {
  Graphics: {
    // this isn't explicitly set in the XSD but maybe should be.
    borderWidth: 0,
    shapeType: "None",
  }
};

export const GPMLEdge = {
  Graphics: {
    lineColor: "000000",
    lineStyle: "Solid",
    connectorType: "Straight",
    // This is part of the XSD, but it's equivalent to no Arrowhead.
    /*
    Point: {
      arrowHead: "Line"
    },
		//*/
    // these aren't explicitly set in the XSD but maybe should be.
    fillColor: "None",
    lineWidth: 1
  }
};
export const GraphicalLine = GPMLEdge;
export const Interaction = GPMLEdge;

export const Label = {
  Graphics: defaultsDeepAll([
    {
      fillColor: "00000000",
      shapeType: "None"
    },
    FontAttributes,
    ShapeStyleAttributes
  ])
};

export const Shape = {
  Graphics: defaultsDeepAll([
    {
      fillColor: "00000000",
      fontSize: 10,
      rotation: "Top"
    },
    FontAttributes,
    ShapeStyleAttributes
  ])
};

export const State = {
  StateType: "Unknown",
  Graphics: defaultsDeepAll([
    {
      hAlign: "Center",
      padding: 1,
      fillColor: "ffffff",
      fontSize: 10,
      shapeType: "Rectangle",
      vAlign: "Middle"
    },
    ShapeStyleAttributes
  ])
};
