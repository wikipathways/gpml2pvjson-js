import { isFinite, map, omit } from "lodash/fp";
import {
  isAttachablePoint,
  isDefinedCXML,
  isGPMLAnchor,
  isPvjsonBurr,
  isPvjsonSingleFreeNode,
  isPvjsonGroup,
  unionLSV
} from "../gpml-utilities";
import { SmartPoint } from "../geom-utils";
import {
  InteractionType,
  Point,
  PvjsonNode,
  PvjsonEdge,
  AttachmentDisplay,
  Orientation,
  OffsetOrientationAndPositionScalarsAlongAxis,
  GraphicalLineType,
  EdgeGraphicsTypePointType,
  GPMLElement
} from "../gpml2pvjson";
import { calculateAllPoints } from "./calculateAllPoints";

// a stub is a short path segment that is used for the first and/or last segment(s) of a path
export const DEFAULT_STUB_LENGTH = 20;

/**
 * getOffsetOrientationAndPositionScalarsAlongAxis
 *
 * @param relValue {number}
 * @param axis {string}
 * @param referencedEntity
 * @return {OffsetOrientationAndPositionScalarsAlongAxis}
 */
function getOffsetOrientationAndPositionScalarsAlongAxis(
  relValue: number,
  axis: "x" | "y",
  referencedEntity: PvjsonNode
): OffsetOrientationAndPositionScalarsAlongAxis {
  // orientationScalar here refers to the initial direction the edge takes as
  // it moves away from the entity to which it is attached.
  let offsetScalar;
  let orientationScalar;
  let positionScalar;
  let referencedEntityDimension;

  const relativeToUpperLeftCorner = (relValue + 1) / 2;
  if (relativeToUpperLeftCorner < 0 || relativeToUpperLeftCorner > 1) {
    if (axis === "x") {
      referencedEntityDimension = referencedEntity.width;
    } else {
      referencedEntityDimension = referencedEntity.height;
    }
    if (relativeToUpperLeftCorner < 0) {
      positionScalar = 0;
      offsetScalar = relativeToUpperLeftCorner * referencedEntityDimension;
    } else {
      positionScalar = 1;
      offsetScalar =
        (relativeToUpperLeftCorner - 1) * referencedEntityDimension;
    }
  } else {
    positionScalar = relativeToUpperLeftCorner;
    offsetScalar = 0;
  }

  if (positionScalar === 0) {
    orientationScalar = -1;
  } else if (positionScalar === 1) {
    orientationScalar = 1;
  } else {
    orientationScalar = 0;
  }

  return { offsetScalar, orientationScalar, positionScalar };
}

/**
 * preprocessGPML
 *
 * @param edge {GPMLEdge}
 * @return {GPMLEdge}
 */
export function preprocessGPML(
  Edge: InteractionType | GraphicalLineType
): GPMLElement {
  const isAttachedToOrVia = Edge.Graphics.Point
    .filter(p => p.GraphRef && isDefinedCXML(p.GraphRef))
    .map(p => p.GraphRef);

  if (isAttachedToOrVia.length > 0) {
    // In pvjson, an edge attaches directly to another entity (Node, Edge, Group),
    // not to an anchor.
    // If the edge attaches to another edge, it does so VIA an anchor.
    Edge["isAttachedToOrVia"] = isAttachedToOrVia;
  }
  return Edge;
}

/**
 * postprocessPVJSON
 *
 * @param referencedEntities
 * @param pvjsonEdge {pvjsonEdge}
 * @return {pvjsonEdge}
 */
export function postprocessPVJSON(
  referencedEntities: { [key: string]: (PvjsonNode | PvjsonEdge) },
  pvjsonEdge: PvjsonEdge
): PvjsonEdge {
  const { points, drawAs } = pvjsonEdge;

  const pointCount = points.length;
  let index = 0;

  const pvjsonEdgeIsAttachedTo = [];
  if (pvjsonEdge.hasOwnProperty("isAttachedTo")) {
    throw new Error("why does edge already have attachment?");
  }
  const explicitPoints = map(function(point: EdgeGraphicsTypePointType) {
    const { ArrowHead, GraphRef, RelX, RelY, X, Y } = point;
    const explicitPoint: Point = {} as Point;

    if (isDefinedCXML(ArrowHead)) {
      // NOTE: side effects below
      if (index === 0) {
        pvjsonEdge.markerStart = ArrowHead;
      } else if (index === pointCount - 1) {
        pvjsonEdge.markerEnd = ArrowHead;
      }
    }

    if (isDefinedCXML(X)) {
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
      isDefinedCXML(GraphRef) &&
      (referencedEntities[GraphRef] as PvjsonNode);

    if (isAttachablePoint(point, explicitPoint)) {
      const entityIdReferencedByEdge = isGPMLAnchor(entityReferencedByPoint)
        ? entityReferencedByPoint.isAttachedTo
        : entityReferencedByPoint.id;

      // NOTE: pvjson allows for expressing one edge attached to another edge.
      // When we do this, we say that the POINT attaches to an ANCHOR on the other edge,
      // but the EDGE attaches to the other EDGE, never the anchor.
      explicitPoint.isAttachedTo = entityReferencedByPoint.id;

      // WARNING: side effect
      pvjsonEdgeIsAttachedTo.push(entityIdReferencedByEdge);

      const entityReferencedByEdge =
        referencedEntities[entityIdReferencedByEdge];

      const orientation = (explicitPoint.orientation =
        explicitPoint.orientation || ([] as Orientation));
      const attachmentDisplay = (explicitPoint.attachmentDisplay =
        explicitPoint.attachmentDisplay ||
        ({ position: [], offset: [] } as AttachmentDisplay));

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

      if (
        isPvjsonSingleFreeNode(entityReferencedByEdge) ||
        isPvjsonGroup(entityReferencedByEdge) ||
        isPvjsonBurr(entityReferencedByEdge)
      ) {
        // edge connected to a SingleFreeNode, a Group or a Burr, but NOT another edge or an anchor
        const {
          offsetScalar: offsetScalarX,
          orientationScalar: orientationScalarX,
          positionScalar: positionScalarX
        } = getOffsetOrientationAndPositionScalarsAlongAxis(
          RelX,
          "x",
          entityReferencedByEdge
        );
        if (!isFinite(positionScalarX) || !isFinite(orientationScalarX)) {
          throw new Error(
            `Expected finite values for positionScalarX ${positionScalarX} and orientationScalarX ${orientationScalarX}`
          );
        }
        const {
          offsetScalar: offsetScalarY,
          orientationScalar: orientationScalarY,
          positionScalar: positionScalarY
        } = getOffsetOrientationAndPositionScalarsAlongAxis(
          RelY,
          "y",
          entityReferencedByEdge
        );
        if (!isFinite(positionScalarY) || !isFinite(orientationScalarY)) {
          throw new Error(
            `Expected finite values for positionScalarY ${positionScalarY} and orientationScalarY ${orientationScalarY}`
          );
        }

        if (index === 0) {
          orientation[0] = orientationScalarX;
          orientation[1] = orientationScalarY;
        } else {
          orientation[0] = -1 * orientationScalarX;
          orientation[1] = -1 * orientationScalarY;
        }

        attachmentDisplay.offset[0] = offsetScalarX;
        attachmentDisplay.offset[1] = offsetScalarY;
        attachmentDisplay.position[0] = positionScalarX;
        attachmentDisplay.position[1] = positionScalarY;

        /* TODO is there a case where we would ever use this?
				if (orientationAndPositionScalarsX.hasOwnProperty("offset")) {
					// TODO in the case of a group as the referenced entity,
					// we don't have the group width and height yet to properly calculate this
					attachmentDisplay.offset[0] =
						orientationAndPositionScalarsX.offsetScalar;
				}
				if (orientationAndPositionScalarsY.hasOwnProperty("offset")) {
					// TODO in the case of a group as the referenced entity,
					// we don't have the group width and height yet to properly calculate this

					// NOTE: we set the X offset to zero if it doesn't exist so that we don't have null values in the array.
					attachmentDisplay.offset[0] = attachmentDisplay.offset[0] || 0;
					attachmentDisplay.offset[1] =
						orientationAndPositionScalarsY.offsetScalar;
				}
				//*/
      } else if (isGPMLAnchor(entityReferencedByPoint)) {
        // edge is connected to another edge via an anchor
        const position = (attachmentDisplay.position =
          entityReferencedByPoint.attachmentDisplay.position);
      } else {
        console.error("entityReferencedByPoint:");
        console.error(entityReferencedByPoint);
        console.error("entityReferencedByEdge:");
        console.error(entityReferencedByEdge);
        throw new Error(
          "Edge or Point attached to unexpected entity (logged above)."
        );
      }
    }

    // NOTE: side effect
    index += 1;
    return explicitPoint;
  }, points);

  const pvjsonEdgeAttachedToCount = pvjsonEdgeIsAttachedTo.length;
  if (pvjsonEdgeAttachedToCount > 0) {
    pvjsonEdge.isAttachedTo = pvjsonEdgeIsAttachedTo;
  }

  let pvjsonPoints;
  if (["StraightLine", "SegmentedLine"].indexOf(drawAs) > -1) {
    pvjsonPoints = explicitPoints;
  } else if (["ElbowLine", "CurvedLine"].indexOf(drawAs) > -1) {
    // pvjsonEdge.isAttachedTo refers to what the EDGE is fundamentally attached to.
    // pvjsonEdge.points[0].isAttachedTo refers to what the POINT is attached to.
    //
    // From the perspective of the biological meaning, the edge is always attached to
    // a regular node like a DataNode or Shape (maybe Label?) but never to an Anchor.
    //
    // From the perspective of the implementation of the graphics, we say the edge
    // has points, one or more of which can be connected to an Anchor.
    let sourceEntity;
    let targetEntity;
    if (pvjsonEdgeAttachedToCount === 2) {
      sourceEntity = referencedEntities[pvjsonEdgeIsAttachedTo[0]];
      targetEntity = referencedEntities[pvjsonEdgeIsAttachedTo[1]];
    } else if (pvjsonEdgeAttachedToCount === 1) {
      const firstPoint = explicitPoints[0];
      const lastPoint = explicitPoints[explicitPoints.length - 1];
      if (firstPoint.hasOwnProperty("isAttachedTo")) {
        sourceEntity = referencedEntities[pvjsonEdgeIsAttachedTo[0]];
      } else if (lastPoint.hasOwnProperty("isAttachedTo")) {
        targetEntity = referencedEntities[pvjsonEdgeIsAttachedTo[0]];
      } else {
        throw new Error(
          `edge "${pvjsonEdge.id}" is said to be attached to "${pvjsonEdge.isAttachedTo.join()}",
					but neither first nor last points have "isAttachedTo" property`
        );
      }
    }
    pvjsonPoints = calculateAllPoints(
      explicitPoints.map(point => new SmartPoint(point)),
      sourceEntity,
      targetEntity
    );
  } else {
    console.warn("Unknown edge drawAs: " + drawAs);
    pvjsonPoints = explicitPoints;
  }

  // TODO how do we distinguish between intermediate (not first or last) points that a user
  // has explicitly specified vs. intermediate points that are only implied?
  // Do we need to? I think once a user specifies any implicit points, they may all be
  // made explicit.
  // GPML currently does not specify implicit intermediate points, but
  // pvjson does.

  pvjsonEdge.points = pvjsonPoints;

  // TODO can I get rid of isAttachedToOrVia earlier?
  return omit(["isAttachedToOrVia"], pvjsonEdge);
}

//function recursivelyGetReferencedElements(acc, gpmlElement: GPMLElement) {
//	const { Graphics } = gpmlElement;
//	const graphRefIds: string[] = !!Graphics.Point &&
//		Graphics.Point[0]._exists !== false
//			? Graphics.Point.filter(P => isString(P.GraphRef)).map(P => P.GraphRef)
//			: gpmlElement.hasOwnProperty("GraphRef")
//				? arrayify(gpmlElement.GraphRef)
//				: [];
//
//				const referencedElementIds = arrayify(graphRefIds);
//				//const referencedElementIds = unionLSV(graphRefIds, gpmlElement.GroupRef);
//				return referencedElementIds.length === 0
//					? acc
//					: hl([
//						acc,
//						hl(referencedElementIds)
//						.flatMap(referencedElementId =>
//										 hl(getGPMLElementByGraphId(referencedElementId))
//										)
//										.flatMap(function(referencedElement: GPMLElement) {
//											return recursivelyGetReferencedElements(
//												hl([referencedElement]),
//												referencedElement
//											);
//										})
//					]).merge();
//}
//
//export function postprocessPVJSON(
//	pvjsonEdge: PvjsonEdge
//): Highland.Stream<PvjsonEdge> {
//	return hl([
//		hl([pvjsonEdge])
//		.reduce(hl([]), recursivelyGetReferencedElements)
//		.merge()
//		.flatMap(function(referencedGPMLElement: GPMLElement) {
//			return hl(
//				getPvjsonEntityLatestByGraphId(
//					referencedGPMLElement.GraphId
//				)
//			);
//		})
//	])
//	.merge()
//	.reduce({}, function(
//		acc: {
//			[key: string]: (PvjsonNode | PvjsonEdge);
//		},
//		referencedEntity: (PvjsonNode | PvjsonEdge)
//	) {
//		acc[referencedEntity.id] = referencedEntity;
//		return acc;
//	})
//	.map(function(referencedEntities) {
//		return process(pvjsonEdge, referencedEntities);
//	});
//	.merge();
//}
//
//export function createEdgeTransformStream(
//  processor,
//  edgeType: "Interaction" | "GraphicalLine"
//): (
//  s: Highland.Stream<GPML2013a.InteractionType | GPML2013a.GraphicalLineType>
//) => Highland.Stream<(PvjsonNode | PvjsonEdge)> {
//  const {
//    fillInGPMLPropertiesFromParent,
//    getGPMLElementByGraphId,
//    getPvjsonEntityLatestByGraphId,
//    ensureGraphIdExists,
//    preprocessGPMLElement,
//    processPropertiesAndType
//  } = processor;
//
//  function recursivelyGetReferencedElements(acc, gpmlElement: GPMLElement) {
//    const { Graphics } = gpmlElement;
//    const graphRefIds: string[] = !!Graphics.Point &&
//      Graphics.Point[0]._exists !== false
//      ? Graphics.Point.filter(P => isString(P.GraphRef)).map(P => P.GraphRef)
//      : gpmlElement.hasOwnProperty("GraphRef")
//        ? arrayify(gpmlElement.GraphRef)
//        : [];
//
//    const referencedElementIds = arrayify(graphRefIds);
//    //const referencedElementIds = unionLSV(graphRefIds, gpmlElement.GroupRef);
//    return referencedElementIds.length === 0
//      ? acc
//      : hl([
//          acc,
//          hl(referencedElementIds)
//            .flatMap(referencedElementId =>
//              hl(getGPMLElementByGraphId(referencedElementId))
//            )
//            .flatMap(function(referencedElement: GPMLElement) {
//              return recursivelyGetReferencedElements(
//                hl([referencedElement]),
//                referencedElement
//              );
//            })
//        ]).merge();
//  }
//
//  return function(s) {
//    return s
//      .map(preprocessGPMLElement)
//      .flatMap(function(
//        gpmlEdge: GPMLElement
//      ): Highland.Stream<Highland.Stream<PvjsonNode | PvjsonEdge>> {
//        const { Graphics } = gpmlEdge;
//
//        const gpmlAnchors = Graphics.hasOwnProperty("Anchor") &&
//          Graphics.Anchor &&
//          Graphics.Anchor[0] &&
//          Graphics.Anchor[0]._exists !== false
//          ? Graphics.Anchor.filter(a => a.hasOwnProperty("GraphId"))
//          : [];
//
//        const fillInGPMLPropertiesFromEdge = fillInGPMLPropertiesFromParent(
//          gpmlEdge
//        );
//
//        return hl([
//          hl([gpmlEdge])
//            .map(processPropertiesAndType(edgeType))
//            .flatMap(function(pvjsonEdge: PvjsonEdge) {
//              return hl([
//                hl([gpmlEdge])
//                  .reduce(hl([]), recursivelyGetReferencedElements)
//                  .merge()
//                  .flatMap(function(referencedGPMLElement: GPMLElement) {
//                    return hl(
//                      getPvjsonEntityLatestByGraphId(
//                        referencedGPMLElement.GraphId
//                      )
//                    );
//                  })
//              ])
//                .merge()
//                .reduce({}, function(
//                  acc: {
//                    [key: string]: (PvjsonNode | PvjsonEdge);
//                  },
//                  referencedEntity: (PvjsonNode | PvjsonEdge)
//                ) {
//                  acc[referencedEntity.id] = referencedEntity;
//                  return acc;
//                })
//                .map(function(referencedEntities) {
//                  return process(pvjsonEdge, referencedEntities);
//                });
//            }),
//          hl(gpmlAnchors)
//            .map(preprocessGPMLElement)
//            .map(function(gpmlAnchor: GPMLElement) {
//              const filledInAnchor = fillInGPMLPropertiesFromEdge(gpmlAnchor);
//              filledInAnchor.GraphRef = gpmlEdge.GraphId;
//              return filledInAnchor;
//            })
//            .map(processPropertiesAndType("Anchor"))
//            .map(function(pvjsonAnchor: PvjsonNode): PvjsonNode {
//              const drawAnchorAs = pvjsonAnchor.drawAs;
//              if (drawAnchorAs === "None") {
//                defaultsDeep(pvjsonAnchor, {
//                  Height: 4,
//                  Width: 4
//                });
//              } else if (drawAnchorAs === "Circle") {
//                defaultsDeep(pvjsonAnchor, {
//                  Height: 8,
//                  Width: 8
//                });
//              }
//              return pvjsonAnchor;
//            })
//        ]);
//      })
//      .merge();
//  };
//}
