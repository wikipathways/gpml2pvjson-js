import { defaultsDeepAll } from "lodash/fp";

const FontAttributes = {
  FontName: "Arial",
  FontStyle: "Normal",
  FontDecoration: "Normal",
  FontStrikethru: "Normal",
  FontWeight: "Normal",
  FontSize: 12,
  Align: "Center",
  Valign: "Top"
};

const ShapeStyleAttributes = {
  Color: "Black",
  LineStyle: "Solid",
  LineThickness: 1
};

/* TODO look at using something like this:
import * as GPML2013a from "../../cxml/test/xmlns/pathvisio.org/GPML/2013a";
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

/* TODO look at using something like this:
import * as GPML2013a from "../../cxml/test/xmlns/pathvisio.org/GPML/2013a";
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
  BoardHeight: 500,
  Name: "Untitle Pathway"
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
  Align: "Center",
  Color: "808080",
  Valign: "Middle",
  FontSize: 1,
  FontWeight: "Bold",
  LineThickness: 1,
  FillOpacity: 0.1,
  Style: "None"
};

const Anchor = {
  Shape: "None",
  // this isn't explicitly set in the XSD but maybe should be.
  LineThickness: 0
};

export const GraphicalLine = {
  Graphics: {
    Color: "Black",
    LineStyle: "Solid",
    ConnectorType: "Straight",
    Point: {
      ArrowHead: "Line"
    },
    Anchor: Anchor,
    // these aren't explicitly set in the XSD but maybe should be.
    FillColor: "Transparent",
    LineThickness: 1
  }
};

export const Interaction = {
  Graphics: {
    Color: "Black",
    LineStyle: "Solid",
    ConnectorType: "Straight",
    Point: {
      ArrowHead: "Line"
    },
    Anchor: Anchor,
    // these aren't explicitly set in the XSD but maybe should be.
    FillColor: "Transparent",
    LineThickness: 1
  }
};

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
      FillColor: "White",
      ShapeType: "Rectangle"
    },
    ShapeStyleAttributes
  ])
};
