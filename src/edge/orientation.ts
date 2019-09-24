import { flow, isFinite, last, map } from "lodash/fp";
import {
  START_SEGMENT_DETAILS_MAPS,
  flipOrientation,
  sameSide,
  SmartPoint,
  SmartPath
} from "../geom-utils";
import { distance } from "../spinoffs/Angle";
import {
  Point,
  PvjsonEdge,
  AttachablePoint,
  Orientation,
  SegmentPoint
} from "../gpml2pvjson";
import { DEFAULT_STUB_LENGTH } from "./edge";

/**
 * getOrientationOfHyperedgeStartPoint
 *
 * Get orientation of the start point of an edge that is attached to another
 * edge.
 *
 * @param referencedEdge {PvjsonEdge}
 * @param startPoint {Point}
 * @param otherPoint {Point}
 * @return {Orientation}
 */
export function getOrientationOfHyperedgeStartPoint(
  referencedEdge: PvjsonEdge,
  startPoint: AttachablePoint & SmartPoint,
  endPoint: AttachablePoint & SmartPoint
): Orientation {
  if (!referencedEdge) {
    throw new Error(
      "Missing referencedEdge when calculating orientation of point attached to other edge."
    );
  }

  const currentPath = new SmartPath([startPoint, endPoint]);
  const angleOfCurrentVectorSum = currentPath.sum.angle;
  const referencedPath = new SmartPath(referencedEdge.points, referencedEdge);

  // This is the angle of the line tangent to the referenced edge at
  // startPoint.
  const angleOfReferencedEdgeAtPointOnEdge = referencedPath.position(
    startPoint.attachmentDisplay.position[0]
  ).angle;

  const firstSegmentCalculations = START_SEGMENT_DETAILS_MAPS.map(function(
    startSegmentDetailsMap
  ) {
    /*
     *   referenced edge
     *         /
     *        /
     *       /.
     *      /  angle (rad)
     *     /    .
     *    /--------------
     *   /       ^      |           --------------
     *  /        |      |           |            |
     *           |      ------------|            |
     *           |                  |            |
     *      firstSegment            --------------
     *   (of current edge)
     *
     */

    const { orientation } = startSegmentDetailsMap;
    const [orientationX, orientationY] = orientation;
    const firstSegmentEndPoint: SegmentPoint = {
      x: startPoint.x + DEFAULT_STUB_LENGTH * orientationX,
      y: startPoint.y + DEFAULT_STUB_LENGTH * orientationY
    };

    return {
      firstSegmentEndPoint,
      endPoint,
      emanationAngle: startSegmentDetailsMap.angle,
      orientation: orientation
    };
  })
    .map(function({
      firstSegmentEndPoint,
      endPoint,
      emanationAngle: emanationAngle,
      orientation
    }) {
      const isSameSide = sameSide(
        referencedEdge.points[0],
        last(referencedEdge.points),
        firstSegmentEndPoint,
        endPoint
      );
      const angleBetweenOrientationVectorAndCurrentEdge = distance(
        emanationAngle,
        angleOfCurrentVectorSum
      );
      const angleBetweenOrientationVectorAndReferencedEdge = distance(
        angleOfReferencedEdgeAtPointOnEdge,
        emanationAngle
      );

      return {
        isSameSide,
        angleBetweenOrientationVectorAndCurrentEdge,
        angleBetweenOrientationVectorAndVectorPerpendicularToReferencedEdge: Math.abs(
          angleBetweenOrientationVectorAndReferencedEdge - Math.PI / 2
        ),
        orientation
      };
    })
    // Sorting by three criteria, with the most important first:
    // 1. The second point and the end point of the current edge are on the
    //    same of the	referenced edge.
    // 2. The emanation angle is as close as possible to being perpendicular to
    //    the referenced edge.
    // 3. The angle of the first segment matches the angle of the current edge.
    .sort(function(a, b) {
      if (a.isSameSide && !b.isSameSide) {
        return -1;
      } else if (!a.isSameSide && b.isSameSide) {
        return 1;
      } else {
        if (
          a.angleBetweenOrientationVectorAndVectorPerpendicularToReferencedEdge <
          b.angleBetweenOrientationVectorAndVectorPerpendicularToReferencedEdge
        ) {
          return -1;
        } else if (
          a.angleBetweenOrientationVectorAndVectorPerpendicularToReferencedEdge >
          b.angleBetweenOrientationVectorAndVectorPerpendicularToReferencedEdge
        ) {
          return 1;
        } else {
          if (
            a.angleBetweenOrientationVectorAndCurrentEdge <
            b.angleBetweenOrientationVectorAndCurrentEdge
          ) {
            return -1;
          } else if (
            a.angleBetweenOrientationVectorAndCurrentEdge >
            b.angleBetweenOrientationVectorAndCurrentEdge
          ) {
            return 1;
          } else {
            return 0;
          }
        }
      }
    });

  const formatted = map(function(firstSegmentCalculation) {
    const {
      angleBetweenOrientationVectorAndVectorPerpendicularToReferencedEdge,
      angleBetweenOrientationVectorAndCurrentEdge,
      isSameSide
    } = firstSegmentCalculation;
    return {
      angleBetweenOrientationVectorAndVectorPerpendicularToReferencedEdge:
        String(
          angleBetweenOrientationVectorAndVectorPerpendicularToReferencedEdge /
            Math.PI
        ) + " * PI",
      angleBetweenOrientationVectorAndCurrentEdge:
        String(angleBetweenOrientationVectorAndCurrentEdge / Math.PI) + " * PI",
      isSameSide
    };
  }, firstSegmentCalculations);
  return firstSegmentCalculations[0].orientation;
}

// Uses the same sorting criteria as getOrientationOfHyperedgeStartPoint,
// except with the obvious changes in direction to account for being the
// endPoint instead of the startPoint.
export const getOrientationOfHyperedgeEndPoint = flow(
  getOrientationOfHyperedgeStartPoint,
  flipOrientation
);

// Validate orientation of attachment display.
//
// When attached to a normal Node, we can calculate the orientation immediately
// so this will return true right away.
// When attached to an Edge or Group, we need to do more processing,
// so this will at least initially return false.
// TODO: Not sure whether the orientation of a point attached to an Edge or a
// Group is ever set.
export function validateOrientation(orientation: Orientation): boolean {
  return !!orientation && isFinite(orientation[0]) && isFinite(orientation[1]);
}
/*
    // NOTE: PathVisio-Java appears to try to avoid making an edge
    // terminate into another edge at an approach angle of anything
    // less than about 30 deg.
    if (endPoint.hasOwnProperty("isAttachedTo")) {
      const referencedEndPath = new SmartPath(endEntity.points, endEntity);
      const angleOfReferencedEdgeAtPointOnEdge = referencedEndPath.position(
        startPoint.attachmentDisplay.position[0]
      ).angle;
      if (
        Math.abs(
          START_SIDE_TO_EMANATION_ANGLE_MAPPINGS[endSide] -
            angleOfReferencedEdgeAtPointOnEdge
        ) <
        30 * (Math.PI / 180)
      ) {
        // edge1 is almost parallel with edge2, making it hard to read, so we need to recalculate.
        endPoint.orientation = getOrientationOfHyperedgeEndPoint(
          endEntity,
          endPoint,
          startPoint
        );
        return getAndCompareSides(startPoint, endPoint, endEntity);
      }
    }
//*/
