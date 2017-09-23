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
  AttachablePoint,
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
 * getOffsetAndOrientationScalarsAlongAxis
 *
 * @param relValue {number}
 * @param axis {string}
 * @param referencedEntity
 * @return {OffsetOrientationAndPositionScalarsAlongAxis}
 */
function getOffsetAndOrientationScalarsAlongAxis(
  positionScalar: number,
  relativeOffsetScalar: number,
  axis: "x" | "y",
  // TODO are we correctly handling the case of a group as the referenced
  // entity? Do we have the group width and height yet to properly calculate
  // this?
  referencedEntity: PvjsonNode
): OffsetOrientationAndPositionScalarsAlongAxis {
  const offsetScalar =
    relativeOffsetScalar *
    (axis === "x" ? referencedEntity.width : referencedEntity.height);

  // orientationScalar here refers to the initial direction the edge takes as
  // it moves away from the entity to which it is attached.
  let orientationScalar;
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
  const providedPvjsonPoints = map(function(
    point: AttachablePoint & { marker: string }
  ) {
    const { marker, x, y } = point;

    if (!!marker) {
      // NOTE: side effects below
      if (index === 0) {
        pvjsonEdge.markerStart = marker;
      } else if (index === pointCount - 1) {
        pvjsonEdge.markerEnd = marker;
      }
    }

    if (isAttachablePoint(point)) {
      // NOTE: pvjson allows for expressing one edge attached to another edge.
      // When we do this, we say that the POINT attaches to an ANCHOR on the other edge,
      // but the EDGE attaches to the other EDGE, never the anchor.
      const { isAttachedTo, attachmentDisplay } = point;

      if (!attachmentDisplay.offset) {
        throw new Error("point attachmentDisplay missing offset");
      }

      // entityReferencedByPoint can be a regular node (DataNode, Shape, Label)
      // or an Anchor. If connected to an Anchor, the biological meaning is
      // that the edge is connected to another edge, but in this code, we
      // implement this by treating the Anchor as a node, as if it were
      // a "burr" that is always stuck (isAttachedTo) the other edge.
      const entityReferencedByPoint =
        referencedEntities &&
        !!isAttachedTo &&
        (referencedEntities[isAttachedTo] as PvjsonNode);

      const entityIdReferencedByEdge = isGPMLAnchor(entityReferencedByPoint)
        ? entityReferencedByPoint.isAttachedTo
        : entityReferencedByPoint.id;

      // WARNING: side effect
      pvjsonEdgeIsAttachedTo.push(entityIdReferencedByEdge);

      const entityReferencedByEdge =
        referencedEntities[entityIdReferencedByEdge];

      const orientation = (point.orientation =
        point.orientation || ([] as Orientation));

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
        const { position, relativeOffset } = attachmentDisplay;
        // edge connected to a SingleFreeNode, a Group or a Burr, but NOT another edge or an anchor
        const {
          offsetScalar: offsetScalarX,
          orientationScalar: orientationScalarX
        } = getOffsetAndOrientationScalarsAlongAxis(
          position[0],
          relativeOffset[0],
          "x",
          entityReferencedByEdge
        );
        if (!isFinite(offsetScalarX) || !isFinite(orientationScalarX)) {
          throw new Error(
            `Expected finite values for offsetScalarX ${offsetScalarX} and orientationScalarX ${orientationScalarX}`
          );
        }
        const {
          offsetScalar: offsetScalarY,
          orientationScalar: orientationScalarY
        } = getOffsetAndOrientationScalarsAlongAxis(
          position[1],
          relativeOffset[1],
          "y",
          entityReferencedByEdge
        );
        if (!isFinite(offsetScalarY) || !isFinite(orientationScalarY)) {
          throw new Error(
            `Expected finite values for offsetScalarY ${offsetScalarY} and orientationScalarY ${orientationScalarY}`
          );
        }

        orientation[0] = orientationScalarX;
        orientation[1] = orientationScalarY;
        /* TODO what was this below? Can we delete it?
        if (index === 0) {
          orientation[0] = orientationScalarX;
          orientation[1] = orientationScalarY;
        } else {
          orientation[0] = -1 * orientationScalarX;
          orientation[1] = -1 * orientationScalarY;
        }
				//*/

        // TODO is there a case where we would ever use offset for edges?
        attachmentDisplay.offset[0] = offsetScalarX;
        attachmentDisplay.offset[1] = offsetScalarY;
        point.attachmentDisplay = omit(["relativeOffset"], attachmentDisplay);
      } else if (isGPMLAnchor(entityReferencedByPoint)) {
        // edge is connected to another edge via an anchor
        point.attachmentDisplay.position =
          entityReferencedByPoint.attachmentDisplay.position;
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

    return omit(["marker"], point);
  }, points);

  const pvjsonEdgeAttachedToCount = pvjsonEdgeIsAttachedTo.length;
  if (pvjsonEdgeAttachedToCount > 0) {
    pvjsonEdge.isAttachedTo = pvjsonEdgeIsAttachedTo;
  }

  let allPvjsonPoints;
  if (["StraightLine", "SegmentedLine"].indexOf(drawAs) > -1) {
    allPvjsonPoints = providedPvjsonPoints;
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
      const firstPoint = providedPvjsonPoints[0];
      const lastPoint = providedPvjsonPoints[providedPvjsonPoints.length - 1];
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
    allPvjsonPoints = calculateAllPoints(
      providedPvjsonPoints.map(point => new SmartPoint(point)),
      sourceEntity,
      targetEntity
    );
  } else {
    console.warn("Unknown edge drawAs: " + drawAs);
    allPvjsonPoints = providedPvjsonPoints;
  }

  // TODO how do we distinguish between intermediate (not first or last) points that a user
  // has explicitly specified vs. intermediate points that are only implied?
  // Do we need to? I think once a user specifies any implicit points, they may all be
  // made explicit.
  // GPML currently does not specify implicit intermediate points, but
  // pvjson does.

  pvjsonEdge.points = allPvjsonPoints;

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
