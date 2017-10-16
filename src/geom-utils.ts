/*
 * I need to do the following:
 * diff angles between vectors
 * find perpendicular vector to a point on a path
 * find tangent to a point on a path
 * transform (translate, rotate) for nodes and edges
 * es modules so I can pull out just what I need
 *
 * Specs to compare:
 * tests
 * typescript
 * maintained (open issues unresolved for a long time?)
 * node and browser
*/

import { assign as assignM } from "lodash";
import { fromPairs, isFinite, isUndefined, last, toPairs } from "lodash/fp";
import * as Vector from "vectory";
import {
  degreesToRadians,
  distance,
  fromSlope,
  normalize
} from "./spinoffs/Angle";
import { position } from "points";
// TODO why doesn't the following work?
// Also, why doesn't ../node_modules/kaavio/lib/drawers/edges/ exist?
//import * as edgeDrawers from "kaavio/src/drawers/edges/index";
import * as edgeDrawers from "../node_modules/kaavio/src/drawers/edges/index";
import {
  Point,
  PvjsonNode,
  AttachablePoint,
  Orientation,
  PvjsonEdge,
  StartSegmentDetailsMap,
  Side
} from "./gpml2pvjson";

// We are using the standard SVG coordinate system where:
//   the origin is the upper-left-most point
//   positive x is to the right
//   positive y is down
//   uses left hand rule, so positive angle is clockwise,
//     starting with 0 pointing to the right

// The orientation is a unit vector that indicates the orientation of an
// at a point. When it is attached to a rectangle, we almost always want it to
// point away from the side to which it is attached.
export const START_SIDE_TO_ORIENTATION_MAP = {
  right: [1, 0],
  bottom: [0, 1],
  left: [-1, 0],
  top: [0, -1]
};

export const START_SIDE_TO_EMANATION_ANGLE_MAPPINGS = fromPairs(
  toPairs(START_SIDE_TO_ORIENTATION_MAP).map(function(
    [startSide, orientation]
  ) {
    return [startSide, fromSlope([0, 0], orientation)];
  })
);

export const EMANATION_ANGLE_TO_START_SIDE_MAPPINGS = toPairs(
  START_SIDE_TO_EMANATION_ANGLE_MAPPINGS
).reduce(function(acc, [side, angle]) {
  acc.set(angle, side);
  return acc;
}, new Map());

export const START_SEGMENT_DETAILS_MAPS: StartSegmentDetailsMap[] = toPairs(
  START_SIDE_TO_ORIENTATION_MAP
).map(function([startSide, orientation]) {
  const [orientationX, orientationY] = orientation;
  return {
    sideAttachedTo: startSide,
    orientation: orientation,
    angle: normalize(Math.atan2(orientationY, orientationX))
  };
});

export interface ISmartPoint {
  x: number;
  y: number;
  curve?: any;
  moveTo?: any;
  orientation?: Orientation;
}

export class SmartPoint implements ISmartPoint {
  x: number;
  y: number;
  curve?: any;
  moveTo?: any;
  orientation?: Orientation;
  //orientationVector?: SmartVector;
  constructor(point: ISmartPoint) {
    assignM(this, point);
    /*
    if (!isUndefined(this.orientation)) {
      this.orientationVector = new SmartVector(
        { x: 0, y: 0 },
        { x: this.orientation[0], y: this.orientation[1] }
      );
    }
		//*/
  }
  angle = () => {
    return fromSlope([0, 0], this.orientation);
  };
  fromArray = ([x, y]: [number, number]) => {
    this.x = x;
    this.y = y;
  };
  toArray = () => {
    return [this.x, this.y];
  };
}

export class SmartVector {
  angle: number; // radians
  p0: SmartPoint;
  p1: SmartPoint;
  constructor(p0: ISmartPoint, p1: ISmartPoint) {
    this.p0 = new SmartPoint(p0);
    this.p1 = new SmartPoint(p1);
    this.angle = fromSlope(this.p0.toArray(), this.p1.toArray());
  }
  angleDistance = vector2 => {
    return distance(this.angle, vector2.angle);
  };
}

export class SmartPath {
  points: SmartPoint[];
  sum: SmartVector;
  path: any;
  constructor(points: ISmartPoint[], edge?) {
    const smartPoints = points.map(point => new SmartPoint(point));
    this.points = smartPoints;
    this.sum = new SmartVector(smartPoints[0], last(smartPoints));

    if (!isUndefined(edge)) {
      const { points, markerStart, markerEnd } = edge;
      this.path = new edgeDrawers[edge.drawAs](
        smartPoints,
        markerStart,
        markerEnd
      );
    }
  }
  position = (scalar: number, accuracy?: number) => {
    const { x, y, angle: degreesFromNorth } = position(
      this.path.points,
      scalar,
      accuracy
    );
    /* the points library returns the angle from north, in degrees, increasing CW, so
		 * this has an angle of 0 deg.:
		 * 
		 *       ^
		 *       |
		 *       |
		 *       |
		 * 
		 * and this has an angle of 90 deg.:
		 *
		 *    ------->
		 */
    return {
      x,
      y,
      // convert to radians and use angle orientation of SVG coordinate system
      angle: normalize(degreesToRadians(degreesFromNorth + 270))
    };
  };
}

// TODO explore using the packages points and angles (and maybe vectory) together
const smartPath1 = new SmartPath([
  { x: 50, y: 30, moveTo: true },
  { x: 50, y: 70, curve: { type: "arc", rx: 20, ry: 20, sweepFlag: 1 } },
  { x: 150, y: 100, curve: { type: "arc", rx: 20, ry: 20, sweepFlag: 1 } }
]);

const smartPath2 = new SmartPath([
  { x: 100, y: 50, moveTo: true },
  { x: 50, y: 70, curve: { type: "arc", rx: 20, ry: 20, sweepFlag: 1 } }
  //{ x: 200, y: 100 }
]);

/* OLD CODE BELOW */

export function addAngles(angle1: number, angle2: number): number {
  const sum = angle1 + angle2;
  const singleRevolutionSum = sum % (2 * Math.PI);
  return Math.sign(singleRevolutionSum) === -1
    ? 2 * Math.PI + singleRevolutionSum
    : singleRevolutionSum;
}

// see https://gist.github.com/ahwolf/4349166 and
// http://www.blackpawn.com/texts/pointinpoly/default.html
export function crossProduct(u: [number, number], v: [number, number]): number {
  return u[0] * v[1] - v[0] * u[1];
}

export function flipOrientation(orientation: Orientation) {
  return orientation.map(orientationScalar => -1 * orientationScalar);
}

export function flipSide(side: Side): Side {
  return EMANATION_ANGLE_TO_START_SIDE_MAPPINGS.get(
    reverseAngle(START_SIDE_TO_EMANATION_ANGLE_MAPPINGS[side])
  );
}

export function getMinimumAngleBetweenVectors(
  vectorDirectionAngle1: number,
  vectorDirectionAngle2: number
): number {
  const vectors = [vectorDirectionAngle1, vectorDirectionAngle2];
  const minVector = Math.min.apply(undefined, vectors);
  const maxVector = Math.max.apply(undefined, vectors);
  if (minVector < 0 || maxVector >= 2 * Math.PI) {
    throw new Error(
      `getMinimumAngleBetweenVectors(${vectorDirectionAngle1}, ${vectorDirectionAngle2})
										inputs must be in interval [0, 2 * Math.PI).`
    );
  }
  return (
    Math.max(vectorDirectionAngle1, vectorDirectionAngle2) -
    Math.min(vectorDirectionAngle1, vectorDirectionAngle2)
  );
  /*
  const diff = addAngles(vectorDirectionAngle1, -1 * vectorDirectionAngle2);
	return diff <= Math.PI ? diff : diff % Math.PI;
	//*/
  //return diff > Math.PI ? diff - Math.PI : diff;
}

export function getAngleOfEmanationFromPoint(point: AttachablePoint): number {
  const [orientationX, orientationY] = point.orientation;
  return Math.atan2(orientationY, orientationX);
}

export function reverseAngle(angle) {
  return addAngles(angle, Math.PI);
}

export function getAngleAtPoint(edge: PvjsonEdge, positionX: number): number {
  const { id, points, markerStart, markerEnd } = edge;

  const referencedPath = new edgeDrawers[(edge.drawAs.toLowerCase())](
    points,
    markerStart,
    markerEnd
  );

  const tangentLength = 0.02;

  const firstPointOfTangent = referencedPath.getPointAtPosition(
    Math.max(0, positionX - tangentLength / 2)
  );

  const lastPointOfTangent = referencedPath.getPointAtPosition(
    Math.min(1, positionX + tangentLength / 2)
  );

  return getAngleFromPointToPoint(firstPointOfTangent, lastPointOfTangent);
}

export function getAngleFromPointToPoint({ x: x0, y: y0 }, { x: x1, y: y1 }) {
  return Math.atan2(y1 - y0, x1 - x0);
}

export function getStartSideByOrientation(
  [orientationX, orientationY]: Orientation
): Side {
  if (Math.abs(orientationX) > Math.abs(orientationY)) {
    if (orientationX > 0) {
      return "right"; //East
    } else {
      return "left"; //West
    }
  } else {
    if (orientationY > 0) {
      return "bottom"; //South
    } else {
      return "top"; //North
    }
  }
}

// see http://blog.acipo.com/matrix-inversion-in-javascript/
/**
 * Calculate the inverse matrix.
 * @returns {Matrix}
 */
export function invertMatrix(M) {
  // I use Guassian Elimination to calculate the inverse:
  // (1) 'augment' the matrix (left) by the identity (on the right)
  // (2) Turn the matrix on the left into the identity by elemetry row ops
  // (3) The matrix on the right is the inverse (was the identity matrix)
  // There are 3 elemtary row ops: (I combine b and c in my code)
  // (a) Swap 2 rows
  // (b) Multiply a row by a scalar
  // (c) Add 2 rows

  //if the matrix isn't square: exit (error)
  if (M.length !== M[0].length) {
    return;
  }

  //create the identity matrix (I), and a copy (C) of the original
  var i = 0,
    ii = 0,
    j = 0,
    dim = M.length,
    e = 0,
    t = 0;
  var I = [],
    C = [];
  for (i = 0; i < dim; i += 1) {
    // Create the row
    I[I.length] = [];
    C[C.length] = [];
    for (j = 0; j < dim; j += 1) {
      //if we're on the diagonal, put a 1 (for identity)
      if (i === j) {
        I[i][j] = 1;
      } else {
        I[i][j] = 0;
      }

      // Also, make the copy of the original
      C[i][j] = M[i][j];
    }
  }

  // Perform elementary row operations
  for (i = 0; i < dim; i += 1) {
    // get the element e on the diagonal
    e = C[i][i];

    // if we have a 0 on the diagonal (we'll need to swap with a lower row)
    if (e === 0) {
      //look through every row below the i'th row
      for (ii = i + 1; ii < dim; ii += 1) {
        //if the ii'th row has a non-0 in the i'th col
        if (C[ii][i] !== 0) {
          //it would make the diagonal have a non-0 so swap it
          for (j = 0; j < dim; j++) {
            e = C[i][j]; //temp store i'th row
            C[i][j] = C[ii][j]; //replace i'th row by ii'th
            C[ii][j] = e; //repace ii'th by temp
            e = I[i][j]; //temp store i'th row
            I[i][j] = I[ii][j]; //replace i'th row by ii'th
            I[ii][j] = e; //repace ii'th by temp
          }
          //don't bother checking other rows since we've swapped
          break;
        }
      }
      //get the new diagonal
      e = C[i][i];
      //if it's still 0, not invertable (error)
      if (e === 0) {
        return;
      }
    }

    // Scale this row down by e (so we have a 1 on the diagonal)
    for (j = 0; j < dim; j++) {
      C[i][j] = C[i][j] / e; //apply to original matrix
      I[i][j] = I[i][j] / e; //apply to identity
    }

    // Subtract this row (scaled appropriately for each row) from ALL of
    // the other rows so that there will be 0's in this column in the
    // rows above and below this one
    for (ii = 0; ii < dim; ii++) {
      // Only apply to other rows (we want a 1 on the diagonal)
      if (ii === i) {
        continue;
      }

      // We want to change this element to 0
      e = C[ii][i];

      // Subtract (the row above(or below) scaled by e) from (the
      // current row) but start at the i'th column and assume all the
      // stuff left of diagonal is 0 (which it should be if we made this
      // algorithm correctly)
      for (j = 0; j < dim; j++) {
        C[ii][j] -= e * C[i][j]; //apply to original matrix
        I[ii][j] -= e * I[i][j]; //apply to identity
      }
    }
  }

  //we've done all operations, C should be the identity
  //matrix I should be the inverse:
  return I;
}
// from http://tech.pro/tutorial/1527/matrix-multiplication-in-functional-javascript
export function multiplyMatrices(m1, m2) {
  var result = [];
  for (var i = 0; i < m1.length; i++) {
    result[i] = [];
    for (var j = 0; j < m2[0].length; j++) {
      var sum = 0;
      for (var k = 0; k < m1[0].length; k++) {
        sum += m1[i][k] * m2[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

/**
 * rotate
 *
 * @param theta (float): rotation angle in radians, measured clockwise
 * @return transformation matrix for rotation
 *
 * Note that for Canvas and SVG, the y axis points down:
 *
 *  *---------> x
 *  |
 *  |
 *  |
 *  v
 *
 *  y
 *
 * The transformation matrix returned takes this into account and is intentionally
 * different from the transformation matrix that would be returned if the y-axis
 * pointed up, as is common in many math classes.
 */
export function rotate(
  theta: number
): [[number, number, 0], [number, number, 0], [0, 0, 1]] {
  if (!isFinite(theta)) {
    throw new Error(
      `Invalid input: rotate(${theta}). Requires a finite number.`
    );
  }
  return [
    [Math.cos(theta), -1 * Math.sin(theta), 0],
    [Math.sin(theta), Math.cos(theta), 0],
    [0, 0, 1]
  ];
}

export function scale(
  [xScale, yScale]: [number, number]
): [[number, 0, 0], [0, number, 0], [0, 0, 1]] {
  if (!isFinite(xScale) || !isFinite(yScale)) {
    throw new Error(
      `Invalid input: rotate([${xScale}, ${yScale}]). Requires array of two finite numbers.`
    );
  }
  return [[xScale, 0, 0], [0, yScale, 0], [0, 0, 1]];
}

export function translate(
  [xTranslation, yTranslation]: [number, number]
): [[1, 0, number], [0, 1, number], [0, 0, 1]] {
  if (!isFinite(xTranslation) || !isFinite(yTranslation)) {
    throw new Error(
      `Invalid input: translate([${xTranslation}, ${yTranslation}]). Requires array of two finite numbers.`
    );
  }
  return [[1, 0, xTranslation], [0, 1, yTranslation], [0, 0, 1]];
}

const transformations = {
  rotate,
  scale,
  translate
};

export function getTransformationMatrix(transformationSequence) {
  // Start with identity matrix
  var concatenatedTransformationMatrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  transformationSequence.forEach(function(transformation) {
    var thisTransformationMatrix = transformations[transformation.key](
      transformation.value
    );
    concatenatedTransformationMatrix = multiplyMatrices(
      concatenatedTransformationMatrix,
      thisTransformationMatrix
    );
  });

  return concatenatedTransformationMatrix;
}

export function multiplyMatrixByVector(transformationMatrix, vector) {
  var x =
    vector[0][0] * transformationMatrix[0][0] +
    vector[1][0] * transformationMatrix[0][1] +
    vector[2][0] * transformationMatrix[0][2],
    y =
      vector[0][0] * transformationMatrix[1][0] +
      vector[1][0] * transformationMatrix[1][1] +
      vector[2][0] * transformationMatrix[1][2],
    z =
      vector[0][0] * transformationMatrix[2][0] +
      vector[1][0] * transformationMatrix[2][1] +
      vector[2][0] * transformationMatrix[2][2];

  return [[x], [y], [z]];
}

/**
 * sameSide
 *
 * Calculate whether the current edge's second point, a, (end of first segment)
 * and its final point, b, are both on the same side of the referenced edge.
 *
 * current edge: pipes/hyphens
 * referenced edge: dots
 *
 * Example of True
 *
 *  p1
 *    .
 *     .
 *      *------------a
 *       .           |
 *        .          |
 *         .         |
 *          .        |
 *           .       |
 *            .      |
 *             .     |
 *              .    |
 *               .   |
 *                .  |
 *                 . *-----b
 *                  .
 *                   .
 *                    p2
 *
 * 
 * Example of False
 *
 *  p1
 *    .
 *      *------------a
 *        .          |
 *          .        |
 *            .      |
 *              .    |
 *                .  |
 *                  .|
 *                   |.
 *                   |  .
 *                   |    .
 *                   |      .
 *                   *-----b  .
 *                              .
 *                                p2
 *
 *
 * @param {Object} p1 - first point of the referenced edge
 * @param {Object} p2 - last point of the referenced edge
 * @param {Object} a - last point of the first segment of the current edge (the point following the start point)
 * @param {Object} b - point where the current edge ends
 * @return {Boolean) - whether the last point of the first segment of the current edge is on the same side as the last point of the current edge
 */
export function sameSide(p1: Point, p2: Point, a: Point, b: Point): boolean {
  const bMinusA: [number, number] = [b.x - a.x, b.y - a.y];
  const p1MinusA: [number, number] = [p1.x - a.x, p1.y - a.y];
  const p2MinusA: [number, number] = [p2.x - a.x, p2.y - a.y];
  const crossProduct1 = crossProduct(bMinusA, p1MinusA);
  const crossProduct2 = crossProduct(bMinusA, p2MinusA);
  return Math.sign(crossProduct1) === Math.sign(crossProduct2);
}

export function transform({
  element,
  transformOrigin,
  transformationSequence
}: {
  element: PvjsonNode;
  transformOrigin?: string;
  transformationSequence?: any[];
}): PvjsonNode {
  const { x, y, width, height } = element;
  (transformOrigin = transformOrigin || "50% 50%"), (transformationSequence =
    transformationSequence || []);

  var transformOriginKeywordMappings = {
    left: "0%",
    center: "50%",
    right: "100%",
    top: "0%",
    bottom: "100%"
  };

  var transformOriginKeywordMappingsKeys = Object.keys(
    transformOriginKeywordMappings
  );

  var transformOriginPoint = transformOrigin
    .split(" ")
    .map(function(value: string, i: number): number {
      let numericOrPctValue;
      let numericValue;
      if (transformOriginKeywordMappingsKeys.indexOf(value) > -1) {
        numericOrPctValue = transformOriginKeywordMappings[value];
      } else {
        numericOrPctValue = value;
      }
      if (numericOrPctValue.indexOf("%") > -1) {
        var decimalPercent = parseFloat(numericOrPctValue) / 100;
        if (i === 0) {
          numericValue = decimalPercent * width;
        } else {
          numericValue = decimalPercent * height;
        }
      } else if (value.indexOf("em") > -1) {
        // TODO refactor. this is hacky.
        numericValue = parseFloat(numericOrPctValue) * 12;
      } else {
        numericValue = parseFloat(numericOrPctValue);
      }

      if (i === 0) {
        numericValue += x;
      } else {
        numericValue += y;
      }
      return numericValue;
    });

  // shift origin from top left corner of element bounding box to point specified by transformOrigin (default: center of bounding box)
  transformationSequence.unshift({
    key: "translate",
    value: [transformOriginPoint[0], transformOriginPoint[1]]
  });

  // shift origin back to top left corner of element bounding box
  transformationSequence.push({
    key: "translate",
    value: [-1 * transformOriginPoint[0], -1 * transformOriginPoint[1]]
  });

  var transformationMatrix = getTransformationMatrix(transformationSequence);

  var topLeftPoint = [[x], [y], [1]];
  var bottomRightPoint = [[x + width], [y + height], [1]];

  var topLeftPointTransformed = multiplyMatrixByVector(
    transformationMatrix,
    topLeftPoint
  );

  var bottomRightPointTransformed = multiplyMatrixByVector(
    transformationMatrix,
    bottomRightPoint
  );

  element.x = topLeftPointTransformed[0][0];
  element.y = topLeftPointTransformed[1][0];
  element.width = bottomRightPointTransformed[0][0] - element.x;
  element.height = bottomRightPointTransformed[1][0] - element.y;

  return element;
}
