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

export const GroupAttributes = {
  // TODO: in GPML2021, Group elements have a Graphics element child.
  // For that reason or some other reason, specifying anything in
  // Graphics below doesn't appear to change anything.
  // This may also apply to Shape elements.
  // these aren't explicitly set in the XSD but maybe should be.
  Graphics: {
    hAlign: "Center",
    borderColor: "808080",
    textColor: "808080",
    vAlign: "Middle",
    fontSize: 1,
    fontWeight: "Bold",
    borderWidth: 1,
    //fillOpacity: 0.1
  }
};

export const GroupNone = defaultsDeepAll([{
  Graphics: {
    padding: 8,
    shapeType: "Rectangle",
    borderStyle: "Dashed",
    borderWidth: 1,
    fillColor: "B4B464"
    //fillColor: "B4B46419"
  },
  type: [
    "Group",
    "GroupNone"
  ]
}, GroupAttributes]);

export const GroupGroup = defaultsDeepAll([{
  Graphics: {
    padding: 8,
    shapeType: "None",
    borderStyle: "Dashed",
    borderWidth: 0,
    fillColor: "00000000"
  },
  type: [
    "Group",
    "GroupGroup"
  ]
}, GroupAttributes]);

export const GroupComplex = defaultsDeepAll([{
  Graphics: {
    padding: 11,
    shapeType: "Octagon",
    borderStyle: "Solid",
    borderWidth: 1,
    fillColor: "B4B464"
    //fillColor: "B4B46419"
  },
  type: [
    "Group",
    "Complex",
    "GroupComplex"
  ]
}, GroupAttributes]);

export const GroupPathway = defaultsDeepAll([{
  Graphics: {
    padding: 8,
    shapeType: "Rectangle",
    borderStyle: "Dashed",
    borderWidth: 0.5,
    fillColor: "00FF00"
    //fillColor: "00FF0019"
  },
  type: [
    "Group",
    "Pathway",
    "GroupPathway"
  ]
}, GroupAttributes]);

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
      rotation: 0
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
