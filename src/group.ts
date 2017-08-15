import { assign, isArray, isPlainObject, isFinite, toPairs } from "lodash/fp";
import { isPvjsonEdge, unionLSV } from "./gpml-utilities";
import * as GPML2013aGroupMappingsByStyle from "./GPML2013aGroupMappingsByStyle.json";

export function getGroupDimensions(
  padding: number,
  borderWidth: number,
  containedEntities: PvjsonEntity[]
): NodeDimensions {
  const dimensions = {
    zIndex: Infinity
  } as NodeDimensions;
  const topLeftCorner: Corner = {
    x: Infinity,
    y: Infinity
  };
  const bottomRightCorner: Corner = {
    x: 0,
    y: 0
  };

  containedEntities.forEach(function(entity) {
    const { zIndex } = entity;
    const zIndexIsFinite = isFinite(zIndex);
    const dimensionsZIndexIsFinite = isFinite(dimensions.zIndex);
    if (zIndexIsFinite && dimensionsZIndexIsFinite) {
      dimensions.zIndex = Math.min(zIndex, dimensions.zIndex);
    } else if (zIndexIsFinite) {
      dimensions.zIndex = zIndex;
    }

    if (isPvjsonEdge(entity)) {
      const points = entity.points;
      // If entity is an edge
      const firstPoint = points[0];
      const firstPointX = firstPoint.x;
      const firstPointY = firstPoint.y;
      const lastPoint = points[points.length - 1];
      const lastPointX = lastPoint.x;
      const lastPointY = lastPoint.y;
      topLeftCorner.x = Math.min(topLeftCorner.x, firstPointX, lastPointX);
      topLeftCorner.y = Math.min(topLeftCorner.y, firstPointY, lastPointY);
      bottomRightCorner.x = Math.max(
        bottomRightCorner.x,
        firstPointX,
        lastPointX
      );
      bottomRightCorner.y = Math.max(
        bottomRightCorner.y,
        firstPointY,
        lastPointY
      );
    } else {
      // If entity is a node
      topLeftCorner.x = Math.min(topLeftCorner.x, entity.x);
      topLeftCorner.y = Math.min(topLeftCorner.y, entity.y);
      bottomRightCorner.x = Math.max(
        bottomRightCorner.x,
        entity.x + entity.width
      );
      bottomRightCorner.y = Math.max(
        bottomRightCorner.y,
        entity.y + entity.height
      );
    }

    dimensions.x = topLeftCorner.x - padding - borderWidth;
    dimensions.y = topLeftCorner.y - padding - borderWidth;
    dimensions.width =
      bottomRightCorner.x - topLeftCorner.x + 2 * (padding + borderWidth);
    dimensions.height =
      bottomRightCorner.y - topLeftCorner.y + 2 * (padding + borderWidth);
  });

  if (
    !isFinite(dimensions.x) ||
    !isFinite(dimensions.y) ||
    !isFinite(dimensions.width) ||
    !isFinite(dimensions.height)
  ) {
    throw new Error(
      "Error calculating group dimensions. Cannot calculate one or more of the following: x, y, width, height, zIndex."
    );
  }

  return dimensions;
}

// NOTE: side effects
export function preprocess(Group: {
  [key: string]: any;
}): { [key: string]: any } {
  // NOTE: The class "Group" is the only class that uses the "Style" property.
  // There are defaults for each Style, so we apply them here.
  toPairs(GPML2013aGroupMappingsByStyle[Group.Style]).forEach(function(
    [mappingKey, mappingValue]
  ) {
    const oldValue = Group[mappingKey];
    let newValue;
    if (isPlainObject(mappingValue)) {
      newValue = assign(oldValue || {}, mappingValue);
    } else if (Group.hasOwnProperty(mappingKey)) {
      if (isArray(mappingValue)) {
        newValue = unionLSV(mappingValue, oldValue);
      } else {
        newValue = oldValue;
      }
    } else {
      // override prototype with default by style
      newValue = mappingValue;
    }
    Group[mappingKey] = newValue;
  });
  return Group;
}

export function postprocess(
  containedEntities: PvjsonEntity[],
  group: PvjsonNode
): PvjsonNode {
  return assign(
    group,
    getGroupDimensions(group.padding, group.borderWidth, containedEntities)
  );
}
