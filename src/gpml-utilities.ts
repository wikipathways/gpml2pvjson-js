import {
  flatten,
  intersection,
  isArray,
  isEmpty,
  keys,
  map,
  union
} from "lodash";

/*
 * This is needed because PublicationXref rdf:id values and
 * GPML GraphId values are not necessarily mutually exclusive
 * and unique within a given pathway.
 * For example, WP306, version 80308, has rdf:id="d8a" and
 * a DataNode with GraphId="d8a".
 */
export function generatePublicationXrefId(originalId: string) {
  return "PublicationXref" + originalId;
}

/* LSV means JSON-LD @list or @set values
 */
export function arrayify<T>(
  input: (T & jsonldListSetPrimitive) | (T[] & jsonldListSetPrimitive[])
): T[] {
  if (typeof input === "undefined") {
    return [];
  }
  return isArray(input) ? input : [input];
}

export function isJsonldListSetPrimitive(x): boolean {
  const TYPE = typeof x;
  return (
    ["string", "number", "boolean"].indexOf(TYPE) > -1 ||
    x === null ||
    (TYPE !== "undefined" && x.hasOwnProperty("@value"))
  );
}

export function getValuesLSV(
  input: jsonldListSetValue
): jsonldListSetPrimitive[] {
  if (typeof input === "undefined") {
    return [];
  }
  return arrayify(input)
    .map(function(x) {
      return x && x.hasOwnProperty("@value") ? x["@value"] : x;
    })
    .filter(isJsonldListSetPrimitive);
}

export function intersectsLSV(
  x: jsonldListSetValue,
  y: jsonldListSetValue
): boolean {
  return !isEmpty(intersection(getValuesLSV(x), getValuesLSV(y)));
}

export function unionLSV(
  ...inputs: jsonldListSetValue[]
): jsonldListSetPrimitive[] {
  return union(flatten(inputs.map(getValuesLSV)));
}

export let supportedNamespaces = [
  "http://pathvisio.org/GPML/2013a",
  "http://genmapp.org/GPML/2010a",
  "http://genmapp.org/GPML/2008a",
  "http://genmapp.org/GPML/2007"
];

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
export function rotate(theta) {
  theta = typeof theta === "number" ? theta : 0;
  var matrix = [
    [Math.cos(theta), -1 * Math.sin(theta), 0],
    [Math.sin(theta), Math.cos(theta), 0],
    [0, 0, 1]
  ];
  return matrix;
}

export function scale(args) {
  var xScale = typeof args[0] === "number" ? args[0] : 1,
    yScale = typeof args[1] === "number" ? args[1] : xScale;

  return [[xScale, 0, 0], [0, yScale, 0], [0, 0, 1]];
}

let GpmlUtilities = this;

export function getTransformationMatrix(transformationSequence) {
  // Start with identity matrix
  var concatenatedTransformationMatrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  transformationSequence.forEach(function(transformation) {
    var thisTransformationMatrix = GpmlUtilities[transformation.key](
      transformation.value
    );
    concatenatedTransformationMatrix = multiplyMatrices(
      concatenatedTransformationMatrix,
      thisTransformationMatrix
    );
  });

  return concatenatedTransformationMatrix;
}

export function translate(args) {
  var xTranslation = typeof args[0] === "number" ? args[0] : 0,
    yTranslation = typeof args[1] === "number" ? args[1] : 0;

  return [[1, 0, xTranslation], [0, 1, yTranslation], [0, 0, 1]];
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

export function transform(args) {
  var element = args.element,
    x = element.x,
    y = element.y,
    width = element.width,
    height = element.height,
    transformOrigin = args.transformOrigin || "50% 50%",
    transformationSequence = args.transformationSequence || [];

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

  var i = 0;
  var transformOriginValues = [];
  var transformOriginPoint = transformOrigin.split(" ").map(function(value) {
    if (transformOriginKeywordMappingsKeys.indexOf(value) > -1) {
      value = transformOriginKeywordMappings[value];
    }
    if (value.indexOf("%") > -1) {
      var decimalPercent = parseFloat(value) / 100;
      if (i === 0) {
        value = decimalPercent * width;
      } else {
        value = decimalPercent * height;
      }
    } else if (value.indexOf("em") > -1) {
      // TODO refactor. this is hacky.
      value = parseFloat(value) * 12;
    } else {
      value = parseFloat(value);
    }
    transformOriginValues[i] = value;
    if (i === 0) {
      value += x;
    } else {
      value += y;
    }
    i += 1;
    return value;
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
