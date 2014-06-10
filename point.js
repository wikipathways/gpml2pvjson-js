var Strcase = require('tower-strcase')
  , _ = require('lodash')
  , Cheerio = require('cheerio')
  ;

module.exports = (function(){
  'use strict';

  var getPvjsonPositionAndOrientationMapping = function(args) {
    var relValue = args.relValue
      , identifier = args.identifier
      , referencedElement = args.referencedElement
      ;

    // orientation here refers to the initial direction the edge takes as it moves away from its attachment
    var result = {}, position, referencedElementDimension;

    var relativeToUpperLeftCorner = (relValue + 1) / 2;
    if (relativeToUpperLeftCorner < 0 || relativeToUpperLeftCorner > 1) {
      if (identifier === 'RelX') {
        referencedElementDimension = referencedElement.attr('Width');
      }
      else {
        referencedElementDimension = referencedElement.attr('Height');
      }
      if (relativeToUpperLeftCorner < 0) {
        position = 0;
        result.offset = relativeToUpperLeftCorner * referencedElementDimension;
      }
      else {
        position = 1;
        result.offset = (relativeToUpperLeftCorner - 1) * referencedElementDimension;
      }
    }
    else {
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

  function toPvjson(pvjson, gpmlSelection, gpmlEdgeSelection, pvjsonEdge, callback) {
    var point
      , gpmlPointSelection
      , explicitPoint
      , pvjsonPoint
      , pvjsonPoints
      , explicitPoints = []
      , pvjsonX
      , pvjsonY
      , parentElement
      , pvjsonMarker
      , referencedElement
      , referencedElementTag
      , referencedElements = []
      , referencedElementsTags = []
      ;

      gpmlEdgeSelection.find('Point').each(function(index) {
      point = this;
      gpmlPointSelection = $( this );
      explicitPoint = {};

      var attributeDependencyOrder = [
        'GraphRef',
        'RelX',
        'RelY',
        'X',
        'Y'
      ];

      var gpmlToPvjsonConverter = {
        X: function(gpmlXValue) {
          pvjsonX = parseFloat(gpmlXValue);
          explicitPoint.x = pvjsonX;
          return pvjsonX;
        },
        Y: function(gpmlYValue) {
          pvjsonY = parseFloat(gpmlYValue);
          explicitPoint.y = pvjsonY;
          return pvjsonY;
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
          if (referencedElementTag.toLowerCase() !== 'interaction' && referencedElementTag.toLowerCase() !== 'graphicalline') {
            var gpmlRelXValueString = gpmlRelXValue.toString();
            var gpmlRelXValueInteger = parseFloat(gpmlRelXValue);
            var argsX = {};
            argsX.relValue = gpmlRelXValueInteger;
            argsX.identifier = 'RelX';
            argsX.referencedElement = referencedElement;
            argsX.gpmlSelection = gpmlSelection;
            var pvjsonPositionAndOrientationX = getPvjsonPositionAndOrientationMapping(argsX);
            explicitPoint.anchor = explicitPoint.anchor || [];
            if (!!pvjsonPositionAndOrientationX && _.isNumber(pvjsonPositionAndOrientationX.position)) {
              explicitPoint.anchor[0] = pvjsonPositionAndOrientationX.position;
              if (pvjsonPositionAndOrientationX.hasOwnProperty('orientation')) {
                explicitPoint.anchor[2] = pvjsonPositionAndOrientationX.orientation;
              } else {
              }
              if (pvjsonPositionAndOrientationX.hasOwnProperty('offset')) {
                explicitPoint.anchor[4] = pvjsonPositionAndOrientationX.offset;
              }
            }
            return gpmlRelXValueInteger;
          }
        },
        RelY: function(gpmlRelYValue) {
          // see note at RelX
          // this code only runs for points not attached to edges
          if (referencedElementTag.toLowerCase() !== 'interaction' && referencedElementTag.toLowerCase() !== 'graphicalline') {
            var gpmlRelYValueString = gpmlRelYValue.toString();
            var gpmlRelYValueInteger = parseFloat(gpmlRelYValue);
            var argsY = {};
            argsY.relValue = gpmlRelYValueInteger;
            argsY.identifier = 'RelY';
            argsY.referencedElement = referencedElement;
            argsY.gpmlSelection = gpmlSelection;
            var pvjsonPositionAndOrientationY = getPvjsonPositionAndOrientationMapping(argsY);
            // here we are referring to jsplumb anchor, not GPML Anchor
            explicitPoint.anchor = explicitPoint.anchor || [];
            if (!!pvjsonPositionAndOrientationY && _.isNumber(pvjsonPositionAndOrientationY.position)) {
              explicitPoint.anchor[1] = pvjsonPositionAndOrientationY.position;
              if (pvjsonPositionAndOrientationY.hasOwnProperty('orientation')) {
                explicitPoint.anchor[3] = pvjsonPositionAndOrientationY.orientation;
              } else {
              }
              if (pvjsonPositionAndOrientationY.hasOwnProperty('offset')) {
                explicitPoint.anchor[5] = pvjsonPositionAndOrientationY.offset;
              }
            }
            return gpmlRelYValueInteger;
          }
        },
        GraphRef: function(gpmlGraphRefValue){
          // this is the actual XML of the element
          var referencedNode = gpmlSelection('*[GraphId=' + gpmlGraphRefValue + ']')[0];
          var referencedNodeTag = referencedNode.name;
          // GPML and jsplumb/pvjson use different meaning and architecture for the term "anchor."
          // GPML uses anchor to refer to an actual element that specifies a position along an edge.
          // pvjson copies jsplumb in using anchor to refer to the location of the point in terms of another element.
          // When that other element is an edge, pvjson refers directly to the edge,
          // unlike GPML which refers to an element located at a position along the edge.
          // 
          // here we are referring to GPML Anchor, not jsplumb anchor.
          if (referencedNodeTag !== 'anchor') {
            referencedElement = referencedNode;
            referencedElementTag = referencedNodeTag;
            // the id of the element this point references (is attached to)
            explicitPoint.references = gpmlGraphRefValue;
          } else {
            // here we are converting from GPML Anchor (an element representing a node on an edge) to jsplumb anchor (just a reference to a position along an edge)
            // since this jsplumb-anchor is specified relative to an edge, it only has one dimension (position along the edge),
            // unlike nodes, which can have two dimensions (along x dimension of node, along y dimension of node).
            // So for edges, anchor[0] refers to position along the edge and anchor[1] is a dummy value that is always 0.
            explicitPoint.anchor = explicitPoint.anchor || [];
            console.log(referencedNode);
            explicitPoint.anchor[0] = $(referencedNode).find('Graphics').attr('Position');
            explicitPoint.anchor[1] = 0;  

            var referencedEdge = referencedNode.parent.parent;
            referencedElement = referencedEdge;
            var referencedEdgeTag = referencedEdge.name;
            referencedElementTag = referencedEdgeTag;
            var referencedEdgeSelection = $(referencedEdge);
            var referencedEdgeId = referencedEdgeSelection.attr('GraphId');
            // the id of the edge (IMPORTANT NOTE: NOT the GPML Anchor!) that this pvjson point references (is attached to)
            explicitPoint.references = referencedEdgeId;
          }
          referencedElements.push(referencedElement);
          referencedElementsTags.push(referencedElementTag);
          return gpmlGraphRefValue;
        },
        ArrowHead: function(gpmlArrowHeadValue) {
          pvjsonMarker = Strcase.camelCase(gpmlArrowHeadValue);
          if (index === 0) {
            pvjsonEdge.markerStart = pvjsonMarker;
          }
          else {
            pvjsonEdge.markerEnd = pvjsonMarker;
          }
          return pvjsonMarker;
        }
      };

      var gpmlToPvjsonConverterKeys = _.keys(gpmlToPvjsonConverter);
      var attributeKeys = _.keys(point.attribs);
      var attributeKeysWithHandler = _.intersection(gpmlToPvjsonConverterKeys, attributeKeys);
      //TODO warn for the keys without a handler

      var attributeList = _.map(attributeKeysWithHandler, function(attributeKey) {
        return {
          name: attributeKey,
          value: point.attribs[attributeKey],
          dependencyOrder: attributeDependencyOrder.indexOf(attributeKey),
        };
      });
      attributeList.sort(function(a, b) {
        return a.dependencyOrder - b.dependencyOrder;
      });
      var attributeListItemName;
      _(attributeList).forEach(function(attributeListItem) {
        gpmlToPvjsonConverter[attributeListItem.name](attributeListItem.value);
      });

      explicitPoints.push(explicitPoint);
    });

    var type = gpmlEdgeSelection.find('Graphics').attr('ConnectorType');

    if (type === 'Straight'){
      if (explicitPoints.length > 2) {
        console.warn('Too many points for a straight line!');
      }
      pvjsonPoints = explicitPoints;
    }
    else if (type === 'Segmented'){
      pvjsonPoints = explicitPoints;
    }
    else if (type === 'Elbow'){
      pvjsonPoints = calculatePvjsonPoints(gpmlSelection, explicitPoints, referencedElements, referencedElementsTags);
    }
    else if (type === 'Curved'){
      pvjsonPoints = calculatePvjsonPoints(gpmlSelection, explicitPoints, referencedElements, referencedElementsTags);
    }
    else {
      console.warn('Unknown connector type: ' + type);
    }

    pvjsonEdge.points = pvjsonPoints;
    callback(pvjsonEdge);
  }

  function calculatePvjsonPoints(gpmlSelection, explicitPoints, referencedElements, referencedElementsTags) {
    // [side comparison, reroutingRequired, expected total point count]

    var firstPoint = explicitPoints[0]
      , lastPoint = explicitPoints[explicitPoints.length - 1]
      , expectedPointCount
      ;

    // if first and last points are attached to shapes
    if (firstPoint.hasOwnProperty('anchor') && _.isNumber(firstPoint.anchor[2]) && _.isNumber(firstPoint.anchor[3]) && lastPoint.hasOwnProperty('anchor') && _.isNumber(lastPoint.anchor[2]) && _.isNumber(lastPoint.anchor[3])) {
      expectedPointCount = getExpectedPointCount(firstPoint, lastPoint);
    // if first point is attached to a shape and last point is attached to an anchor
    } else if (firstPoint.hasOwnProperty('anchor') && _.isNumber(firstPoint.anchor[2]) && _.isNumber(firstPoint.anchor[3]) && lastPoint.hasOwnProperty('anchor')) {
      lastPoint = getSideEquivalentForLine(firstPoint, lastPoint, referencedElements[1], gpmlSelection);
      expectedPointCount = getExpectedPointCount(firstPoint, lastPoint);
    // if last point is attached to a shape and first point is attached to an anchor
    } else if (lastPoint.hasOwnProperty('anchor') && _.isNumber(lastPoint.anchor[2]) && _.isNumber(lastPoint.anchor[3]) && firstPoint.hasOwnProperty('anchor')) {
      firstPoint = getSideEquivalentForLine(lastPoint, firstPoint, referencedElements[0], gpmlSelection);
      expectedPointCount = getExpectedPointCount(firstPoint, lastPoint);
    // if first and last points are attached to anchors
    } else if (firstPoint.hasOwnProperty('anchor') && lastPoint.hasOwnProperty('anchor')) {
      // TODO change this to actually calculate the number
      expectedPointCount = 2;
    // if first point is attached to an anchor and last point is free
    } else if (firstPoint.hasOwnProperty('anchor')) {
      // TODO change this to actually calculate the number
      expectedPointCount = 2;
    // if last point is attached to an anchor and first point is free
    } else if (lastPoint.hasOwnProperty('anchor')) {
      // TODO change this to actually calculate the number
      expectedPointCount = 2;
    // if both edges are free
    } else {
      // TODO change this to actually calculate the number
      expectedPointCount = 2;
    }

    //check to see whether all implicit points are provided
    if (explicitPoints.length >= expectedPointCount) {
      return explicitPoints;
    } else {
      var pvjsonPoints = [];

      //first pvjson point is start
      pvjsonPoints[0] = firstPoint;

      var directionIsVertical = (Math.abs(explicitPoints[0].anchor[3]) === 1);
      var defaultStubLength = 20;

      // calculate intermediate pvjson points, which are implicit
      // remember that this refers to the minimum number of points required to define the path,
      // so 3 points means something like this:
      //
      //  -------------------*-------------------
      //  |                                     |
      //  *                                     *
      // 
      //
      //                   or
      //
      //                                        *
      //                                        |
      //                                        |
      //  -------------------*-------------------
      //  |
      //  *
      //
      if (expectedPointCount === 3) {
        if (directionIsVertical) {
          pvjsonPoints[1] = {};
          pvjsonPoints[1].x = (firstPoint.x + lastPoint.x) / 2;
          pvjsonPoints[1].y = firstPoint.y + firstPoint.anchor[3] * defaultStubLength;
        } else {
          pvjsonPoints[1] = {};
          pvjsonPoints[1].x = firstPoint.x + firstPoint.anchor[2] * defaultStubLength;
          pvjsonPoints[1].y = (firstPoint.y + lastPoint.y) / 2;
        }
      } else if (expectedPointCount === 4){
      //
      //  ------------------*--------------------
      //  |                                     | 
      //  *                                     | 
      //                                        *
      //                                        |
      //                                        |
      //                                        ---*
      //
        if (directionIsVertical) {
          pvjsonPoints[1] = {};
          pvjsonPoints[1].x = (firstPoint.x + lastPoint.x + lastPoint.anchor[2] * defaultStubLength) / 2;
          pvjsonPoints[1].y = firstPoint.y + firstPoint.anchor[3] * defaultStubLength;
          pvjsonPoints[2] = {};
          pvjsonPoints[2].x = lastPoint.x + lastPoint.anchor[2] * defaultStubLength;
          pvjsonPoints[2].y = (pvjsonPoints[1].y + lastPoint.y) / 2;
        } else {
          pvjsonPoints[1] = {};
          pvjsonPoints[1].x = firstPoint.x + firstPoint.anchor[2] * defaultStubLength;
          pvjsonPoints[1].y = (firstPoint.y + lastPoint.y + lastPoint.anchor[3] * defaultStubLength) / 2;
          pvjsonPoints[2] = {};
          pvjsonPoints[2].x = (pvjsonPoints[1].x + lastPoint.x) / 2;
          pvjsonPoints[2].y = lastPoint.y + lastPoint.anchor[3] * defaultStubLength;
        }
      } else if (expectedPointCount === 5){
      //
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
        if (directionIsVertical) {
          pvjsonPoints[1] = {};
          pvjsonPoints[1].x = ((lastPoint.x - firstPoint.x) / 4) + firstPoint.x;
          pvjsonPoints[1].y = firstPoint.y + firstPoint.anchor[3] * defaultStubLength;
          pvjsonPoints[2] = {};
          pvjsonPoints[2].x = (firstPoint.x + lastPoint.x) / 2;
          pvjsonPoints[2].y = (firstPoint.y + lastPoint.y) / 2;
          pvjsonPoints[3] = {};
          pvjsonPoints[3].x = ((lastPoint.x - firstPoint.x) * (3/4)) + firstPoint.x;
          pvjsonPoints[3].y = lastPoint.y + lastPoint.anchor[3] * defaultStubLength;
        } else {
          pvjsonPoints[1] = {};
          pvjsonPoints[1].x = firstPoint.x + firstPoint.anchor[2] * defaultStubLength;
          pvjsonPoints[1].y = ((lastPoint.y - firstPoint.y) / 4) + firstPoint.y;
          pvjsonPoints[2] = {};
          pvjsonPoints[2].x = (firstPoint.x + lastPoint.x) / 2;
          pvjsonPoints[2].y = (firstPoint.y + lastPoint.y) / 2;
          pvjsonPoints[3] = {};
          pvjsonPoints[3].x = lastPoint.x + lastPoint.anchor[2] * defaultStubLength;
          pvjsonPoints[3].y = ((lastPoint.y - firstPoint.y) * (3/4)) + firstPoint.y;
        }
      } else {
        throw new Error('Too many points expected.');
      }

      // final pvjson point is end
      pvjsonPoints[expectedPointCount - 1] = explicitPoints[explicitPoints.length - 1];

      return pvjsonPoints;
    }
  }

  // see https://gist.github.com/ahwolf/4349166 and
  // http://www.blackpawn.com/texts/pointinpoly/default.html
  function crossProduct (u, v) {
    return u[0] * v[1] - v[0] * u[1];
  }

  function sign (u) {
    return u>=0;
  }

  function sameSide(p1, p2, a, b) {
    console.log('p1');
    console.log(p1);
    console.log('p2');
    console.log(p2);
    console.log('a');
    console.log(a);
    console.log('b');
    console.log(b);
    var bMinusA = [b.x-a.x, b.y-a.y];
    var p1MinusA = [p1.x-a.x, p1.y-a.y];
    var p2MinusA = [p2.x-a.x, p2.y-a.y];
    var crossProduct1 = crossProduct(bMinusA, p1MinusA);
    var crossProduct2 = crossProduct(bMinusA, p2MinusA);
    var result = (sign(crossProduct1) === sign(crossProduct2));
    console.log('result');
    console.log(result);
    return result;
  }

  var getSideEquivalentForLine = function (pointOnShape, pointOnEdge, referencedEdgeSelection, gpmlSelection) {
    console.log('referencedEdgeSelection');
    console.log(referencedEdgeSelection);
    var riseFromPointOnEdgeToPointOnShape = pointOnShape.y - pointOnEdge.y;
    var runFromPointOnEdgeToPointOnShape = pointOnShape.x - pointOnEdge.x;
    var angleFromPointOnEdgeToPointOnShape = Math.atan2(riseFromPointOnEdgeToPointOnShape, runFromPointOnEdgeToPointOnShape);

    var angleOfReferencedEdge, referencedEdgePoints, firstPointOfReferencedEdge, lastPointOfReferencedEdge;

    if (!!referencedEdgeSelection) {
      // TODO handle case where referenced edge is not straight.
      // currently, the code below assumes the referenced edge is always straight, never elbowed or curved.
      // This would require being able to calculate a point at a distance along an elbow or curve.
      referencedEdgePoints = $(referencedEdgeSelection).find('Point');
      console.log('referencedEdgePoints');
      console.log(referencedEdgePoints);

      var firstPointOfReferencedEdgeSelection = $(referencedEdgePoints[0]);
      firstPointOfReferencedEdge = {};
      firstPointOfReferencedEdge.x = parseFloat(firstPointOfReferencedEdgeSelection.attr('X'));
      firstPointOfReferencedEdge.y = parseFloat(firstPointOfReferencedEdgeSelection.attr('Y'));
      console.log('firstPointOfReferencedEdge');
      console.log(firstPointOfReferencedEdge);

      var lastPointOfReferencedEdgeSelection = $(referencedEdgePoints[referencedEdgePoints.length - 1]);
      lastPointOfReferencedEdge = {};
      lastPointOfReferencedEdge.x = parseFloat(lastPointOfReferencedEdgeSelection.attr('X'));
      lastPointOfReferencedEdge.y = parseFloat(lastPointOfReferencedEdgeSelection.attr('Y'));
      console.log('lastPointOfReferencedEdge');
      console.log(lastPointOfReferencedEdge);

      var riseOfReferencedEdge = lastPointOfReferencedEdge.y - firstPointOfReferencedEdge.y;
      var runOfReferencedEdge = lastPointOfReferencedEdge.x - firstPointOfReferencedEdge.x;

      angleOfReferencedEdge = Math.atan2(riseOfReferencedEdge, runOfReferencedEdge);
    }

    var firstSegmentOptions = [{
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
      , defaultStubLength = 20
      , firstSegmentCalculations = []
      ;

    firstSegmentOptions.forEach(function(firstSegmentOption) {
      var angleOption = Math.atan2(firstSegmentOption.orientationY, firstSegmentOption.orientationX);
      var angleBetweenFirstSegmentOptionAndAnchoredEdge;
      var firstSegmentEndPoint = {};
      firstSegmentEndPoint.x = pointOnEdge.x + defaultStubLength * firstSegmentOption.orientationX;
      firstSegmentEndPoint.y = pointOnEdge.y + defaultStubLength * firstSegmentOption.orientationY;
      if (!!referencedEdgeSelection && sameSide(firstPointOfReferencedEdge, lastPointOfReferencedEdge, firstSegmentEndPoint, pointOnShape)) {
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
    console.log('firstSegmentCalculations');
    console.log(firstSegmentCalculations);

    if (!!referencedEdgeSelection) {
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
    
    //pointOnEdge.anchor.push(0.5);
    //pointOnEdge.anchor.push(0.5);
    pointOnEdge.anchor.push(selectedFirstSegmentCalculation.orientationX);
    //pointOnEdge.anchor.push(0);
    pointOnEdge.anchor.push(selectedFirstSegmentCalculation.orientationY);
    //pointOnEdge.anchor.push(-1);

    return pointOnEdge;
  };

  function getExpectedPointCount(firstPoint, lastPoint) {
    var combinations = [
      { 'sideComparison': 'same', 'reroutingRequired': true, 'expectedPointCount': 3 },
      { 'sideComparison': 'perpendicular', 'reroutingRequired': true, 'expectedPointCount': 4 },
      { 'sideComparison': 'perpendicular', 'reroutingRequired': false, 'expectedPointCount': 2 },
      { 'sideComparison': 'opposing', 'reroutingRequired': true, 'expectedPointCount': 5 },
      { 'sideComparison': 'opposing', 'reroutingRequired': false, 'expectedPointCount': 3 }
    ];
    var sides = getAndCompareSides(firstPoint, lastPoint);
    var reroutingRequired = determineWhetherReroutingRequired(firstPoint, lastPoint, sides);
    var expectedPointCount = combinations.filter(function(combination) {
      return combination.sideComparison === sides.comparison && combination.reroutingRequired === reroutingRequired;
    })[0].expectedPointCount;
    return expectedPointCount;
  }

  function determineWhetherReroutingRequired(firstPoint, lastPoint, sides){
    if (sides.comparison === 'same') {
      return true;
    } else if (sides.comparison === 'opposing') {
      if (sides.first === 'top' || sides.first === 'bottom') {
        return (firstPoint.anchor[3] === (firstPoint.y - lastPoint.y) / Math.abs(firstPoint.y - lastPoint.y));
      } else {
        return (firstPoint.anchor[2] === (firstPoint.x - lastPoint.x) / Math.abs(firstPoint.x - lastPoint.x));
      }
    // if side comparison is not same or opposing, it must be perpendicular
    } else { 
      if (sides.first === 'top' || sides.first === 'bottom') {
        return (firstPoint.anchor[3] === (firstPoint.y - lastPoint.y) / Math.abs(firstPoint.y - lastPoint.y) && (lastPoint.anchor[2] === (firstPoint.x - lastPoint.x) / Math.abs(firstPoint.x - lastPoint.x)));
      } else {
        return (lastPoint.anchor[3] === (firstPoint.y - lastPoint.y) / Math.abs(firstPoint.y - lastPoint.y) && (firstPoint.anchor[2] === (firstPoint.x - lastPoint.x) / Math.abs(firstPoint.x - lastPoint.x)));
      }
    }
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

  return {
    toPvjson:toPvjson
  };
}());
