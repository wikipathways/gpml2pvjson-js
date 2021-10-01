import { find, findIndex, last, map, omit, toPairs } from "lodash/fp";
import {
  START_SIDE_TO_EMANATION_ANGLE_MAPPINGS,
  START_SIDE_TO_ORIENTATION_MAP,
  EMANATION_ANGLE_TO_START_SIDE_MAPPINGS,
  flipOrientation,
  flipSide,
  getStartSideByOrientation,
  SmartPoint,
  SmartPath,
  SmartVector
} from "../geom-utils";
import { normalize, distance, shortestDirection } from "../spinoffs/Angle";
import {
  Orientation,
  Point,
  PvjsonNode,
  PvjsonEdge,
  AttachablePoint
} from "../gpml2pvjson";
import { DEFAULT_STUB_LENGTH } from "./edge";
import {
  getOrientationOfHyperedgeStartPoint,
  getOrientationOfHyperedgeEndPoint,
  validateOrientation
} from "./orientation";

const INDEX_TO_DIMENSION = ["x", "y"];

function getActiveOrientationIndexAndDimension(orientation: [number, number]) {
  const activeOrientationIndex = findIndex(
    (orientationScalar: number) => orientationScalar !== 0,
    orientation
  );
  const activeOrientationDimension = INDEX_TO_DIMENSION[activeOrientationIndex];
  const otherOrientationDimension =
    activeOrientationDimension === "x" ? "y" : "x";
  return {
    activeOrientationIndex,
    activeOrientationDimension,
    otherOrientationDimension
  };
}

/**
 * calculateAllPoints for edges of type Elbow and Curved
 *
 * PathVisio-Java does not always specify all the points needed to draw edges
 * of type Elbow and Curved. Unless the user drags one or more of the
 * waypoints, PathVisio-Java will only specify the first and last points,
 * leaving implicit one or more additional points that are required to draw
 * the edge.
 *
 * Kaavio requires that a PvjsonEdge specifies ALL the points required for
 * drawing the edge, so this function calculates any implicit points required
 * to unambiguously specify an edge and returns the full set of points
 * (implicit points are made explicit).
 *
 * @param explicitPoints {Array}
 * @param [sourceEntity] {Object} entity from which the EDGE emanates
 *                                (never an Anchor)
 * @param [targetEntity] {Object} entity into which the EDGE terminates
 *                                (never an Anchor)
 * @return {Array} Full set of points required to render the edge
 */
export function calculateAllPoints(
  explicitPoints: (Point & SmartPoint)[],
  sourceEntity?: PvjsonNode | PvjsonEdge,
  targetEntity?: PvjsonNode | PvjsonEdge
): Point[] {
  let firstPoint = explicitPoints[0] as AttachablePoint & SmartPoint;
  let lastPoint = explicitPoints[explicitPoints.length - 1] as AttachablePoint &
    SmartPoint;

  // NOTE: we need at least one of the first point or the last point to have a
  // valid orientation. If that's not the case already, we try setting it here,
  // based on other information available to us.
  if (!validateOrientation(firstPoint.orientation)) {
    if (firstPoint.hasOwnProperty("isAttachedTo")) {
      // It is correct to specify <PvjsonEdge> as the type for
      // sourceEntity/targetEntity when calculating the orientation of a point
      // attached to another edge below, because we get into there if neither
      // the first nor last point have a valid orientation. If a point is
      // attached to a SingleFreeNode, a Group or a GPML State, it would already
      // have a valid orientation calculated by this point, so the point must
      // be either attached to nothing or else attached to an edge.
      firstPoint.orientation = getOrientationOfHyperedgeStartPoint(
        <PvjsonEdge>sourceEntity,
        firstPoint,
        lastPoint
      ) as Orientation;
    } else {
      firstPoint.orientation = [-1, 0];
    }
  }

  if (!validateOrientation(lastPoint.orientation)) {
    if (lastPoint.hasOwnProperty("isAttachedTo")) {
      // It is correct to specify <PvjsonEdge> as the type for
      // sourceEntity/targetEntity when calculating the orientation of a point
      // attached to another edge below, because we get into there if neither
      // the first nor last point have a valid orientation. If a point is
      // attached to a SingleFreeNode, a Group or a GPML State, it would already
      // have a valid orientation calculated by this point, so the point must
      // be either attached to nothing or else attached to an edge.
      lastPoint.orientation = getOrientationOfHyperedgeEndPoint(
        <PvjsonEdge>targetEntity,
        lastPoint,
        firstPoint
      ) as Orientation;
    } else {
      const { x: x0, y: y0 } = firstPoint;
      const { x: x1, y: y1 } = lastPoint;
      const firstSide = getStartSideByOrientation(firstPoint.orientation);
      if (firstSide === "left") {
        if (x0 >= x1 && x0 < x1 + DEFAULT_STUB_LENGTH) {
          lastPoint.orientation = [1, 0];
        } else {
          lastPoint.orientation = [-1, 0];
        }
      } else if (firstSide === "right") {
        if (x0 + DEFAULT_STUB_LENGTH <= x1) {
          lastPoint.orientation = [1, 0];
        } else {
          lastPoint.orientation = [-1, 0];
        }
      } else {
        lastPoint.orientation = [-1, 0];
      }
    }
  }

  if (explicitPoints.length > 2) {
    return explicitPoints;
  }

  let startPoint;
  let endPoint;
  let endEntity;
  let pointOrderReversed;
  if (validateOrientation(firstPoint.orientation)) {
    pointOrderReversed = false;
    startPoint = firstPoint;
    endPoint = lastPoint;
    endEntity = targetEntity;
  } else if (validateOrientation(lastPoint.orientation)) {
    pointOrderReversed = true;
    startPoint = lastPoint;
    endPoint = firstPoint;
    endEntity = sourceEntity;
  } else {
    throw new Error(
      `Either first or last point (or both) should have a valid
			orientation by now in
			calculateAllPoints(
				${JSON.stringify(explicitPoints)},
				${JSON.stringify(sourceEntity)},
				${JSON.stringify(targetEntity)}
			)`
    );
  }

  const startOrientation = startPoint.orientation;
  const endOrientation = endPoint.orientation;

  const vectorSumOrientation = [
    Math.sign(endPoint.x - startPoint.x),
    Math.sign(endPoint.y - startPoint.y)
  ];

  const {
    activeOrientationIndex: activeStartOrientationIndex,
    activeOrientationDimension: activeStartOrientationDimension,
    otherOrientationDimension: otherStartOrientationDimension
  } = getActiveOrientationIndexAndDimension(startOrientation);
  const {
    activeOrientationIndex: activeEndOrientationIndex,
    activeOrientationDimension: activeEndOrientationDimension,
    otherOrientationDimension: otherEndOrientationDimension
  } = getActiveOrientationIndexAndDimension(endOrientation);

  const pvjsonPoints = [];
  pvjsonPoints.push(startPoint);

  // Calculate intermediate data points, which are implicit.
  // Remember that this refers to the minimum number of points required to
  // define the path, so 3 points could mean this:
  //
  //  -------------------*-------------------
  //  |                                     |
  //  |                                     |
  //  *                                     *
  //
  //  or this:
  //                                        *
  //                                        |
  //                                        |
  //  -------------------*-------------------
  //  |
  //  |
  //  *
  //
  //  or several other possible configurations

  // NOTE: when an edge is connected to a SingleFreeNode or a Group (how about a State?),
  // PathVisio-Java will route the edge around the side from which the edge
  // emanates, if needed.
  // But when an edge is connected to another edge, PathVisio-Java
  // does not do any special re-routing for that connection.

  if (activeStartOrientationIndex === activeEndOrientationIndex) {
    // Start and end orientations are parallel, e.g.,
    // starts at right and ends on either right or left side, or
    // starts on top and ends on either top or bottom side.
    const activeOrientationIndex = activeStartOrientationIndex;
    const activeOrientationDimension = activeStartOrientationDimension;
    const otherOrientationDimension = otherStartOrientationDimension;
    const otherOrientationDimensionDisplacement =
      endPoint[otherOrientationDimension] -
      startPoint[otherOrientationDimension];
    if (
      startOrientation[activeOrientationIndex] ===
      vectorSumOrientation[activeOrientationIndex]
    ) {
      // we don't have to avoid the start side
      pvjsonPoints[1] = {};
      pvjsonPoints[1][otherOrientationDimension] =
        startPoint[otherOrientationDimension] +
        otherOrientationDimensionDisplacement / 2;
      if (
        startOrientation[activeOrientationIndex] ===
        endOrientation[activeOrientationIndex]
      ) {
        //  *---
        //     |
        //     |
        //     *
        //     |
        //     |
        //     ---------------------*
        pvjsonPoints[1][activeOrientationDimension] =
          startPoint[activeOrientationDimension] +
          startOrientation[activeOrientationIndex] * DEFAULT_STUB_LENGTH;
      } else {
        //  *-------------------------
        //                           |
        //                           |
        //                           *
        //                           |
        //                           |
        //                        *---
        pvjsonPoints[1][activeOrientationDimension] =
          endPoint[activeOrientationDimension] -
          endOrientation[activeOrientationIndex] * DEFAULT_STUB_LENGTH;
      }
    } else {
      // must initially route around start side
      if (
        startOrientation[activeOrientationIndex] ===
        endOrientation[activeOrientationIndex]
      ) {
        //                        *---
        //                           |
        //                           |
        //                           *
        //                           |
        //                           |
        //     -----------*-----------
        //     |
        //     |
        //     *
        //     |
        //     |
        //     ---*

        pvjsonPoints[1] = {};
        pvjsonPoints[1][activeOrientationDimension] =
          startPoint[activeOrientationDimension] +
          startOrientation[activeOrientationIndex] * DEFAULT_STUB_LENGTH;
        pvjsonPoints[1][otherOrientationDimension] =
          startPoint[otherOrientationDimension] +
          otherOrientationDimensionDisplacement / 4;

        pvjsonPoints[2] = {};
        pvjsonPoints[2][activeOrientationDimension] =
          (startPoint[activeOrientationDimension] +
            endPoint[activeOrientationDimension]) /
          2;
        pvjsonPoints[2][otherOrientationDimension] =
          startPoint[otherOrientationDimension] +
          otherOrientationDimensionDisplacement / 2;

        pvjsonPoints[3] = {};
        pvjsonPoints[3][activeOrientationDimension] =
          endPoint[activeOrientationDimension] -
          endOrientation[activeOrientationIndex] * DEFAULT_STUB_LENGTH;
        pvjsonPoints[3][otherOrientationDimension] =
          startPoint[otherOrientationDimension] +
          (3 * otherOrientationDimensionDisplacement) / 4;
      } else {
        //                        *---
        //                           |
        //                           |
        //                           *
        //                           |
        //                           |
        //      *---------------------
        pvjsonPoints[1] = {};
        pvjsonPoints[1][activeOrientationDimension] =
          startPoint[activeOrientationDimension] +
          startOrientation[activeOrientationIndex] * DEFAULT_STUB_LENGTH;
        pvjsonPoints[1][otherOrientationDimension] =
          startPoint[otherOrientationDimension] +
          otherOrientationDimensionDisplacement / 2;
      }
    }
  } else {
    // Start and end orientations are perpendicular
    if (
      startOrientation[activeStartOrientationIndex] ===
        vectorSumOrientation[activeStartOrientationIndex] &&
      endOrientation[activeEndOrientationIndex] ===
        vectorSumOrientation[activeEndOrientationIndex]
    ) {
      //     *
      //     |
      //     |
      //     |
      //     |
      //     |
      //     ---------------------*
      //
      // Do nothing.
    } else {
      //                     ---*
      //                     |
      //                     |
      //                     |
      //                     *
      //     *               |
      //     |               |
      //     |               |
      //     --------*--------
      //
      //     or           *---
      //                     |
      //                     |
      //                     |
      //                     *
      //     *               |
      //     |               |
      //     |               |
      //     --------*--------
      //
      //     or
      //
      // ----*
      // |
      // |
      // *
      // |
      // |
      // ---*---
      //       |
      //       |
      //       *
      const otherStartOrientationDimensionDisplacement =
        endPoint[otherStartOrientationDimension] -
        endOrientation[activeEndOrientationIndex] * DEFAULT_STUB_LENGTH -
        startPoint[otherStartOrientationDimension];

      pvjsonPoints[1] = {};

      pvjsonPoints[1][activeStartOrientationDimension] =
        startPoint[activeStartOrientationDimension] +
        startOrientation[activeStartOrientationIndex] * DEFAULT_STUB_LENGTH;

      pvjsonPoints[1][otherStartOrientationDimension] =
        startPoint[otherStartOrientationDimension] +
        otherStartOrientationDimensionDisplacement / 2;

      pvjsonPoints[2] = {};
      pvjsonPoints[2][activeEndOrientationDimension] =
        endPoint[activeEndOrientationDimension] -
        endOrientation[activeEndOrientationIndex] * DEFAULT_STUB_LENGTH;

      pvjsonPoints[2][otherEndOrientationDimension] =
        (pvjsonPoints[1][otherEndOrientationDimension] +
          endPoint[otherEndOrientationDimension]) /
        2;
    }
  }

  pvjsonPoints.push(endPoint);

  return pointOrderReversed ? pvjsonPoints.reverse() : pvjsonPoints;
}
