import { defaultsDeep, isNumber, isString, map, omit } from "lodash/fp";
import * as hl from "highland";
import { intersectsLSV, unionLSV } from "./gpml-utilities";
// TODO compile this as part of the build step for this package
//import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";
import * as GPML2013a from "../../cxml/test/xmlns/pathvisio.org/GPML/2013a";

interface DataPositionAndOrientationMapping {
  position: number;
  orientation: number;
  offset: number;
}

interface Combination {
  sideComparison: string;
  reroutingRequired: boolean;
  expectedPointCount: number;
  sidesToRouteAround?: Sides[];
}

interface Sides {
  first: "top" | "right" | "bottom" | "left";
  last: "top" | "right" | "bottom" | "left";
  comparison: "same" | "perpendicular" | "opposing";
}

const HYPEREDGE_RECURSION_LIMIT = 5;

// a stub is a short path segment that is used for the first and/or last segment(s) of a path
const DEFAULT_STUB_LENGTH = 20;

function attachedToCompleteAttachmentDisplay(point: Point): boolean {
  return (
    point.hasOwnProperty("attachmentDisplay") &&
    isNumber(point.attachmentDisplay.orientation[0]) &&
    isNumber(point.attachmentDisplay.orientation[1])
  );
}

/**
 * calculateImplicitPoints
 *
 * @param explicitPoints {Array}
 * @param referencedEntities {Array}
 * @return {Array} Set of points required to render the edge. Additional points are added if required to unambiguously specify an edge (implicit points are made explicit).
 */
function calculateImplicitPoints(
  explicitPoints: Point[],
  sourceEntity?: PvjsonNode | PvjsonEdge,
  targetEntity?: PvjsonNode | PvjsonEdge
): Point[] {
  const firstExplicitPoint = explicitPoints[0];
  const lastExplicitPoint = explicitPoints[explicitPoints.length - 1];

  let firstPoint;
  let lastPoint;

  let sideCombination;
  let expectedPointCount;
  // this stub is used to make the edge emanate away from the source (or target) node, even though that means initially moving away from the target (or source) node
  let sidesToRouteAround;

  // TODO check whether it's correct to specify <PvjsonEdge> as the type for
  // sourceEntity/targetEntity when running getSideEquivalentForLine below

  // if first and last points are not attached to other attachmentDisplay entities
  if (
    attachedToCompleteAttachmentDisplay(firstExplicitPoint) &&
    attachedToCompleteAttachmentDisplay(lastExplicitPoint)
  ) {
    firstPoint = firstExplicitPoint;
    lastPoint = lastExplicitPoint;
    sideCombination = getSideCombination(firstPoint, lastPoint);

    // if first point is not attached to another attachmentDisplay entity and last point is attached to an attachmentDisplay (not a group)
  } else if (
    attachedToCompleteAttachmentDisplay(firstExplicitPoint) &&
    lastExplicitPoint.hasOwnProperty("attachmentDisplay")
  ) {
    firstPoint = firstExplicitPoint;
    lastPoint = getSideEquivalentForLine(
      firstExplicitPoint,
      lastExplicitPoint,
      <PvjsonEdge>targetEntity
    );
    sideCombination = getSideCombination(firstPoint, lastPoint);

    // if last point is not attached to another attachmentDisplay entity and first point is attached to an attachmentDisplay (not a group)
  } else if (
    attachedToCompleteAttachmentDisplay(lastExplicitPoint) &&
    firstExplicitPoint.hasOwnProperty("attachmentDisplay")
  ) {
    firstPoint = getSideEquivalentForLine(
      lastExplicitPoint,
      firstExplicitPoint,
      <PvjsonEdge>sourceEntity
    );
    lastPoint = lastExplicitPoint;
    sideCombination = getSideCombination(firstPoint, lastPoint);

    // if first and last points are attached to attachmentDisplays
  } else if (
    firstExplicitPoint.hasOwnProperty("attachmentDisplay") &&
    lastExplicitPoint.hasOwnProperty("attachmentDisplay")
  ) {
    firstPoint = getSideEquivalentForLine(
      lastExplicitPoint,
      firstExplicitPoint,
      <PvjsonEdge>sourceEntity
    );
    lastPoint = getSideEquivalentForLine(
      firstExplicitPoint,
      lastExplicitPoint,
      <PvjsonEdge>targetEntity
    );
    sideCombination = getSideCombination(firstPoint, lastPoint);
    /*
		// TODO change this to actually calculate the number
		sideCombination = {};
		sideCombination.expectedPointCount = 2;
		//*/
    // Note: each of the following options indicate an unconnected edge on one or both ends
    // We are not calculating the implicit points for these, because they are probably already in error.

    // if first point is attached to an attachmentDisplay and last point is unconnected
  } else if (firstExplicitPoint.hasOwnProperty("attachmentDisplay")) {
    firstPoint = firstExplicitPoint;
    lastPoint = lastExplicitPoint;
    sideCombination = {};
    sideCombination.expectedPointCount = 2;
    // if last point is attached to an attachmentDisplay and first point is unconnected
  } else if (lastExplicitPoint.hasOwnProperty("attachmentDisplay")) {
    firstPoint = firstExplicitPoint;
    lastPoint = lastExplicitPoint;
    sideCombination = {};
    sideCombination.expectedPointCount = 2;
    // if both ends are unconnected
  } else {
    firstPoint = firstExplicitPoint;
    lastPoint = lastExplicitPoint;
    sideCombination = {};
    sideCombination.expectedPointCount = 2;
  }
  expectedPointCount = sideCombination.expectedPointCount;
  sidesToRouteAround = sideCombination.sidesToRouteAround;

  //check to see whether all implicit points are provided
  if (explicitPoints.length >= expectedPointCount) {
    return explicitPoints;
  } else {
    const directionIsVertical =
      Math.abs(firstPoint.attachmentDisplay.orientation[1]) === 1;

    // only used for curves
    const tension = 1;

    const pvjsonPoints = [];

    //first data point is start point
    pvjsonPoints[0] = firstPoint;

    // calculate intermediate data points, which are implicit
    // remember that this refers to the minimum number of points required to define the path,
    // so 3 points means something like this:
    //
    //  -------------------*-------------------
    //  |                                     |
    //  |                                     |
    //  *                                     *
    //
    //                    or
    //                                        *
    //                                        |
    //                                        |
    //  -------------------*-------------------
    //  |
    //  |
    //  *
    //
    //  other configurations possible

    if (expectedPointCount === 3) {
      if (directionIsVertical) {
        pvjsonPoints[1] = {};
        pvjsonPoints[1].x = (firstPoint.x + lastPoint.x) / 2;
        if (sidesToRouteAround.length === 0) {
          //pvjsonPoints[1].y = (firstPoint.y + lastPoint.y) / 2;
          // this stub is not required, but we're just somewhat arbitrarily using it because the pathway author did not specify where the midpoint of the second path segment should be
          pvjsonPoints[1].y =
            firstPoint.y +
            firstPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
        } else {
          if (firstPoint.attachmentDisplay.orientation[1] > 0) {
            pvjsonPoints[1].y =
              Math.max(firstPoint.y, lastPoint.y) +
              firstPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
          } else {
            pvjsonPoints[1].y =
              Math.min(firstPoint.y, lastPoint.y) +
              firstPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
          }
        }
      } else {
        pvjsonPoints[1] = {};
        if (sidesToRouteAround.length === 0) {
          //pvjsonPoints[1].x = (firstPoint.x + lastPoint.x) / 2;
          // this stub is not required, but we're just somewhat arbitrarily using it because the pathway author did not specify where the midpoint of the second path segment should be
          pvjsonPoints[1].x =
            firstPoint.x +
            firstPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
        } else {
          if (firstPoint.attachmentDisplay.orientation[0] > 0) {
            pvjsonPoints[1].x =
              Math.max(firstPoint.x, lastPoint.x) +
              firstPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
          } else {
            pvjsonPoints[1].x =
              Math.min(firstPoint.x, lastPoint.x) +
              firstPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
          }
        }
        pvjsonPoints[1].y = (firstPoint.y + lastPoint.y) / 2;
      }
    } else if (expectedPointCount === 4) {
      //  ------------------*--------------------
      //  |                                     |
      //  |                                     |
      //  *                                     *
      //                                        |
      //                                        |
      //                                        ---*
      //
      //  many other configurations possible

      if (directionIsVertical) {
        pvjsonPoints[1] = {};
        pvjsonPoints[1].x =
          (firstPoint.x +
            lastPoint.x +
            lastPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH) /
          2;
        if (sidesToRouteAround.indexOf("first") === -1) {
          pvjsonPoints[1].y =
            firstPoint.y +
            firstPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
        } else {
          if (firstPoint.attachmentDisplay.orientation[1] > 0) {
            pvjsonPoints[1].y =
              Math.max(firstPoint.y, lastPoint.y) +
              firstPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
          } else {
            pvjsonPoints[1].y =
              Math.min(firstPoint.y, lastPoint.y) +
              firstPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
          }
        }
        pvjsonPoints[2] = {};
        if (sidesToRouteAround.indexOf("last") === -1) {
          pvjsonPoints[2].x =
            lastPoint.x +
            lastPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
        } else {
          if (lastPoint.attachmentDisplay.orientation[0] > 0) {
            pvjsonPoints[2].x =
              Math.max(firstPoint.x, lastPoint.x) +
              lastPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
          } else {
            pvjsonPoints[2].x =
              Math.min(firstPoint.x, lastPoint.x) +
              lastPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
          }
        }
        pvjsonPoints[2].y = (pvjsonPoints[1].y + lastPoint.y) / 2;
      } else {
        pvjsonPoints[1] = {};
        pvjsonPoints[1].x =
          firstPoint.x +
          firstPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
        if (sidesToRouteAround.indexOf("first") === -1) {
          pvjsonPoints[1].x =
            firstPoint.x +
            firstPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
        } else {
          if (firstPoint.attachmentDisplay.orientation[0] > 0) {
            pvjsonPoints[1].x =
              Math.max(firstPoint.x, lastPoint.x) +
              firstPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
          } else {
            pvjsonPoints[1].x =
              Math.min(firstPoint.x, lastPoint.x) +
              firstPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
          }
        }
        pvjsonPoints[1].y =
          (firstPoint.y +
            lastPoint.y +
            lastPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH) /
          2;
        pvjsonPoints[2] = {};
        pvjsonPoints[2].x = (pvjsonPoints[1].x + lastPoint.x) / 2;
        if (sidesToRouteAround.indexOf("last") === -1) {
          pvjsonPoints[2].y =
            lastPoint.y +
            lastPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
        } else {
          if (lastPoint.attachmentDisplay.orientation[1] > 0) {
            pvjsonPoints[2].y =
              Math.max(firstPoint.y, lastPoint.y) +
              lastPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
          } else {
            pvjsonPoints[2].y =
              Math.min(firstPoint.y, lastPoint.y) +
              lastPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
          }
        }
      }
    } else if (expectedPointCount === 5) {
      //                                     *---
      //                                        |
      //                                        *
      //                                        |
      //  -------------------*-------------------
      //  |
      //  *
      //  |
      //  ---*
      //
      //  many other configurations possible

      if (directionIsVertical) {
        pvjsonPoints[1] = {};
        pvjsonPoints[1].x = (lastPoint.x - firstPoint.x) / 4 + firstPoint.x;
        pvjsonPoints[1].y =
          firstPoint.y +
          firstPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
        pvjsonPoints[2] = {};
        pvjsonPoints[2].x = (firstPoint.x + lastPoint.x) / 2;
        pvjsonPoints[2].y = (firstPoint.y + lastPoint.y) / 2;
        pvjsonPoints[3] = {};
        pvjsonPoints[3].x =
          (lastPoint.x - firstPoint.x) * (3 / 4) + firstPoint.x;
        pvjsonPoints[3].y =
          lastPoint.y +
          lastPoint.attachmentDisplay.orientation[1] * DEFAULT_STUB_LENGTH;
      } else {
        pvjsonPoints[1] = {};
        pvjsonPoints[1].x =
          firstPoint.x +
          firstPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
        pvjsonPoints[1].y = (lastPoint.y - firstPoint.y) / 4 + firstPoint.y;
        pvjsonPoints[2] = {};
        pvjsonPoints[2].x = (firstPoint.x + lastPoint.x) / 2;
        pvjsonPoints[2].y = (firstPoint.y + lastPoint.y) / 2;
        pvjsonPoints[3] = {};
        pvjsonPoints[3].x =
          lastPoint.x +
          lastPoint.attachmentDisplay.orientation[0] * DEFAULT_STUB_LENGTH;
        pvjsonPoints[3].y =
          (lastPoint.y - firstPoint.y) * (3 / 4) + firstPoint.y;
      }
    } else {
      throw new Error("Too many points expected.");
    }

    // last data point is end point
    pvjsonPoints.push(lastPoint);

    return pvjsonPoints;
  }
}

// see https://gist.github.com/ahwolf/4349166 and
// http://www.blackpawn.com/texts/pointinpoly/default.html
function crossProduct(u: [number, number], v: [number, number]): number {
  return u[0] * v[1] - v[0] * u[1];
}

function getAndCompareSides(firstPoint: Point, lastPoint: Point): Sides {
  const firstSide = getSide(firstPoint);
  const lastSide = getSide(lastPoint);
  if (firstSide === lastSide) {
    return { first: firstSide, last: lastSide, comparison: "same" };
  } else if (
    ((firstSide === "top" || firstSide === "bottom") &&
      !(lastSide === "top" || lastSide === "bottom")) ||
    (!(firstSide === "top" || firstSide === "bottom") &&
      (lastSide === "top" || lastSide === "bottom"))
  ) {
    return { first: firstSide, last: lastSide, comparison: "perpendicular" };
  } else {
    return { first: firstSide, last: lastSide, comparison: "opposing" };
  }
}

function getSideCombination(firstPoint: Point, lastPoint: Point): Combination {
  var combinations: Combination[] = [
    { sideComparison: "same", reroutingRequired: true, expectedPointCount: 3 },
    {
      sideComparison: "perpendicular",
      reroutingRequired: true,
      expectedPointCount: 4
    },
    {
      sideComparison: "perpendicular",
      reroutingRequired: false,
      expectedPointCount: 2
    },
    {
      sideComparison: "opposing",
      reroutingRequired: true,
      expectedPointCount: 5
    },
    {
      sideComparison: "opposing",
      reroutingRequired: false,
      expectedPointCount: 3
    }
  ];
  var sides = getAndCompareSides(firstPoint, lastPoint);
  var sidesToRouteAround = getSidesToRouteAround(firstPoint, lastPoint, sides);
  var reroutingRequired = sidesToRouteAround.length > 0;
  var sideCombination = combinations.filter(function(combination) {
    return (
      combination.sideComparison === sides.comparison &&
      combination.reroutingRequired === reroutingRequired
    );
  })[0];
  sideCombination.sidesToRouteAround = sidesToRouteAround;
  return sideCombination;
}

function getSideEquivalentForLine(
  pointOnShape: Point,
  pointOnEdge: Point,
  //referencedEdge: PvjsonEntity
  referencedEdge: PvjsonEdge
): Point {
  var riseFromPointOnEdgeToPointOnShape = pointOnShape.y - pointOnEdge.y;
  var runFromPointOnEdgeToPointOnShape = pointOnShape.x - pointOnEdge.x;
  var angleFromPointOnEdgeToPointOnShape = Math.atan2(
    riseFromPointOnEdgeToPointOnShape,
    runFromPointOnEdgeToPointOnShape
  );

  var angleOfReferencedEdge,
    referencedEdgePoints,
    firstPointOfReferencedEdge,
    lastPointOfReferencedEdge;

  if (!!referencedEdge) {
    // TODO handle case where referenced edge is not straight.
    // currently, the code below assumes the referenced edge is always straight, never elbowed or curved.
    // This would require being able to calculate a point at a distance along an elbow or curve.
    referencedEdgePoints = referencedEdge.points;

    firstPointOfReferencedEdge = referencedEdgePoints[0];

    firstPointOfReferencedEdge.x = parseFloat(
      firstPointOfReferencedEdge.x ||
        firstPointOfReferencedEdge.attributes.X.value
    );
    firstPointOfReferencedEdge.y = parseFloat(
      firstPointOfReferencedEdge.y ||
        firstPointOfReferencedEdge.attributes.Y.value
    );

    lastPointOfReferencedEdge =
      referencedEdgePoints[referencedEdgePoints.length - 1];
    lastPointOfReferencedEdge.x = parseFloat(
      lastPointOfReferencedEdge.x ||
        lastPointOfReferencedEdge.attributes.X.value
    );
    lastPointOfReferencedEdge.y = parseFloat(
      lastPointOfReferencedEdge.y ||
        lastPointOfReferencedEdge.attributes.Y.value
    );

    var riseOfReferencedEdge =
      lastPointOfReferencedEdge.y - firstPointOfReferencedEdge.y;
    var runOfReferencedEdge =
      lastPointOfReferencedEdge.x - firstPointOfReferencedEdge.x;

    angleOfReferencedEdge = Math.atan2(
      riseOfReferencedEdge,
      runOfReferencedEdge
    );
  }

  var firstSegmentOptions: SegmentOption[] = [
    {
      side: "top",
      orientationX: 0,
      orientationY: -1
    },
    {
      side: "right",
      orientationX: 1,
      orientationY: 0
    },
    {
      side: "bottom",
      orientationX: 0,
      orientationY: 1
    },
    {
      side: "left",
      orientationX: -1,
      orientationY: 0
    }
  ];

  let side;
  let orientationX;
  let orientationY;
  let selectedFirstSegmentCalculation;
  let minimumAngleBetweenFirstSegmentOptionsAndAttachedEdge;
  let firstSegmentCalculations = [];

  interface SegmentPoint {
    x: number;
    y: number;
    angle?: number;
  }

  interface SegmentOption {
    side: string;
    orientationX: number;
    orientationY: number;
    angle?: number;
    angleBetweenFirstSegmentOptionAndAttachedEdge?: number;
    angleBetweenFirstSegmentOptionAndReferencedEdge?: number;
  }

  firstSegmentOptions.forEach(function(firstSegmentOption) {
    var angleOption = Math.atan2(
      firstSegmentOption.orientationY,
      firstSegmentOption.orientationX
    );
    var angleBetweenFirstSegmentOptionAndAttachedEdge;

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

    var firstSegmentEndPoint = <SegmentPoint>{};
    firstSegmentEndPoint.x =
      pointOnEdge.x + DEFAULT_STUB_LENGTH * firstSegmentOption.orientationX;
    firstSegmentEndPoint.y =
      pointOnEdge.y + DEFAULT_STUB_LENGTH * firstSegmentOption.orientationY;
    if (
      !!referencedEdge &&
      sameSide(
        firstPointOfReferencedEdge,
        lastPointOfReferencedEdge,
        firstSegmentEndPoint,
        pointOnShape
      )
    ) {
      angleBetweenFirstSegmentOptionAndAttachedEdge = Math.abs(
        angleOption - angleFromPointOnEdgeToPointOnShape
      );
      if (angleBetweenFirstSegmentOptionAndAttachedEdge > Math.PI) {
        angleBetweenFirstSegmentOptionAndAttachedEdge =
          2 * Math.PI - angleBetweenFirstSegmentOptionAndAttachedEdge;
      }

      var angleBetweenFirstSegmentOptionAndReferencedEdge = Math.abs(
        angleOfReferencedEdge - angleOption
      );
      if (angleBetweenFirstSegmentOptionAndReferencedEdge > Math.PI) {
        angleBetweenFirstSegmentOptionAndReferencedEdge =
          2 * Math.PI - angleBetweenFirstSegmentOptionAndReferencedEdge;
      }

      firstSegmentOption.angle = angleOption;
      firstSegmentOption.angleBetweenFirstSegmentOptionAndAttachedEdge = angleBetweenFirstSegmentOptionAndAttachedEdge;
      firstSegmentOption.angleBetweenFirstSegmentOptionAndReferencedEdge = angleBetweenFirstSegmentOptionAndReferencedEdge;
      firstSegmentCalculations.push(firstSegmentOption);
    } else {
      angleBetweenFirstSegmentOptionAndAttachedEdge = null;
    }
  });

  if (!!firstSegmentCalculations && firstSegmentCalculations.length > 0) {
    if (!!referencedEdge) {
      // note we don't currently have logic to correctly determine the angle of the referenced edge if it's not straight.
      // sort so that first segment option closest to perpendicular to referenced edge is first
      firstSegmentCalculations.sort(function(a, b) {
        return (
          Math.abs(
            a.angleBetweenFirstSegmentOptionAndReferencedEdge - Math.PI / 2
          ) -
          Math.abs(
            b.angleBetweenFirstSegmentOptionAndReferencedEdge - Math.PI / 2
          )
        );
      });
    } else {
      // sort so that first segment option closest to attached edge is first
      firstSegmentCalculations.sort(function(a, b) {
        return (
          a.angleBetweenFirstSegmentOptionAndAttachedEdge -
          b.angleBetweenFirstSegmentOptionAndAttachedEdge
        );
      });
    }
    selectedFirstSegmentCalculation = firstSegmentCalculations[0];
  } else {
    console.warn(
      'The pathway author appears to have specified that the edges should cross but did not specify how to do it, so we arbitrarily choose to emanate from the "top"'
    );
    selectedFirstSegmentCalculation = firstSegmentOptions[0];
  }

  pointOnEdge.attachmentDisplay.orientation = [
    selectedFirstSegmentCalculation.orientationX,
    selectedFirstSegmentCalculation.orientationY
  ];

  return pointOnEdge;
}

function getSidesToRouteAround(
  firstPoint: Point,
  lastPoint: Point,
  sides: Sides
): Sides[] {
  var firstSideMustBeRoutedAround;
  var lastSideMustBeRoutedAround;
  var sidesToRouteAround = [];
  if (sides.comparison === "same") {
    if (sides.first === "top" || sides.first === "bottom") {
      firstSideMustBeRoutedAround =
        firstPoint.attachmentDisplay.orientation[1] !==
        (lastPoint.y - firstPoint.y) / Math.abs(lastPoint.y - firstPoint.y);
      firstSideMustBeRoutedAround = !lastSideMustBeRoutedAround;
    } else {
      firstSideMustBeRoutedAround =
        firstPoint.attachmentDisplay.orientation[0] !==
        (lastPoint.x - firstPoint.x) / Math.abs(lastPoint.x - firstPoint.x);
      firstSideMustBeRoutedAround = !lastSideMustBeRoutedAround;
    }
  } else if (sides.comparison === "opposing") {
    if (sides.first === "top" || sides.first === "bottom") {
      firstSideMustBeRoutedAround = lastSideMustBeRoutedAround =
        firstPoint.attachmentDisplay.orientation[1] !==
        (lastPoint.y - firstPoint.y) / Math.abs(lastPoint.y - firstPoint.y);
    } else {
      firstSideMustBeRoutedAround = lastSideMustBeRoutedAround =
        firstPoint.attachmentDisplay.orientation[0] !==
        (lastPoint.x - firstPoint.x) / Math.abs(lastPoint.x - firstPoint.x);
    }
    // if side comparison is not same or opposing, it must be perpendicular
  } else {
    if (sides.first === "top" || sides.first === "bottom") {
      firstSideMustBeRoutedAround =
        firstPoint.attachmentDisplay.orientation[1] !==
        (lastPoint.y - firstPoint.y) / Math.abs(lastPoint.y - firstPoint.y);
      lastSideMustBeRoutedAround =
        lastPoint.attachmentDisplay.orientation[0] !==
        (firstPoint.x - lastPoint.x) / Math.abs(firstPoint.x - lastPoint.x);
    } else {
      firstSideMustBeRoutedAround =
        firstPoint.attachmentDisplay.orientation[0] !==
        (lastPoint.x - firstPoint.x) / Math.abs(lastPoint.x - firstPoint.x);
      lastSideMustBeRoutedAround =
        lastPoint.attachmentDisplay.orientation[1] !==
        (firstPoint.y - lastPoint.y) / Math.abs(firstPoint.y - lastPoint.y);
    }
  }
  if (firstSideMustBeRoutedAround) {
    sidesToRouteAround.push("first");
  }
  if (lastSideMustBeRoutedAround) {
    sidesToRouteAround.push("last");
  }
  return sidesToRouteAround;
}

function getSide(explicitPoint: Point): "top" | "right" | "bottom" | "left" {
  if (
    Math.abs(explicitPoint.attachmentDisplay.orientation[0]) >
    Math.abs(explicitPoint.attachmentDisplay.orientation[1])
  ) {
    if (explicitPoint.attachmentDisplay.orientation[0] > 0) {
      return "right"; //East
    } else {
      return "left"; //West
    }
  } else {
    if (explicitPoint.attachmentDisplay.orientation[1] > 0) {
      return "bottom"; //South
    } else {
      return "top"; //North
    }
  }
}

function getDataPositionAndOrientationMapping(
  relValue: number,
  identifier: "RelX" | "RelY",
  referencedEntity: PvjsonNode
): DataPositionAndOrientationMapping {
  // orientation here refers to the initial direction the edge takes as it moves away from its attachmentDisplay
  let result = <DataPositionAndOrientationMapping>{};
  let position;
  let referencedEntityDimension;

  const relativeToUpperLeftCorner = (relValue + 1) / 2;
  if (relativeToUpperLeftCorner < 0 || relativeToUpperLeftCorner > 1) {
    if (identifier === "RelX") {
      referencedEntityDimension = referencedEntity.width;
    } else {
      referencedEntityDimension = referencedEntity.height;
    }
    if (relativeToUpperLeftCorner < 0) {
      position = 0;
      result.offset = relativeToUpperLeftCorner * referencedEntityDimension;
    } else {
      position = 1;
      result.offset =
        (relativeToUpperLeftCorner - 1) * referencedEntityDimension;
    }
  } else {
    position = relativeToUpperLeftCorner;
  }
  result.position = position;

  if (position === 0) {
    result.orientation = -1;
  } else if (position === 1) {
    result.orientation = 1;
  } else {
    result.orientation = 0;
  }

  return result;
}

function entityIdReferencedByEdgeIsPvjsonNode(
  entityIdReferencedByEdge: PvjsonNode | PvjsonEdge,
  entityReferencedByPoint
): entityIdReferencedByEdge is PvjsonNode {
  //return !intersectsLSV(["Interaction", "GraphicalLine"], entityReferencedByEdge.type);
  return entityReferencedByPoint.type.indexOf("Anchor") === -1;
}

function process(
  pvjsonEdge: PvjsonEdge,
  referencedEntities: { [key: string]: PvjsonEntity }
): PvjsonEdge {
  const { points, drawAs } = pvjsonEdge;

  const pointCount = points.length;
  let index = 0;
  const explicitPoints = map(function(point) {
    const { ArrowHead, GraphRef, RelX, RelY, X, Y } = point;
    const explicitPoint: Point = {} as Point;

    if (ArrowHead._exists !== false) {
      // NOTE: side effects below
      if (index === 0) {
        pvjsonEdge.markerStart = ArrowHead;
      } else if (index === pointCount - 1) {
        pvjsonEdge.markerEnd = ArrowHead;
      }
    }

    if (typeof X !== "undefined") {
      explicitPoint.x = X;
      explicitPoint.y = Y;
    }

    // entityReferencedByPoint can be a regular node (DataNode, Shape, Label)
    // or an Anchor. If connected to an Anchor, the biological meaning is
    // that the edge is connected to another edge, but in this code, we
    // implement this by treating the Anchor as a node, as if it were
    // a "burr" that is always stuck (isAttachedTo) the other edge.
    const entityReferencedByPoint =
      referencedEntities &&
      GraphRef &&
      (referencedEntities[GraphRef] as PvjsonNode);

    if (entityReferencedByPoint) {
      /*
      let entityIdReferencedByEdge;
			if (entityReferencedByPoint.type.indexOf(
        "Anchor"
      ) > -1) {
				entityIdReferencedByEdge = entityReferencedByPoint.isAttachedTo;
			} else {
				entityIdReferencedByEdge = entityReferencedByPoint.id;
			}
			//*/

      const entityIdReferencedByEdge = entityReferencedByPoint.type.indexOf(
        "Anchor"
      ) > -1
        ? entityReferencedByPoint.isAttachedTo
        : entityReferencedByPoint.id;

      // NOTE: pvjson allows for expressing one edge attached to another edge.
      // When we do this, we say that the POINT attaches to an ANCHOR on the other edge,
      // but the EDGE attaches to the other EDGE, never the anchor.
      explicitPoint.isAttachedTo = entityReferencedByPoint.id;
      // WARNING: side effects below
      pvjsonEdge.isAttachedTo = unionLSV(
        pvjsonEdge.isAttachedTo,
        entityIdReferencedByEdge
      ) as string[];

      const entityReferencedByEdge =
        referencedEntities[entityIdReferencedByEdge];

      // attachmentDisplay: { position: [x: number, y: number], offset: [xOffset: number, yOffset: number], orientation: [dx: number, dy: number] }
      //
      // x = xDistance / width (relative: [0,1])
      // y = yDistance / height (relative: [0,1])
      // xOffset = distance offset in x direction (absolute)
      // yOffset = distance offset in y direction (absolute)
      // dx = x component of edge emanation angle (unit: [0,1])
      // dy = y component of edge emanation angle (unit: [0,1])
      //
      //     0 ----------------- x ------------------->
      //     | ========================================
      //     | ||                                    ||
      //     | ||                                    ||
      //     | ||                                    ||
      //     y ||                                    ||
      //     | ||                                    ||
      //     | ||                                    ||
      //     | ||                                    ||
      //     | ||                                    ||
      //     v ===================*====================
      //                          |
      //                  yOffset |
      //                     |    |
      //                     v    |
      //                          ----------*
      //                           xOffset>  \
      //                             				  \
      //                             		  	   \ dx>
      //                             		dy	    \
      //                            		|        \
      //                             		v         \
      //                             					     \
      //
      //  example above is an attachmentDisplay specifying an edge that emanates down and to the right
      //  at a 45 deg. angle (1, 1), offset right 5 x units and down 11 y units from the center (0.5)
      //  of the bottom side (1) of the node: {position: [0.75, 1], offset: [5, 11], orientation: [1, 1]}
      //
      //
      // where x is distance from left side along width axis as a percentage of the total width
      //       y is distance from top side along height axis as a percentage of the total height
      //       offsetX, offsetY are obvious from the name. Notice they are absolute, unlike x,y.
      //       dx, dy are unit vector coordinates of a point that specifies how the edge emanates from the node

      // NOTE: section below only runs for points that are not attached to edges
      if (
        entityIdReferencedByEdgeIsPvjsonNode(
          entityReferencedByEdge,
          entityReferencedByPoint
        )
      ) {
        const dataPositionAndOrientationX = getDataPositionAndOrientationMapping(
          RelX,
          "RelX",
          entityReferencedByEdge
        );
        explicitPoint.attachmentDisplay =
          explicitPoint.attachmentDisplay || ({} as AttachmentDisplay);
        if (
          !!dataPositionAndOrientationX &&
          isNumber(dataPositionAndOrientationX.position)
        ) {
          explicitPoint.attachmentDisplay.position =
            explicitPoint.attachmentDisplay.position || [];
          explicitPoint.attachmentDisplay.position[0] =
            dataPositionAndOrientationX.position;
          if (
            dataPositionAndOrientationX.hasOwnProperty("orientation") &&
            isNumber(dataPositionAndOrientationX.orientation)
          ) {
            explicitPoint.attachmentDisplay.orientation =
              explicitPoint.attachmentDisplay.orientation ||
              ([] as [number, number]);
            explicitPoint.attachmentDisplay.orientation[0] =
              dataPositionAndOrientationX.orientation;
          }
          if (dataPositionAndOrientationX.hasOwnProperty("offset")) {
            explicitPoint.attachmentDisplay.offset =
              explicitPoint.attachmentDisplay.offset ||
              ([] as [number, number]);
            // TODO in the case of a group as the referenced entity,
            // we don't have the group width and height yet to properly calculate this
            explicitPoint.attachmentDisplay.offset[0] =
              dataPositionAndOrientationX.offset;
          }
        }

        const dataPositionAndOrientationY = getDataPositionAndOrientationMapping(
          RelY,
          "RelY",
          entityReferencedByEdge
        );
        explicitPoint.attachmentDisplay =
          explicitPoint.attachmentDisplay || ({} as AttachmentDisplay);
        if (
          !!dataPositionAndOrientationY &&
          isNumber(dataPositionAndOrientationY.position)
        ) {
          explicitPoint.attachmentDisplay.position =
            explicitPoint.attachmentDisplay.position || [];
          explicitPoint.attachmentDisplay.position[1] =
            dataPositionAndOrientationY.position;
          if (
            dataPositionAndOrientationY.hasOwnProperty("orientation") &&
            isNumber(dataPositionAndOrientationY.orientation)
          ) {
            explicitPoint.attachmentDisplay.orientation =
              explicitPoint.attachmentDisplay.orientation ||
              ([] as [number, number]);
            explicitPoint.attachmentDisplay.orientation[1] =
              dataPositionAndOrientationY.orientation;
          }
          if (dataPositionAndOrientationY.hasOwnProperty("offset")) {
            explicitPoint.attachmentDisplay.offset =
              explicitPoint.attachmentDisplay.offset ||
              ([] as [number, number]);
            // TODO in the case of a group as the referenced entity,
            // we don't have the group width and height yet to properly calculate this

            // NOTE: we set the X offset to zero if it doesn't exist so that we don't have null values in the array.
            explicitPoint.attachmentDisplay.offset[0] =
              explicitPoint.attachmentDisplay.offset[0] || 0;
            explicitPoint.attachmentDisplay.offset[1] =
              dataPositionAndOrientationY.offset;
          }
        }
      }
    }

    // NOTE: side effect
    index += 1;
    return explicitPoint;
  }, points);

  let pvjsonPoints;
  if (drawAs === "StraightLine") {
    if (explicitPoints.length > 2) {
      console.warn("Too many points for a straight line!");
    }
    pvjsonPoints = explicitPoints;
  } else if (drawAs === "SegmentedLine") {
    pvjsonPoints = explicitPoints;
  } else {
    // pvjsonEdge.isAttachedTo refers to what the EDGE is fundamentally attached to.
    // pvjsonEdge.points[0].isAttachedTo refers to what the POINT is attached to.
    //
    // From the perspective of the biological meaning, the edge is always attached to
    // a regular node like a DataNode or Shape (maybe Label?) but never to an Anchor.
    //
    // From the perspective of the implementation of the graphics, we say the edge
    // has points, one or more of which can be connected to an Anchor.
    const [sourceEntity, targetEntity] = pvjsonEdge.isAttachedTo.map(
      id => referencedEntities[id]
    );
    if (drawAs === "ElbowLine") {
      pvjsonPoints = calculateImplicitPoints(
        explicitPoints,
        sourceEntity,
        targetEntity
      );
    } else if (drawAs === "CurvedLine") {
      pvjsonPoints = calculateImplicitPoints(
        explicitPoints,
        sourceEntity,
        targetEntity
      );
    } else {
      console.warn("Unknown edge drawAs: " + drawAs);
    }
  }

  // TODO how do we distinguish between intermediate (not first or last) points that a user
  // has explicitly specified vs. intermediate points that are only implied?
  // Do we need to? GPML currently does not specify implicit intermediate points, but
  // pvjson does.

  pvjsonEdge.points = pvjsonPoints;

  return pvjsonEdge;
}

/**
 * sameSide
 *
 * @param {Object} p1 - first point of the referenced edge
 * @param {Object} p2 - last point of the referenced edge
 * @param {Object} a - last point of the first segment of the current edge (the point following the start point)
 * @param {Object} b - point where the current edge ends
 * @return {Boolean) - whether the last point of the first segment of the current edge is on the same side as the last point of the current edge
 */
function sameSide(p1: Point, p2: Point, a: Point, b: Point): boolean {
  var bMinusA: [number, number] = [b.x - a.x, b.y - a.y];
  var p1MinusA: [number, number] = [p1.x - a.x, p1.y - a.y];
  var p2MinusA: [number, number] = [p2.x - a.x, p2.y - a.y];
  var crossProduct1 = crossProduct(bMinusA, p1MinusA);
  var crossProduct2 = crossProduct(bMinusA, p2MinusA);
  var result = sign(crossProduct1) === sign(crossProduct2);
  return result;
}

function sign(u: number): boolean {
  return u >= 0;
}

// TODO handle recursive hyperedges better. What we have here
// is a kludge that generally seems to work.
// In general, study how to handle entities whose positions are
// recursively dependent, such as as combination of groups,
// hyperedges, etc.
export function createEdgeTransformStream(
  processor,
  edgeType: "Interaction" | "GraphicalLine"
): (
  s: Highland.Stream<GPML2013a.InteractionType | GPML2013a.GraphicalLineType>
) => Highland.Stream<{
  edge: PvjsonEdge;
  anchors: PvjsonNode[];
}> {
  return function(s) {
    return s
      .sortBy(function(InteractionA, InteractionB) {
        const AHasAnchor = InteractionA.Graphics.hasOwnProperty("Anchor");
        const BHasAnchor = InteractionB.Graphics.hasOwnProperty("Anchor");
        if (AHasAnchor && !BHasAnchor) {
          return -1;
        } else if (!AHasAnchor && BHasAnchor) {
          return 1;
        } else {
          return 0;
        }
      })
      .batch(HYPEREDGE_RECURSION_LIMIT)
      .flatMap(function(
        InteractionBatch
      ): Highland.Stream<{
        edge: PvjsonEdge;
        anchors: PvjsonNode[];
      }> {
        return hl(
          InteractionBatch.map(function(gpmlEdge) {
            const { Graphics } = gpmlEdge;
            const graphRefIds: string[] = Graphics.Point
              .filter(P => isString(P.GraphRef))
              .map(P => P.GraphRef);
            return (graphRefIds.length > 0
              ? hl(graphRefIds)
                  .flatMap(function(graphRefId) {
                    return hl(
                      processor.getByGraphId(graphRefId)
                    ).flatMap(function(referencedEntity: PvjsonEntity) {
                      const referencedEntityStream = hl([referencedEntity]);
                      return referencedEntity.type.indexOf("Anchor") === -1
                        ? referencedEntityStream
                        : hl([
                            referencedEntityStream,
                            hl(
                              processor.getByGraphId(
                                referencedEntity.isAttachedTo
                              )
                            )
                          ]).merge();
                    });
                  })
                  .reduce({}, function(
                    acc: {
                      [key: string]: PvjsonEntity;
                    },
                    referencedEntity: PvjsonEntity
                  ) {
                    acc[referencedEntity.id] = referencedEntity;
                    return acc;
                  })
              : hl([{}])).map(function(referencedEntities: {
              [key: string]: PvjsonEntity;
            }) {
              const processed = process(
                processor.process(edgeType, gpmlEdge),
                referencedEntities
              );

              const gpmlAnchors =
                gpmlEdge.Graphics.hasOwnProperty("Anchor") &&
                gpmlEdge.Graphics.Anchor;
              const pvjsonAnchors = [];
              if (
                !!gpmlAnchors &&
                !!gpmlAnchors[0] &&
                gpmlAnchors[0]._exists !== false
              ) {
                gpmlAnchors.forEach(function(gpmlAnchor) {
                  const pvjsonAnchor = processor.process("Anchor", gpmlAnchor);
                  pvjsonAnchor.isAttachedTo = processed.id;
                  pvjsonAnchor.type.push("Burr");
                  const drawAnchorAs = pvjsonAnchor.drawAs;
                  if (drawAnchorAs === "None") {
                    defaultsDeep(pvjsonAnchor, {
                      Height: 4,
                      Width: 4
                    });
                  } else if (drawAnchorAs === "Circle") {
                    defaultsDeep(pvjsonAnchor, {
                      Height: 8,
                      Width: 8
                    });
                  }
                  pvjsonAnchors.push(pvjsonAnchor);
                });
              }

              // TODO where is this property being added?
              delete processed["undefined"];

              return {
                edge: processed,
                anchors: pvjsonAnchors
              };
            });
          })
        ).merge();
      });
  };
}
