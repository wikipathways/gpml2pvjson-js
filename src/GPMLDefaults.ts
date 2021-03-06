import { defaultsDeepAll } from "lodash/fp";

const FontAttributes = {
  Align: "Center",
  FontDecoration: "Normal",
  FontName: "Arial",
  FontSize: 12,
  FontStrikethru: "Normal",
  FontStyle: "Normal",
  FontWeight: "Normal",
  lineHeight: 1.1,
  overflow: "hidden",
  textOverflow: "clip",
  Valign: "Top",
  whiteSpace: "pre"
};

const ShapeStyleAttributes = {
  Color: "Black",
  LineStyle: "Solid",
  LineThickness: 1,
  // the following is/are not in the XSD
  Padding: 8
};

/* TODO look at using something like this:
import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";
export class DataNode extends GPML2013a.DataNodeType {
  constructor() {
    super();
  }
  Type = "Unknown";
  Graphics = defaultsDeepAll([
    {
      FillColor: "White",
      ShapeType: "Rectangle"
    },
    FontAttributes,
    ShapeStyleAttributes
  ]);
}
//*/
/* or this:
import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";
export class DataNode extends GPML2013a.document.Pathway.DataNode[0]
  .constructor {
  constructor() {
    super();
  }
  Type = "Unknown";
  Graphics = defaultsDeepAll([
    {
      FillColor: "White",
      ShapeType: "Rectangle"
    },
    FontAttributes,
    ShapeStyleAttributes
  ]);
}
//*/

export const Pathway = {
  // These not in the XSD
  BoardHeight: 500,
  Name: "Untitled Pathway"
};

export const DataNode = {
  Type: "Unknown",
  Graphics: defaultsDeepAll([
    {
      FillColor: "White",
      ShapeType: "Rectangle"
    },
    FontAttributes,
    ShapeStyleAttributes
  ])
};

export const Group = {
  // these aren't explicitly set in the XSD but maybe should be.
  Graphics: {
    Align: "Center",
    Color: "808080",
    Valign: "Middle",
    FontSize: 1,
    FontWeight: "Bold",
    LineThickness: 1,
    FillOpacity: 0.1
  },
  Style: "None"
};

export const Anchor = {
  Shape: "None",
  Graphics: {
    // this isn't explicitly set in the XSD but maybe should be.
    LineThickness: 0
  }
};

export const GPMLEdge = {
  Graphics: {
    Color: "Black",
    LineStyle: "Solid",
    ConnectorType: "Straight",
    // This is part of the XSD, but it's equivalent to no Arrowhead.
    /*
    Point: {
      ArrowHead: "Line"
    },
		//*/
    // these aren't explicitly set in the XSD but maybe should be.
    FillColor: "None",
    LineThickness: 1
  }
};
export const GraphicalLine = GPMLEdge;
export const Interaction = GPMLEdge;

export const Label = {
  Graphics: defaultsDeepAll([
    {
      FillColor: "Transparent",
      ShapeType: "None"
    },
    FontAttributes,
    ShapeStyleAttributes
  ])
};

export const Shape = {
  Graphics: defaultsDeepAll([
    {
      FillColor: "Transparent",
      FontSize: 10,
      Rotation: "Top"
    },
    FontAttributes,
    ShapeStyleAttributes
  ])
};

export const State = {
  StateType: "Unknown",
  Graphics: defaultsDeepAll([
    {
      Align: "Center",
      Padding: 1,
      FillColor: "White",
      FontSize: 10,
      ShapeType: "Rectangle",
      Valign: "Middle"
    },
    ShapeStyleAttributes
  ])
};
