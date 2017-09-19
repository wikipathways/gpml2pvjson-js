import {
  assign,
  curry,
  isArray,
  isPlainObject,
  isFinite,
  toPairs
} from "lodash/fp";
import {
  isPvjsonEdge,
  isPvjsonSingleFreeNode,
  unionLSV
} from "./gpml-utilities";
import * as GPML2013aGroupMappingsByStyle from "./GPML2013aGroupMappingsByStyle.json";
// Only imported for its type
import { Processor } from "./Processor";
import {
  NodeDimensions,
  Corner,
  PvjsonSingleFreeNode,
  PvjsonEdge,
  PvjsonGroup,
  PvjsonEntity,
  GPMLElement
} from "./gpml2pvjson";

export function getGroupDimensions(
  padding: number,
  borderWidth: number,
  containedEntities: PvjsonEntity[]
): NodeDimensions {
  if (containedEntities.length === 0) {
    console.warn(`Warning: Empty group observed.`);
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      zIndex: 0
    };
  } else if (!isFinite(padding)) {
    throw new Error("Invalid padding value: ${padding}");
  } else if (!isFinite(borderWidth)) {
    throw new Error("Invalid borderWidth value: ${borderWidth}");
  }
  const dimensions = containedEntities
    .filter(entity => isPvjsonSingleFreeNode(entity) || isPvjsonEdge(entity))
    .reduce(
      function(
        { runningDimensions, topLeftCorner, bottomRightCorner },
        entity: PvjsonSingleFreeNode | PvjsonEdge
      ) {
        const { zIndex } = entity;
        const zIndexIsFinite = isFinite(zIndex);
        const runningDimensionsZIndexIsFinite = isFinite(
          runningDimensions.zIndex
        );
        if (zIndexIsFinite && runningDimensionsZIndexIsFinite) {
          runningDimensions.zIndex = Math.min(zIndex, runningDimensions.zIndex);
        } else if (zIndexIsFinite) {
          runningDimensions.zIndex = zIndex;
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

        runningDimensions.x = topLeftCorner.x - padding - borderWidth;
        runningDimensions.y = topLeftCorner.y - padding - borderWidth;
        runningDimensions.width =
          bottomRightCorner.x - topLeftCorner.x + 2 * (padding + borderWidth);
        runningDimensions.height =
          bottomRightCorner.y - topLeftCorner.y + 2 * (padding + borderWidth);

        return { runningDimensions, topLeftCorner, bottomRightCorner };
      },
      {
        topLeftCorner: {
          x: Infinity,
          y: Infinity
        },
        bottomRightCorner: {
          x: 0,
          y: 0
        },
        runningDimensions: {
          zIndex: Infinity
        }
      } as {
        topLeftCorner: Corner;
        bottomRightCorner: Corner;
        runningDimensions: NodeDimensions;
      }
    ).runningDimensions;

  if (
    !isFinite(dimensions.x) ||
    !isFinite(dimensions.y) ||
    !isFinite(dimensions.width) ||
    !isFinite(dimensions.height)
  ) {
    console.error(JSON.stringify(containedEntities, null, "  "));
    throw new Error(
      `Error calculating group dimensions for group members logged above. Cannot calculate one or more of the following: x, y, width, height, zIndex.`
    );
  }

  return dimensions;
}

// NOTE: side effects
export const preprocessGPML = curry(function(
  processor: Processor,
  Group: GPMLElement
): GPMLElement {
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
  Group.Contains = processor.containedGraphIdsByGroupGroupId[Group.GroupId];
  return Group;
});

export function postprocessPVJSON(
  containedEntities: (PvjsonSingleFreeNode | PvjsonEdge)[],
  group: PvjsonGroup
): PvjsonGroup {
  return assign(
    group,
    getGroupDimensions(group.padding, group.borderWidth, containedEntities)
  );
}

//// TODO do we need any of this old code that was in post-process.ts?
//  // Kludge to get the zIndex for Groups
//  const zIndexForGroups =
//    -1 +
//    EDGES.concat(["DataNode", "Label"])
//      .reduce(function(acc, gpmlElementName) {
//        data[gpmlElementName].forEach(function(el) {
//          acc.push(el);
//        });
//        return acc;
//      }, [])
//      .reduce(getFromElementMapByIdIfExists, [])
//      .map(element => element.zIndex)
//      .reduce(function(acc, zIndex) {
//        return Math.min(acc, zIndex);
//      }, Infinity);
//
//  // specify contained elements in groups
//  data.Group
//    .reduce(getFromElementMapByIdIfExists, [])
//    .map(function(element) {
//      element.zIndex = zIndexForGroups;
//
//      // NOTE: pvjson doesn't use GroupId. It just uses GraphId as the id for an element.
//      // That means:
//      //   GPML GroupId is replaced in pvjson by just id (from GraphId), and
//      //   GPML GroupRef is replaced in pvjson by element.isPartOf and group.contains (from GraphRef)
//      // We need to map from GroupId/GroupRef to id/contains/isPartOf here.
//      // element.id refers to the value of the GraphId of the Group
//      const groupGraphId = element.id;
//      const containedIds = (element.contains =
//        data.containedIdsByGroupId[data.GraphIdToGroupId[groupGraphId]] || []);
//
//      if (containedIds.length > 0) {
//        // NOTE side effects
//        containedIds
//          .reduce(getFromElementMapByIdIfExists, [])
//          .map(function(contained) {
//            contained.isPartOf = groupGraphId;
//            return contained;
//          })
//          .forEach(upsertDataMapEntry.bind(undefined, elementMap));
//      } else {
//        // NOTE: side effect
//        delete elementMap[groupGraphId];
//      }
//
//      return element;
//    })
//    .forEach(upsertDataMapEntry.bind(undefined, elementMap));
