import { defaults as defaultsM } from "lodash";
import { isFinite, omit } from "lodash/fp";
import { isPvjsonEdge } from "./gpml-utilities";
import * as GPML2013aGroupMappingsByStyle from "./GPML2013aGroupMappingsByStyle.json";

export function getGroupDimensions(
  padding: number,
  borderWidth: number,
  groupContents: PvjsonEntity[]
): GroupDimensions {
  let dimensions = <GroupDimensions>{};
  dimensions.topLeftCorner = {
    x: Infinity,
    y: Infinity
  };
  dimensions.bottomRightCorner = {
    x: 0,
    y: 0
  };

  groupContents.forEach(function(entity) {
    if (isPvjsonEdge(entity)) {
      const points = entity.points;
      // If entity is an edge
      const firstPoint = points[0];
      const firstPointX = firstPoint.x;
      const firstPointY = firstPoint.y;
      const lastPoint = points[points.length - 1];
      const lastPointX = lastPoint.x;
      const lastPointY = lastPoint.y;
      dimensions.topLeftCorner.x = Math.min(
        dimensions.topLeftCorner.x,
        firstPointX,
        lastPointX
      );
      dimensions.topLeftCorner.y = Math.min(
        dimensions.topLeftCorner.y,
        firstPointY,
        lastPointY
      );
      dimensions.bottomRightCorner.x = Math.max(
        dimensions.bottomRightCorner.x,
        firstPointX,
        lastPointX
      );
      dimensions.bottomRightCorner.y = Math.max(
        dimensions.bottomRightCorner.y,
        firstPointY,
        lastPointY
      );
    } else {
      // If entity is a node
      dimensions.topLeftCorner.x = Math.min(
        dimensions.topLeftCorner.x,
        entity.x
      );
      dimensions.topLeftCorner.y = Math.min(
        dimensions.topLeftCorner.y,
        entity.y
      );
      dimensions.bottomRightCorner.x = Math.max(
        dimensions.bottomRightCorner.x,
        entity.x + entity.width
      );
      dimensions.bottomRightCorner.y = Math.max(
        dimensions.bottomRightCorner.y,
        entity.y + entity.height
      );
    }

    dimensions.x = dimensions.topLeftCorner.x - padding - borderWidth;
    dimensions.y = dimensions.topLeftCorner.y - padding - borderWidth;
    dimensions.width =
      dimensions.bottomRightCorner.x -
      dimensions.topLeftCorner.x +
      2 * (padding + borderWidth);
    dimensions.height =
      dimensions.bottomRightCorner.y -
      dimensions.topLeftCorner.y +
      2 * (padding + borderWidth);
  });

  if (
    !isFinite(dimensions.x) ||
    !isFinite(dimensions.y) ||
    !isFinite(dimensions.width) ||
    !isFinite(dimensions.height)
  ) {
    throw new Error(
      "Error calculating group dimensions. Cannot calculate one or more of the following: x, y, width, height."
    );
  }

  return dimensions;
}

export function preprocess(Group) {
  // NOTE: The class "Group" is the only class that uses the "Style" property.
  const { Style } = Group;
  return defaultsM(Group, GPML2013aGroupMappingsByStyle[Style]);
}

export function postprocess(
  containedEntities: PvjsonEntity[],
  group: PvjsonNode
): PvjsonNode {
  const dimensions = getGroupDimensions(
    group.padding,
    group.borderWidth,
    containedEntities
  );
  group.y = dimensions.y;
  group.x = dimensions.x;
  group.width = dimensions.width;
  group.height = dimensions.height;

  return group;
}
