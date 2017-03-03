import { isNumber, omit } from 'lodash';
import * as GpmlUtilities from './gpml-utilities';

// a stub is a short path segment that is used for the first and/or last segment(s) of a path
var defaultStubLength = 20;

interface DataPositionAndOrientationMapping {
	position: number;
	orientation: number;
	offset: number;
}

export function processPointAttributes(data: Data, dataEdge: Edge): Edge {
	let pointElements = dataEdge['gpml:Point'];
	let explicitPoints = [];
	let referencedElement;
	let referencedElementGpmlElementName;

	dataEdge.isAttachedTo = [];

	pointElements.forEach(function(gpmlPoint, index) {
		let explicitPoint: any = {};

		const attributeDependencyOrder = [
			'GraphRef',
			'RelX',
			'RelY',
			'X',
			'Y'
		];

		var gpmlPointAttributesToPvjsonConverters = {
			X: function(gpmlXValue: string): number {
				const dataX = parseFloat(gpmlXValue);
				explicitPoint.x = dataX;
				return dataX;
			},
			Y: function(gpmlYValue: string): number {
				const dataY = parseFloat(gpmlYValue);
				explicitPoint.y = dataY;
				return dataY;
			},
			RelX: function(gpmlRelXValue: string) {
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

				// NOTE: this code only runs for points not attached to edges
				if (referencedElementGpmlElementName !== 'Interaction' && referencedElementGpmlElementName !== 'GraphicalLine') {
					var gpmlRelXValueInteger = parseFloat(gpmlRelXValue);
					var dataPositionAndOrientationX = getDataPositionAndOrientationMapping(gpmlRelXValueInteger, 'RelX', referencedElement);
					explicitPoint.attachmentDisplay = explicitPoint.attachmentDisplay || {};
					if (!!dataPositionAndOrientationX && isNumber(dataPositionAndOrientationX.position)) {
						explicitPoint.attachmentDisplay.position = explicitPoint.attachmentDisplay.position || [];
						explicitPoint.attachmentDisplay.position[0] =dataPositionAndOrientationX.position;
						if (dataPositionAndOrientationX.hasOwnProperty('orientation') &&
								isNumber(dataPositionAndOrientationX.orientation)) {
							explicitPoint.attachmentDisplay.orientation = explicitPoint.attachmentDisplay.orientation || [];
							explicitPoint.attachmentDisplay.orientation[0] = dataPositionAndOrientationX.orientation;
						}
						if (dataPositionAndOrientationX.hasOwnProperty('offset')) {
							explicitPoint.attachmentDisplay.offset = explicitPoint.attachmentDisplay.offset || [];
							// TODO in the case of a group as the referenced element,
							// we don't have the group width and height yet to properly calculate this
							explicitPoint.attachmentDisplay.offset[0] = dataPositionAndOrientationX.offset;
						}
					}
					return gpmlRelXValueInteger;
				}
			},
			RelY: function(gpmlRelYValue: string) {
				// see note at RelX
				// this code only runs for points not attached to edges
				if (referencedElementGpmlElementName !== 'Interaction' &&
						referencedElementGpmlElementName !== 'GraphicalLine') {
					var gpmlRelYValueInteger = parseFloat(gpmlRelYValue);
					var dataPositionAndOrientationY = getDataPositionAndOrientationMapping(gpmlRelYValueInteger, 'RelY', referencedElement);
					explicitPoint.attachmentDisplay = explicitPoint.attachmentDisplay || {};
					if (!!dataPositionAndOrientationY && isNumber(dataPositionAndOrientationY.position)) {
						explicitPoint.attachmentDisplay.position = explicitPoint.attachmentDisplay.position || [];
						explicitPoint.attachmentDisplay.position[1] = dataPositionAndOrientationY.position;
						if (dataPositionAndOrientationY.hasOwnProperty('orientation') &&
								isNumber(dataPositionAndOrientationY.orientation)) {
							explicitPoint.attachmentDisplay.orientation = explicitPoint.attachmentDisplay.orientation || [];
							explicitPoint.attachmentDisplay.orientation[1] = dataPositionAndOrientationY.orientation;
						}
						if (dataPositionAndOrientationY.hasOwnProperty('offset')) {
							explicitPoint.attachmentDisplay.offset = explicitPoint.attachmentDisplay.offset || [];
							// TODO in the case of a group as the referenced element,
							// we don't have the group width and height yet to properly calculate this

							// NOTE: we set the X offset to zero if it doesn't exist so that we don't have null values in the array.
							explicitPoint.attachmentDisplay.offset[0] = explicitPoint.attachmentDisplay.offset[0] || 0;
							explicitPoint.attachmentDisplay.offset[1] = dataPositionAndOrientationY.offset;
						}
					}
					return gpmlRelYValueInteger;
				}
			},
			GraphRef: function(gpmlGraphRefValue: string) {
				// the point can attach to an anchor
				explicitPoint.isAttachedTo = gpmlGraphRefValue;

				var referencedNode = data.elementMap[gpmlGraphRefValue] as DataElement;
				var referencedNodeGpmlElementName = referencedNode.gpmlElementName;

				if (referencedNodeGpmlElementName !== 'Anchor') {
					referencedElement = referencedNode;
					referencedElementGpmlElementName = referencedNodeGpmlElementName;
					// the id of the element this point is attached to (references)
					dataEdge.isAttachedTo.push(gpmlGraphRefValue);
				} else {
					// here, the edge attaches to another edge, not an anchor, unlike the point,
					// which connects to the anchor.
					var referencedEdgeId = referencedNode.isAttachedTo;
					var referencedEdge = data.elementMap[referencedEdgeId];
					referencedElement = referencedEdge;
					var referencedEdgeGpmlElementName = referencedEdge.gpmlElementName;
					referencedElementGpmlElementName = referencedEdgeGpmlElementName;
					dataEdge.isAttachedTo.push(referencedEdgeId);
				}
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
				gpmlPointAttributesToPvjsonConverters,
				attributeDependencyOrder
		);
		explicitPoints.push(explicitPoint);
	});

	dataEdge.explicitPoints = explicitPoints;
	return omit(dataEdge, ['gpml:Point'])
}

export function postProcess(data: Data, dataEdge: Edge): Edge {
	const elementMap = data.elementMap;
	let pointElements = dataEdge['gpml:Point'];
	let dataPoints;
	let explicitPoints = dataEdge.explicitPoints;
	let referencedElements = dataEdge.isAttachedTo.map(elementId => elementMap[elementId]);
	let referencedElementGpmlElementNames = referencedElements.map(element => element.gpmlElementName);

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
				referencedElementGpmlElementNames
		);
	} else if (type === 'CurvedLine'){
		dataPoints = calculateDataPoints(
				data,
				type,
				explicitPoints,
				referencedElements,
				referencedElementGpmlElementNames
		);
	} else {
		console.warn('Unknown edge type: ' + type);
	}

	// TODO how do we distinguish between intermediate (not first or last) points that a user
	// has explicitly specified vs. intermediate points that are only implied?
	// Do we need to? GPML currently does not specify implicit intermediate points, but
	// pvjson does.

	dataEdge.points = dataPoints;
	return omit(dataEdge, ['gpml:Point', 'explicitPoints'])
}

/**
 * calculateDataPoints
 *
 * @param data {Object}
 * @param edgeType {String}
 * @param explicitPoints {Array}
 * @param referencedElements {Array}
 * @param referencedElementGpmlElementNames {Array}
 * @return {Array} Set of points required to render the edge. Additional points are added if required to unambiguously specify an edge (implicit points are made explicit).
 */
function calculateDataPoints(
		data,
		edgeType,
		explicitPoints,
		referencedElements,
		referencedElementGpmlElementNames
): Point[] {
	var firstPoint = explicitPoints[0]
		, lastPoint = explicitPoints[explicitPoints.length - 1]
		, sideCombination
		, expectedPointCount
		// this stub is used to make the edge emanate away from the source (or target) node, even though that means initially moving away from the target (or source) node 
		, sidesToRouteAround
		;

	// if first and last points are not attached to other attachmentDisplay elements
	if (firstPoint.hasOwnProperty('attachmentDisplay') &&
			isNumber(firstPoint.attachmentDisplay.orientation[0]) &&
				isNumber(firstPoint.attachmentDisplay.orientation[1]) &&
					lastPoint.hasOwnProperty('attachmentDisplay') &&
						isNumber(lastPoint.attachmentDisplay.orientation[0]) &&
							isNumber(lastPoint.attachmentDisplay.orientation[1])) {
		sideCombination = getSideCombination(firstPoint, lastPoint);
	// if first point is not attached to another attachmentDisplay element and last point is attached to an attachmentDisplay (not a group)
	} else if (firstPoint.hasOwnProperty('attachmentDisplay') &&
						 isNumber(firstPoint.attachmentDisplay.orientation[0]) &&
							 isNumber(firstPoint.attachmentDisplay.orientation[1]) &&
								 lastPoint.hasOwnProperty('attachmentDisplay')) {
		lastPoint = getSideEquivalentForLine(firstPoint, lastPoint, referencedElements[1], data);
		sideCombination = getSideCombination(firstPoint, lastPoint);
	// if last point is not attached to another attachmentDisplay element and first point is attached to an attachmentDisplay (not a group)
	} else if (lastPoint.hasOwnProperty('attachmentDisplay') &&
						 isNumber(lastPoint.attachmentDisplay.orientation[0]) &&
							 isNumber(lastPoint.attachmentDisplay.orientation[1]) &&
								 firstPoint.hasOwnProperty('attachmentDisplay')) {
		firstPoint = getSideEquivalentForLine(lastPoint, firstPoint, referencedElements[0], data);
		sideCombination = getSideCombination(firstPoint, lastPoint);
	// if first and last points are attached to attachmentDisplays
	} else if (firstPoint.hasOwnProperty('attachmentDisplay') &&
						 lastPoint.hasOwnProperty('attachmentDisplay')) {
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
	// if first point is attached to an attachmentDisplay and last point is unconnected
	} else if (firstPoint.hasOwnProperty('attachmentDisplay')) {
		sideCombination = {};
		sideCombination.expectedPointCount = 2;
	// if last point is attached to an attachmentDisplay and first point is unconnected
	} else if (lastPoint.hasOwnProperty('attachmentDisplay')) {
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
		var directionIsVertical = (Math.abs(firstPoint.attachmentDisplay.orientation[1]) === 1);

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
					dataPoints[1].y = firstPoint.y + firstPoint.attachmentDisplay.orientation[1] * defaultStubLength;
				} else {
					if (firstPoint.attachmentDisplay.orientation[1] > 0) {
						dataPoints[1].y = Math.max(firstPoint.y, lastPoint.y) + firstPoint.attachmentDisplay.orientation[1] * defaultStubLength;
					} else {
						dataPoints[1].y = Math.min(firstPoint.y, lastPoint.y) + firstPoint.attachmentDisplay.orientation[1] * defaultStubLength;
					}
				}
			} else {
				dataPoints[1] = {};
				if (sidesToRouteAround.length === 0) {
					//dataPoints[1].x = (firstPoint.x + lastPoint.x) / 2;
					// this stub is not required, but we're just somewhat arbitrarily using it because the pathway author did not specify where the midpoint of the second path segment should be
					dataPoints[1].x = firstPoint.x + firstPoint.attachmentDisplay.orientation[0] * defaultStubLength;
				} else {
					if (firstPoint.attachmentDisplay.orientation[0] > 0) {
						dataPoints[1].x = Math.max(firstPoint.x, lastPoint.x) + firstPoint.attachmentDisplay.orientation[0] * defaultStubLength;
					} else {
						dataPoints[1].x = Math.min(firstPoint.x, lastPoint.x) + firstPoint.attachmentDisplay.orientation[0] * defaultStubLength;
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
				dataPoints[1].x = (firstPoint.x + lastPoint.x + lastPoint.attachmentDisplay.orientation[0] * defaultStubLength) / 2;
				if (sidesToRouteAround.indexOf('first') === -1) {
					dataPoints[1].y = firstPoint.y + firstPoint.attachmentDisplay.orientation[1] * defaultStubLength;
				} else {
					if (firstPoint.attachmentDisplay.orientation[1] > 0) {
						dataPoints[1].y = Math.max(firstPoint.y, lastPoint.y) + firstPoint.attachmentDisplay.orientation[1] * defaultStubLength;
					} else {
						dataPoints[1].y = Math.min(firstPoint.y, lastPoint.y) + firstPoint.attachmentDisplay.orientation[1] * defaultStubLength;
					}
				}
				dataPoints[2] = {};
				if (sidesToRouteAround.indexOf('last') === -1) {
					dataPoints[2].x = lastPoint.x + lastPoint.attachmentDisplay.orientation[0] * defaultStubLength;
				} else {
					if (lastPoint.attachmentDisplay.orientation[0] > 0) {
						dataPoints[2].x = Math.max(firstPoint.x, lastPoint.x) + lastPoint.attachmentDisplay.orientation[0] * defaultStubLength;
					} else {
						dataPoints[2].x = Math.min(firstPoint.x, lastPoint.x) + lastPoint.attachmentDisplay.orientation[0] * defaultStubLength;
					}
				}
				dataPoints[2].y = (dataPoints[1].y + lastPoint.y) / 2;
			} else {
				dataPoints[1] = {};
				dataPoints[1].x = firstPoint.x + firstPoint.attachmentDisplay.orientation[0] * defaultStubLength;
				if (sidesToRouteAround.indexOf('first') === -1) {
					dataPoints[1].x = firstPoint.x + firstPoint.attachmentDisplay.orientation[0] * defaultStubLength;
				} else {
					if (firstPoint.attachmentDisplay.orientation[0] > 0) {
						dataPoints[1].x = Math.max(firstPoint.x, lastPoint.x) + firstPoint.attachmentDisplay.orientation[0] * defaultStubLength;
					} else {
						dataPoints[1].x = Math.min(firstPoint.x, lastPoint.x) + firstPoint.attachmentDisplay.orientation[0] * defaultStubLength;
					}
				}
				dataPoints[1].y = (firstPoint.y + lastPoint.y + lastPoint.attachmentDisplay.orientation[1] * defaultStubLength) / 2;
				dataPoints[2] = {};
				dataPoints[2].x = (dataPoints[1].x + lastPoint.x) / 2;
				if (sidesToRouteAround.indexOf('last') === -1) {
					dataPoints[2].y = lastPoint.y + lastPoint.attachmentDisplay.orientation[1] * defaultStubLength;
				} else {
					if (lastPoint.attachmentDisplay.orientation[1] > 0) {
						dataPoints[2].y = Math.max(firstPoint.y, lastPoint.y) + lastPoint.attachmentDisplay.orientation[1] * defaultStubLength;
					} else {
						dataPoints[2].y = Math.min(firstPoint.y, lastPoint.y) + lastPoint.attachmentDisplay.orientation[1] * defaultStubLength;
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
				dataPoints[1].y = firstPoint.y + firstPoint.attachmentDisplay.orientation[1] * defaultStubLength;
				dataPoints[2] = {};
				dataPoints[2].x = (firstPoint.x + lastPoint.x) / 2;
				dataPoints[2].y = (firstPoint.y + lastPoint.y) / 2;
				dataPoints[3] = {};
				dataPoints[3].x = ((lastPoint.x - firstPoint.x) * (3/4)) + firstPoint.x;
				dataPoints[3].y = lastPoint.y + lastPoint.attachmentDisplay.orientation[1] * defaultStubLength;
			} else {
				dataPoints[1] = {};
				dataPoints[1].x = firstPoint.x + firstPoint.attachmentDisplay.orientation[0] * defaultStubLength;
				dataPoints[1].y = ((lastPoint.y - firstPoint.y) / 4) + firstPoint.y;
				dataPoints[2] = {};
				dataPoints[2].x = (firstPoint.x + lastPoint.x) / 2;
				dataPoints[2].y = (firstPoint.y + lastPoint.y) / 2;
				dataPoints[3] = {};
				dataPoints[3].x = lastPoint.x + lastPoint.attachmentDisplay.orientation[0] * defaultStubLength;
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

function getDataPositionAndOrientationMapping(relValue: number, identifier: string, referencedElement): DataPositionAndOrientationMapping {
	// orientation here refers to the initial direction the edge takes as it moves away from its attachmentDisplay
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
		var angleOption = Math.atan2(firstSegmentOption.orientationY, firstSegmentOption.orientationX);
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
		firstSegmentEndPoint.x = pointOnEdge.x + defaultStubLength * firstSegmentOption.orientationX;
		firstSegmentEndPoint.y = pointOnEdge.y + defaultStubLength * firstSegmentOption.orientationY;
		if (!!referencedEdge && sameSide(firstPointOfReferencedEdge, lastPointOfReferencedEdge, firstSegmentEndPoint, pointOnShape)) {
			angleBetweenFirstSegmentOptionAndAttachedEdge = Math.abs(angleOption - angleFromPointOnEdgeToPointOnShape);
			if (angleBetweenFirstSegmentOptionAndAttachedEdge > Math.PI) {
				angleBetweenFirstSegmentOptionAndAttachedEdge = 2 * Math.PI - angleBetweenFirstSegmentOptionAndAttachedEdge;
			}

			var angleBetweenFirstSegmentOptionAndReferencedEdge = Math.abs(angleOfReferencedEdge - angleOption);
			if (angleBetweenFirstSegmentOptionAndReferencedEdge > Math.PI) {
				angleBetweenFirstSegmentOptionAndReferencedEdge = 2 * Math.PI - angleBetweenFirstSegmentOptionAndReferencedEdge;
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
				return Math.abs(a.angleBetweenFirstSegmentOptionAndReferencedEdge - Math.PI/2) - Math.abs(b.angleBetweenFirstSegmentOptionAndReferencedEdge - Math.PI/2);
			});
		} else {
			// sort so that first segment option closest to attached edge is first
			firstSegmentCalculations.sort(function(a, b) {
				return a.angleBetweenFirstSegmentOptionAndAttachedEdge - b.angleBetweenFirstSegmentOptionAndAttachedEdge;
			});
		}
		selectedFirstSegmentCalculation = firstSegmentCalculations[0];
	} else {
		console.warn('The pathway author appears to have specified that the edges should cross but did not specify how to do it, so we arbitrarily choose to emanate from the "top"');
		selectedFirstSegmentCalculation = firstSegmentOptions[0];
	}
	
	pointOnEdge.attachmentDisplay.orientation = [ 
		selectedFirstSegmentCalculation.orientationX,
		selectedFirstSegmentCalculation.orientationY
	];

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
			firstSideMustBeRoutedAround = (firstPoint.attachmentDisplay.orientation[1] !== (lastPoint.y - firstPoint.y) / Math.abs(lastPoint.y - firstPoint.y));
			firstSideMustBeRoutedAround = !lastSideMustBeRoutedAround;
		} else {
			firstSideMustBeRoutedAround = (firstPoint.attachmentDisplay.orientation[0] !== (lastPoint.x - firstPoint.x) / Math.abs(lastPoint.x - firstPoint.x));
			firstSideMustBeRoutedAround = !lastSideMustBeRoutedAround;
		}
	} else if (sides.comparison === 'opposing') {
		if (sides.first === 'top' || sides.first === 'bottom') {
			firstSideMustBeRoutedAround = lastSideMustBeRoutedAround = (firstPoint.attachmentDisplay.orientation[1] !== (lastPoint.y - firstPoint.y) / Math.abs(lastPoint.y - firstPoint.y));
		} else {
			firstSideMustBeRoutedAround = lastSideMustBeRoutedAround = (firstPoint.attachmentDisplay.orientation[0] !== (lastPoint.x - firstPoint.x) / Math.abs(lastPoint.x - firstPoint.x));
		}
	// if side comparison is not same or opposing, it must be perpendicular
	} else { 
		if (sides.first === 'top' || sides.first === 'bottom') {
			firstSideMustBeRoutedAround = firstPoint.attachmentDisplay.orientation[1] !== (lastPoint.y - firstPoint.y) / Math.abs(lastPoint.y - firstPoint.y);
			lastSideMustBeRoutedAround = lastPoint.attachmentDisplay.orientation[0] !== (firstPoint.x - lastPoint.x) / Math.abs(firstPoint.x - lastPoint.x);
		} else {
			firstSideMustBeRoutedAround = firstPoint.attachmentDisplay.orientation[0] !== (lastPoint.x - firstPoint.x) / Math.abs(lastPoint.x - firstPoint.x);
			lastSideMustBeRoutedAround = lastPoint.attachmentDisplay.orientation[1] !== (firstPoint.y - lastPoint.y) / Math.abs(firstPoint.y - lastPoint.y);
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
	} else if (((firstSide === 'top' || firstSide === 'bottom') &&
								 !(lastSide === 'top' || lastSide === 'bottom')) || (!(firstSide === 'top' || firstSide === 'bottom') &&
									 (lastSide === 'top' || lastSide === 'bottom'))) {
		return {first: firstSide, last: lastSide, comparison: 'perpendicular'};
	} else {
		return {first: firstSide, last: lastSide, comparison: 'opposing'};
	}
}

function getSide(explicitPoint){
	if (Math.abs(explicitPoint.attachmentDisplay.orientation[0]) > Math.abs(explicitPoint.attachmentDisplay.orientation[1])) {
		if (explicitPoint.attachmentDisplay.orientation[0] > 0) {
			return 'right'; //East
		} else {
			return 'left'; //West
		}
	} else {
		if (explicitPoint.attachmentDisplay.orientation[1] > 0) {
			return 'bottom'; //South
		} else {
			return 'top'; //North
		}
	}
}
