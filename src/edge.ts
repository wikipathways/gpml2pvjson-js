import { isNumber } from 'lodash';
import * as GpmlUtilities from './gpml-utilities';

// a stub is a short path segment that is used for the first and/or last segment(s) of a path
var defaultStubLength = 20;

interface DataPositionAndOrientationMapping {
	position: number;
	orientation: number;
	offset: number;
}

export function postProcess(data: Data, dataEdge: DataElement) {
	let pointElements = dataEdge['gpml:Point'];
	let point;
	let gpmlPoint;
	let explicitPoint;
	let dataPoint;
	let dataPoints;
	let explicitPoints = [];
	let dataX;
	let dataY;
	let parentElement;
	let dataMarker;
	let referencedElement;
	let referencedElementTag;
	let referencedElements = [];
	let referencedElementTags = [];

	pointElements.forEach(function(gpmlPoint, index, array) {
		explicitPoint = {};

		var attributeDependencyOrder = [
			'GraphRef',
			'RelX',
			'RelY',
			'X',
			'Y'
		];

		var gpmlToDataConverter = {
			X: function(gpmlXValue) {
				dataX = parseFloat(gpmlXValue);
				explicitPoint.x = dataX;
				return dataX;
			},
			Y: function(gpmlYValue) {
				dataY = parseFloat(gpmlYValue);
				explicitPoint.y = dataY;
				return dataY;
			},
			RelX: function(gpmlRelXValue) {
				// see jsPlumb anchor model: http://jsplumbtoolkit.com/doc/anchors
				// anchor: [ x, y, dx, dy ]
				// where x: distance from left side along width axis as a percentage of the total width
				//       y: distance from top side along height axis as a percentage of the total height
				//       dx, dy: coordinates of a point that specifies how the edge emanates from the node 
				// example: below is an anchor specifying an edge that emanates downward (0, 1) from the center (0.5) of the bottom side (1) of the node
				// anchor: [ 0.5, 1, 0, 1 ]
				//
				// this code only runs for points not attached to edges
				if (referencedElementTag !== 'Interaction' &&
						referencedElementTag !== 'GraphicalLine') {
					var gpmlRelXValueString = gpmlRelXValue.toString();
					var gpmlRelXValueInteger = parseFloat(gpmlRelXValue);
					var argsX = {
						relValue: gpmlRelXValueInteger,
						identifier: 'RelX',
						referencedElement: referencedElement,
						data: data
					};
					var dataPositionAndOrientationX = getDataPositionAndOrientationMapping(argsX);
					explicitPoint.anchor = explicitPoint.anchor || [];
					if (!!dataPositionAndOrientationX && isNumber(dataPositionAndOrientationX.position)) {
						explicitPoint.anchor[0] = dataPositionAndOrientationX.position;
						if (dataPositionAndOrientationX.hasOwnProperty('orientation') &&
								isNumber(dataPositionAndOrientationX.orientation)) {
							explicitPoint.anchor[2] = dataPositionAndOrientationX.orientation;
						} else {
						}
						if (dataPositionAndOrientationX.hasOwnProperty('offset')) {
							// TODO in the case of a group as the referenced element,
							// we don't have the group width and height yet to properly calculate this
							explicitPoint.anchor[4] = dataPositionAndOrientationX.offset || 20;
						}
					}
					return gpmlRelXValueInteger;
				}
			},
			RelY: function(gpmlRelYValue) {
				// see note at RelX
				// this code only runs for points not attached to edges
				if (referencedElementTag !== 'Interaction' &&
						referencedElementTag !== 'GraphicalLine') {
					var gpmlRelYValueString = gpmlRelYValue.toString();
					var gpmlRelYValueInteger = parseFloat(gpmlRelYValue);
					var argsY = {
						relValue: gpmlRelYValueInteger,
						identifier: 'RelY',
						referencedElement: referencedElement,
						data: data
					};
					var dataPositionAndOrientationY = getDataPositionAndOrientationMapping(argsY);
					// here we are referring to jsplumb anchor, not GPML Anchor
					explicitPoint.anchor = explicitPoint.anchor || [];
					if (!!dataPositionAndOrientationY && isNumber(dataPositionAndOrientationY.position)) {
						explicitPoint.anchor[1] = dataPositionAndOrientationY.position;
						if (dataPositionAndOrientationY.hasOwnProperty('orientation') &&
								isNumber(dataPositionAndOrientationY.orientation)) {
							explicitPoint.anchor[3] = dataPositionAndOrientationY.orientation;
						} else {
						}
						if (dataPositionAndOrientationY.hasOwnProperty('offset')) {
							// need to set the X offset to zero if it doesn't exist so that we don't have null values in the array.
							explicitPoint.anchor[4] = explicitPoint.anchor[4] || 0;
							// TODO in the case of a group as the referenced element, we don't have the group width and height yet to properly calculate this
							explicitPoint.anchor[5] = dataPositionAndOrientationY.offset || 15;
						}
					}
					return gpmlRelYValueInteger;
				}
			},
			GraphRef: function(gpmlGraphRefValue){
				var referencedNode = data.elementMap[gpmlGraphRefValue];
				var referencedNodeTag = referencedNode.gpmlElementName;

				// GPML and jsplumb/pvjson use different meaning and architecture for the term "anchor."
				// GPML uses anchor to refer to an actual element that specifies a position along an edge.
				// pvjson copies jsplumb in using anchor to refer to the location of the point in terms of another element.
				// When that other element is an edge, pvjson refers directly to the edge,
				// unlike GPML which refers to an element located at a position along the edge.
				// 
				// here we are referring to GPML Anchor, not jsplumb anchor.
				if (referencedNodeTag !== 'Anchor') {
					referencedElement = referencedNode;
					referencedElementTag = referencedNodeTag;
					// the id of the element this point is attached to (references)
					explicitPoint.isAttachedTo = gpmlGraphRefValue;
				} else {
					// here we are converting from GPML Anchor (an element representing a node on an edge) to jsplumb anchor (just a reference to a position along an edge)
					// since this jsplumb-anchor is specified relative to an edge, it only has one dimension (position along the edge),
					// unlike nodes, which can have two dimensions (along x dimension of node, along y dimension of node).
					// So for edges, anchor[0] refers to position along the edge and anchor[1] is a dummy value that is always 0.
					explicitPoint.anchor = explicitPoint.anchor || [];
					explicitPoint.anchor[0] = referencedNode.position;
					explicitPoint.anchor[1] = 0;  

					// the id of the edge (IMPORTANT NOTE: NOT the GPML Anchor!) that this pvjson point is attached to (references)
					var referencedEdgeId = referencedNode.isAttachedTo;
					var referencedEdge = data.elementMap[referencedEdgeId];
					referencedElement = referencedEdge;
					var referencedEdgeTag = referencedEdge.gpmlElementName;
					referencedElementTag = referencedEdgeTag;
					explicitPoint.isAttachedTo = referencedEdgeId;
				}
				referencedElements.push(referencedElement);
				referencedElementTags.push(referencedElementTag);
				return gpmlGraphRefValue;
			},
			ArrowHead: function(dataMarker) {
				if (index === 0) {
					dataEdge.markerStart = dataMarker;
				} else {
					dataEdge.markerEnd = dataMarker;
				}
				return dataMarker;
			}
		};
		explicitPoint = GpmlUtilities.convertAttributesToJson(
				gpmlPoint,
				explicitPoint,
				gpmlToDataConverter,
				attributeDependencyOrder
		);
		explicitPoints.push(explicitPoint);
	});


	var type = dataEdge.drawAs;

	if (type === 'StraightLine'){
		if (explicitPoints.length > 2) {
			console.warn('Too many points for a straight line!');
		}
		dataPoints = explicitPoints;
	} else if (type === 'SegmentedLine'){
		dataPoints = explicitPoints;
	} else if (type === 'ElbowLine'){
		dataPoints = calculateDataPoints(
				data,
				type,
				explicitPoints,
				referencedElements,
				referencedElementTags
		);
	} else if (type === 'CurvedLine'){
		dataPoints = calculateDataPoints(
				data,
				type,
				explicitPoints,
				referencedElements,
				referencedElementTags
		);
	} else {
		console.warn('Unknown connector type: ' + type);
	}

	// TODO how do we distinguish between intermediate (not first or last) points that a user
	// has explicitly specified vs. intermediate points that are only implied?
	// Do we need to? GPML currently does not specify implicit intermediate points, but
	// pvjson does.

	dataEdge.points = dataPoints;
	return dataEdge;
}

/**
 * calculateDataPoints
 *
 * @param data {Object}
 * @param edgeType {String}
 * @param explicitPoints {Array}
 * @param referencedElements {Array}
 * @param referencedElementTags {Array}
 * @return {Array} Set of points required to render the edge. Additional points are added if required to unambiguously specify an edge (implicit points are made explicit).
 */
function calculateDataPoints(
		data,
		edgeType,
		explicitPoints,
		referencedElements,
		referencedElementTags
): Point[] {
	var firstPoint = explicitPoints[0]
		, lastPoint = explicitPoints[explicitPoints.length - 1]
		, sideCombination
		, expectedPointCount
		// this stub is used to make the edge emanate away from the source (or target) node, even though that means initially moving away from the target (or source) node 
		, sidesToRouteAround
		;

	// if first and last points are attached to non-Anchor elements
	if (firstPoint.hasOwnProperty('anchor') &&
			isNumber(firstPoint.anchor[2]) &&
				isNumber(firstPoint.anchor[3]) &&
					lastPoint.hasOwnProperty('anchor') &&
						isNumber(lastPoint.anchor[2]) &&
							isNumber(lastPoint.anchor[3])) {
		sideCombination = getSideCombination(firstPoint, lastPoint);
	// if first point is attached to a non-Anchor element and last point is attached to an Anchor (not a group)
	} else if (firstPoint.hasOwnProperty('anchor') &&
						 isNumber(firstPoint.anchor[2]) &&
							 isNumber(firstPoint.anchor[3]) &&
								 lastPoint.hasOwnProperty('anchor')) {
		lastPoint = getSideEquivalentForLine(firstPoint, lastPoint, referencedElements[1], data);
		sideCombination = getSideCombination(firstPoint, lastPoint);
	// if last point is attached to a non-Anchor element and first point is attached to an Anchor (not a group)
	} else if (lastPoint.hasOwnProperty('anchor') &&
						 isNumber(lastPoint.anchor[2]) &&
							 isNumber(lastPoint.anchor[3]) &&
								 firstPoint.hasOwnProperty('anchor')) {
		firstPoint = getSideEquivalentForLine(lastPoint, firstPoint, referencedElements[0], data);
		sideCombination = getSideCombination(firstPoint, lastPoint);
	// if first and last points are attached to anchors
	} else if (firstPoint.hasOwnProperty('anchor') &&
						 lastPoint.hasOwnProperty('anchor')) {
		firstPoint = getSideEquivalentForLine(lastPoint, firstPoint, referencedElements[0], data);
		lastPoint = getSideEquivalentForLine(firstPoint, lastPoint, referencedElements[1], data);
		sideCombination = getSideCombination(firstPoint, lastPoint);
		/*
		// TODO change this to actually calculate the number
		sideCombination = {};
		sideCombination.expectedPointCount = 2;
		//*/
	// Note: each of the following options indicate an unconnected edge on one or both ends
	// We are not calculating the implicit points for these, because they are probably already in error.
	//
	// if first point is attached to an anchor and last point is unconnected
	} else if (firstPoint.hasOwnProperty('anchor')) {
		sideCombination = {};
		sideCombination.expectedPointCount = 2;
	// if last point is attached to an anchor and first point is unconnected
	} else if (lastPoint.hasOwnProperty('anchor')) {
		sideCombination = {};
		sideCombination.expectedPointCount = 2;
	// if both ends are unconnected
	} else {
		sideCombination = {};
		sideCombination.expectedPointCount = 2;
	}
	expectedPointCount = sideCombination.expectedPointCount;
	sidesToRouteAround = sideCombination.sidesToRouteAround;

	//check to see whether all implicit points are provided
	if (explicitPoints.length >= expectedPointCount) {
		return explicitPoints;
	} else {
		var directionIsVertical = (Math.abs(firstPoint.anchor[3]) === 1);

		// only used for curves
		var tension = 1;

		var dataPoints = [];

		//first data point is start point
		dataPoints[0] = firstPoint;


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
				dataPoints[1] = {};
				dataPoints[1].x = (firstPoint.x + lastPoint.x) / 2;
				if (sidesToRouteAround.length === 0) {
					//dataPoints[1].y = (firstPoint.y + lastPoint.y) / 2;
					// this stub is not required, but we're just somewhat arbitrarily using it because the pathway author did not specify where the midpoint of the second path segment should be
					dataPoints[1].y = firstPoint.y + firstPoint.anchor[3] * defaultStubLength;
				} else {
					if (firstPoint.anchor[3] > 0) {
						dataPoints[1].y = Math.max(firstPoint.y, lastPoint.y) + firstPoint.anchor[3] * defaultStubLength;
					} else {
						dataPoints[1].y = Math.min(firstPoint.y, lastPoint.y) + firstPoint.anchor[3] * defaultStubLength;
					}
				}
			} else {
				dataPoints[1] = {};
				if (sidesToRouteAround.length === 0) {
					//dataPoints[1].x = (firstPoint.x + lastPoint.x) / 2;
					// this stub is not required, but we're just somewhat arbitrarily using it because the pathway author did not specify where the midpoint of the second path segment should be
					dataPoints[1].x = firstPoint.x + firstPoint.anchor[2] * defaultStubLength;
				} else {
					if (firstPoint.anchor[2] > 0) {
						dataPoints[1].x = Math.max(firstPoint.x, lastPoint.x) + firstPoint.anchor[2] * defaultStubLength;
					} else {
						dataPoints[1].x = Math.min(firstPoint.x, lastPoint.x) + firstPoint.anchor[2] * defaultStubLength;
					}
				}
				dataPoints[1].y = (firstPoint.y + lastPoint.y) / 2;
			}

		} else if (expectedPointCount === 4){

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
				dataPoints[1] = {};
				dataPoints[1].x = (firstPoint.x + lastPoint.x + lastPoint.anchor[2] * defaultStubLength) / 2;
				if (sidesToRouteAround.indexOf('first') === -1) {
					dataPoints[1].y = firstPoint.y + firstPoint.anchor[3] * defaultStubLength;
				} else {
					if (firstPoint.anchor[3] > 0) {
						dataPoints[1].y = Math.max(firstPoint.y, lastPoint.y) + firstPoint.anchor[3] * defaultStubLength;
					} else {
						dataPoints[1].y = Math.min(firstPoint.y, lastPoint.y) + firstPoint.anchor[3] * defaultStubLength;
					}
				}
				dataPoints[2] = {};
				if (sidesToRouteAround.indexOf('last') === -1) {
					dataPoints[2].x = lastPoint.x + lastPoint.anchor[2] * defaultStubLength;
				} else {
					if (lastPoint.anchor[2] > 0) {
						dataPoints[2].x = Math.max(firstPoint.x, lastPoint.x) + lastPoint.anchor[2] * defaultStubLength;
					} else {
						dataPoints[2].x = Math.min(firstPoint.x, lastPoint.x) + lastPoint.anchor[2] * defaultStubLength;
					}
				}
				dataPoints[2].y = (dataPoints[1].y + lastPoint.y) / 2;
			} else {
				dataPoints[1] = {};
				dataPoints[1].x = firstPoint.x + firstPoint.anchor[2] * defaultStubLength;
				if (sidesToRouteAround.indexOf('first') === -1) {
					dataPoints[1].x = firstPoint.x + firstPoint.anchor[2] * defaultStubLength;
				} else {
					if (firstPoint.anchor[2] > 0) {
						dataPoints[1].x = Math.max(firstPoint.x, lastPoint.x) + firstPoint.anchor[2] * defaultStubLength;
					} else {
						dataPoints[1].x = Math.min(firstPoint.x, lastPoint.x) + firstPoint.anchor[2] * defaultStubLength;
					}
				}
				dataPoints[1].y = (firstPoint.y + lastPoint.y + lastPoint.anchor[3] * defaultStubLength) / 2;
				dataPoints[2] = {};
				dataPoints[2].x = (dataPoints[1].x + lastPoint.x) / 2;
				if (sidesToRouteAround.indexOf('last') === -1) {
					dataPoints[2].y = lastPoint.y + lastPoint.anchor[3] * defaultStubLength;
				} else {
					if (lastPoint.anchor[3] > 0) {
						dataPoints[2].y = Math.max(firstPoint.y, lastPoint.y) + lastPoint.anchor[3] * defaultStubLength;
					} else {
						dataPoints[2].y = Math.min(firstPoint.y, lastPoint.y) + lastPoint.anchor[3] * defaultStubLength;
					}
				}
			}
		} else if (expectedPointCount === 5){

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
				dataPoints[1] = {};
				dataPoints[1].x = ((lastPoint.x - firstPoint.x) / 4) + firstPoint.x;
				dataPoints[1].y = firstPoint.y + firstPoint.anchor[3] * defaultStubLength;
				dataPoints[2] = {};
				dataPoints[2].x = (firstPoint.x + lastPoint.x) / 2;
				dataPoints[2].y = (firstPoint.y + lastPoint.y) / 2;
				dataPoints[3] = {};
				dataPoints[3].x = ((lastPoint.x - firstPoint.x) * (3/4)) + firstPoint.x;
				dataPoints[3].y = lastPoint.y + lastPoint.anchor[3] * defaultStubLength;
			} else {
				dataPoints[1] = {};
				dataPoints[1].x = firstPoint.x + firstPoint.anchor[2] * defaultStubLength;
				dataPoints[1].y = ((lastPoint.y - firstPoint.y) / 4) + firstPoint.y;
				dataPoints[2] = {};
				dataPoints[2].x = (firstPoint.x + lastPoint.x) / 2;
				dataPoints[2].y = (firstPoint.y + lastPoint.y) / 2;
				dataPoints[3] = {};
				dataPoints[3].x = lastPoint.x + lastPoint.anchor[2] * defaultStubLength;
				dataPoints[3].y = ((lastPoint.y - firstPoint.y) * (3/4)) + firstPoint.y;
			}
		} else {
			throw new Error('Too many points expected.');
		}

		// last data point is end point
		dataPoints.push(lastPoint);

		return dataPoints;
	}
}

// see https://gist.github.com/ahwolf/4349166 and
// http://www.blackpawn.com/texts/pointinpoly/default.html
function crossProduct (u, v) {
	return u[0] * v[1] - v[0] * u[1];
}

function getDataPositionAndOrientationMapping(args): DataPositionAndOrientationMapping {
	var relValue = args.relValue
		, identifier = args.identifier
		, referencedElement = args.referencedElement
		;

	// orientation here refers to the initial direction the edge takes as it moves away from its attachment
	var result = <DataPositionAndOrientationMapping>{}, position, referencedElementDimension;

	var relativeToUpperLeftCorner = (relValue + 1) / 2;
	if (relativeToUpperLeftCorner < 0 || relativeToUpperLeftCorner > 1) {
		if (identifier === 'RelX') {
			referencedElementDimension = referencedElement.width || referencedElement.attributes.Width.value;
		} else {
			referencedElementDimension = referencedElement.height || referencedElement.attributes.Height.value;
		}
		if (relativeToUpperLeftCorner < 0) {
			position = 0;
			result.offset = relativeToUpperLeftCorner * referencedElementDimension;
		} else {
			position = 1;
			result.offset = (relativeToUpperLeftCorner - 1) * referencedElementDimension;
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
};

function sign(u) {
	return u>=0;
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
function sameSide(p1, p2, a, b) {
	var bMinusA = [b.x-a.x, b.y-a.y];
	var p1MinusA = [p1.x-a.x, p1.y-a.y];
	var p2MinusA = [p2.x-a.x, p2.y-a.y];
	var crossProduct1 = crossProduct(bMinusA, p1MinusA);
	var crossProduct2 = crossProduct(bMinusA, p2MinusA);
	var result = (sign(crossProduct1) === sign(crossProduct2));
	return result;
}

var getSideEquivalentForLine = function (pointOnShape, pointOnEdge, referencedEdge, data) {
	var riseFromPointOnEdgeToPointOnShape = pointOnShape.y - pointOnEdge.y;
	var runFromPointOnEdgeToPointOnShape = pointOnShape.x - pointOnEdge.x;
	var angleFromPointOnEdgeToPointOnShape = Math.atan2(riseFromPointOnEdgeToPointOnShape, runFromPointOnEdgeToPointOnShape);

	var angleOfReferencedEdge, referencedEdgePoints, firstPointOfReferencedEdge, lastPointOfReferencedEdge;

	if (!!referencedEdge) {
		// TODO handle case where referenced edge is not straight.
		// currently, the code below assumes the referenced edge is always straight, never elbowed or curved.
		// This would require being able to calculate a point at a distance along an elbow or curve.
		referencedEdgePoints = referencedEdge['gpml:Point'] || referencedEdge.points;

		firstPointOfReferencedEdge = referencedEdgePoints[0];

		firstPointOfReferencedEdge.x = parseFloat(firstPointOfReferencedEdge.x || firstPointOfReferencedEdge.attributes.X.value);
		firstPointOfReferencedEdge.y = parseFloat(firstPointOfReferencedEdge.y || firstPointOfReferencedEdge.attributes.Y.value);

		lastPointOfReferencedEdge = referencedEdgePoints[referencedEdgePoints.length - 1];
		lastPointOfReferencedEdge.x = parseFloat(lastPointOfReferencedEdge.x || lastPointOfReferencedEdge.attributes.X.value);
		lastPointOfReferencedEdge.y = parseFloat(lastPointOfReferencedEdge.y || lastPointOfReferencedEdge.attributes.Y.value);

		var riseOfReferencedEdge = lastPointOfReferencedEdge.y - firstPointOfReferencedEdge.y;
		var runOfReferencedEdge = lastPointOfReferencedEdge.x - firstPointOfReferencedEdge.x;

		angleOfReferencedEdge = Math.atan2(riseOfReferencedEdge, runOfReferencedEdge);
	}

	var firstSegmentOptions: SegmentOption[] = [{
		'side': 'top', 'orientationX': 0, 'orientationY': -1
	}, {
		'side': 'right', 'orientationX': 1, 'orientationY': 0
	}, {
		'side': 'bottom', 'orientationX': 0, 'orientationY': 1
	}, {
		'side': 'left', 'orientationX': -1, 'orientationY': 0
	}];

	var side
		, orientationX
		, orientationY
		, selectedFirstSegmentCalculation
		, minimumAngleBetweenFirstSegmentOptionsAndAnchoredEdge
		, firstSegmentCalculations = []
		;

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
		angleBetweenFirstSegmentOptionAndAnchoredEdge?: number;
		angleBetweenFirstSegmentOptionAndReferencedEdge?: number;
	}

	firstSegmentOptions.forEach(function(firstSegmentOption) {
		var angleOption = Math.atan2(firstSegmentOption.orientationY, firstSegmentOption.orientationX);
		var angleBetweenFirstSegmentOptionAndAnchoredEdge;

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
		firstSegmentEndPoint.x = pointOnEdge.x + defaultStubLength * firstSegmentOption.orientationX;
		firstSegmentEndPoint.y = pointOnEdge.y + defaultStubLength * firstSegmentOption.orientationY;
		if (!!referencedEdge && sameSide(firstPointOfReferencedEdge, lastPointOfReferencedEdge, firstSegmentEndPoint, pointOnShape)) {
			angleBetweenFirstSegmentOptionAndAnchoredEdge = Math.abs(angleOption - angleFromPointOnEdgeToPointOnShape);
			if (angleBetweenFirstSegmentOptionAndAnchoredEdge > Math.PI) {
				angleBetweenFirstSegmentOptionAndAnchoredEdge = 2 * Math.PI - angleBetweenFirstSegmentOptionAndAnchoredEdge;
			}

			var angleBetweenFirstSegmentOptionAndReferencedEdge = Math.abs(angleOfReferencedEdge - angleOption);
			if (angleBetweenFirstSegmentOptionAndReferencedEdge > Math.PI) {
				angleBetweenFirstSegmentOptionAndReferencedEdge = 2 * Math.PI - angleBetweenFirstSegmentOptionAndReferencedEdge;
			}

			firstSegmentOption.angle = angleOption;
			firstSegmentOption.angleBetweenFirstSegmentOptionAndAnchoredEdge = angleBetweenFirstSegmentOptionAndAnchoredEdge;
			firstSegmentOption.angleBetweenFirstSegmentOptionAndReferencedEdge = angleBetweenFirstSegmentOptionAndReferencedEdge;
			firstSegmentCalculations.push(firstSegmentOption);
		} else {
			angleBetweenFirstSegmentOptionAndAnchoredEdge = null;
		}
	});

	if (!!firstSegmentCalculations && firstSegmentCalculations.length > 0) {
		if (!!referencedEdge) {
			// note we don't currently have logic to correctly determine the angle of the referenced edge if it's not straight.
			// sort so that first segment option closest to perpendicular to referenced edge is first
			firstSegmentCalculations.sort(function(a, b) {
				return Math.abs(a.angleBetweenFirstSegmentOptionAndReferencedEdge - Math.PI/2) - Math.abs(b.angleBetweenFirstSegmentOptionAndReferencedEdge - Math.PI/2);
			});
		} else {
			// sort so that first segment option closest to anchored edge is first
			firstSegmentCalculations.sort(function(a, b) {
				return a.angleBetweenFirstSegmentOptionAndAnchoredEdge - b.angleBetweenFirstSegmentOptionAndAnchoredEdge;
			});
		}
		selectedFirstSegmentCalculation = firstSegmentCalculations[0];
	} else {
		console.warn('The pathway author appears to have specified that the edges should cross but did not specify how to do it, so we arbitrarily choose to emanate from the "top"');
		selectedFirstSegmentCalculation = firstSegmentOptions[0];
	}
	
	//pointOnEdge.anchor.push(0.5);
	//pointOnEdge.anchor.push(0.5);
	pointOnEdge.anchor.push(selectedFirstSegmentCalculation.orientationX);
	//pointOnEdge.anchor.push(0);
	pointOnEdge.anchor.push(selectedFirstSegmentCalculation.orientationY);
	//pointOnEdge.anchor.push(-1);

	return pointOnEdge;
};

function getSideCombination(firstPoint, lastPoint) {

	interface Combination {
		sideComparison: string;
		reroutingRequired: boolean;
		expectedPointCount: number;
		sidesToRouteAround?: any;
	}

	var combinations: Combination[] = [
		{ 'sideComparison': 'same', 'reroutingRequired': true, 'expectedPointCount': 3 },
		{ 'sideComparison': 'perpendicular', 'reroutingRequired': true, 'expectedPointCount': 4 },
		{ 'sideComparison': 'perpendicular', 'reroutingRequired': false, 'expectedPointCount': 2 },
		{ 'sideComparison': 'opposing', 'reroutingRequired': true, 'expectedPointCount': 5 },
		{ 'sideComparison': 'opposing', 'reroutingRequired': false, 'expectedPointCount': 3 }
	];
	var sides = getAndCompareSides(firstPoint, lastPoint);
	var sidesToRouteAround = getSidesToRouteAround(firstPoint, lastPoint, sides);
	var reroutingRequired = (sidesToRouteAround.length > 0);
	var sideCombination = combinations.filter(function(combination) {
		return combination.sideComparison === sides.comparison && combination.reroutingRequired === reroutingRequired;
	})[0];
	sideCombination.sidesToRouteAround = sidesToRouteAround;
	return sideCombination;
}

function getSidesToRouteAround(firstPoint, lastPoint, sides){
	var firstSideMustBeRoutedAround;
	var lastSideMustBeRoutedAround;
	var sidesToRouteAround = [];
	if (sides.comparison === 'same') {
		if (sides.first === 'top' || sides.first === 'bottom') {
			firstSideMustBeRoutedAround = (firstPoint.anchor[3] !== (lastPoint.y - firstPoint.y) / Math.abs(lastPoint.y - firstPoint.y));
			firstSideMustBeRoutedAround = !lastSideMustBeRoutedAround;
		} else {
			firstSideMustBeRoutedAround = (firstPoint.anchor[2] !== (lastPoint.x - firstPoint.x) / Math.abs(lastPoint.x - firstPoint.x));
			firstSideMustBeRoutedAround = !lastSideMustBeRoutedAround;
		}
	} else if (sides.comparison === 'opposing') {
		if (sides.first === 'top' || sides.first === 'bottom') {
			firstSideMustBeRoutedAround = lastSideMustBeRoutedAround = (firstPoint.anchor[3] !== (lastPoint.y - firstPoint.y) / Math.abs(lastPoint.y - firstPoint.y));
		} else {
			firstSideMustBeRoutedAround = lastSideMustBeRoutedAround = (firstPoint.anchor[2] !== (lastPoint.x - firstPoint.x) / Math.abs(lastPoint.x - firstPoint.x));
		}
	// if side comparison is not same or opposing, it must be perpendicular
	} else { 
		if (sides.first === 'top' || sides.first === 'bottom') {
			firstSideMustBeRoutedAround = firstPoint.anchor[3] !== (lastPoint.y - firstPoint.y) / Math.abs(lastPoint.y - firstPoint.y);
			lastSideMustBeRoutedAround = lastPoint.anchor[2] !== (firstPoint.x - lastPoint.x) / Math.abs(firstPoint.x - lastPoint.x);
		} else {
			firstSideMustBeRoutedAround = firstPoint.anchor[2] !== (lastPoint.x - firstPoint.x) / Math.abs(lastPoint.x - firstPoint.x);
			lastSideMustBeRoutedAround = lastPoint.anchor[3] !== (firstPoint.y - lastPoint.y) / Math.abs(firstPoint.y - lastPoint.y);
		}
	}
	if (firstSideMustBeRoutedAround) {
		sidesToRouteAround.push('first');
	}
	if (lastSideMustBeRoutedAround) {
		sidesToRouteAround.push('last');
	}
	return sidesToRouteAround;
}

function getAndCompareSides(firstPoint, lastPoint){
	var firstSide = getSide(firstPoint);
	var lastSide = getSide(lastPoint);
	if (firstSide === lastSide) {
		return {first: firstSide, last: lastSide, comparison: 'same'};
	} else if (((firstSide === 'top' || firstSide === 'bottom') && !(lastSide === 'top' || lastSide === 'bottom')) || (!(firstSide === 'top' || firstSide === 'bottom') && (lastSide === 'top' || lastSide === 'bottom'))) {
		return {first: firstSide, last: lastSide, comparison: 'perpendicular'};
	} else {
		return {first: firstSide, last: lastSide, comparison: 'opposing'};
	}
}

function getSide(explicitPoint){
	if (Math.abs(explicitPoint.anchor[2]) > Math.abs(explicitPoint.anchor[3])) {
		if (explicitPoint.anchor[2] > 0) {
			return 'right'; //East
		} else {
			return 'left'; //West
		}
	} else {
		if (explicitPoint.anchor[3] > 0) {
			return 'bottom'; //South
		} else {
			return 'top'; //North
		}
	}
}
