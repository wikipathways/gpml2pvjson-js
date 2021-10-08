import {
  assign,
  curry,
  defaultsDeep,
  fromPairs,
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
import * as GPML2021GroupMappingsByType from "./2021/GroupMappingsByType.json";
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
  strokeWidth: number,
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
    throw new Error(`Invalid padding value: ${padding}`);
  } else if (!isFinite(strokeWidth)) {
    throw new Error(`Invalid strokeWidth value: ${strokeWidth}`);
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

        runningDimensions.x = topLeftCorner.x - padding - strokeWidth;
        runningDimensions.y = topLeftCorner.y - padding - strokeWidth;
        runningDimensions.width =
          bottomRightCorner.x - topLeftCorner.x + 2 * (padding + strokeWidth);
        runningDimensions.height =
          bottomRightCorner.y - topLeftCorner.y + 2 * (padding + strokeWidth);

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

  const propertiesToCheck = ["x", "y", "width", "height", "zIndex"];
  const nonFinites = propertiesToCheck
    .map(function(key) {
      return [[key], dimensions[key]];
    })
    .filter(dims => !isFinite(dims[1]));
  if (nonFinites.length > 0) {
    throw new Error(
      `Got a non-finite value(s):
			${JSON.stringify(fromPairs(nonFinites), null, "  ")}
			when calling
			getGroupDimensions(
				padding: ${padding},
				strokeWidth: ${strokeWidth},
				containedEntities: ${JSON.stringify(containedEntities, null, "  ")}
			)
			
			`
    );
  }

  return dimensions;
}

// NOTE: side effects
export const preprocessGPML = curry(function(
  processor: Processor,
  Group: GPMLElement
): GPMLElement {
  // There are defaults for each Group.type, so we apply them here.
  // TODO: in GPML2021, many of the values for GPMLDefaults are actually now
  // specified in the GPML, so we don't need to specify defaults for the ones
  // that are now explicitly specified.
  /*
  toPairs(GPML2021GroupMappingsByType[Group.type]).forEach(function([
    mappingKey,
    mappingValue
  ]) {
    const oldValue = Group[mappingKey];
    let newValue;
    if (isPlainObject(mappingValue)) {
      newValue = defaultsDeep(mappingValue, oldValue || {});
    } else if (Group.hasOwnProperty(mappingKey)) {
      if (isArray(mappingValue)) {
        newValue = unionLSV(mappingValue, oldValue);
      } else {
        newValue = oldValue;
      }
    } else {
      // override prototype with default by Group.type
      newValue = mappingValue;
    }
    Group[mappingKey] = newValue;
  });
  //*/
  Group.Contains = processor.elementIdsByGroupRef[Group.elementId];
  return Group;
});

export function postprocessPVJSON(
  containedEntities: (PvjsonSingleFreeNode | PvjsonEdge)[],
  group: PvjsonGroup
): PvjsonGroup {
  return assign(
    group,
    getGroupDimensions(group.padding, group.strokeWidth, containedEntities)
  );
}
