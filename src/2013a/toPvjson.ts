import "source-map-support/register";
// TODO should I get rid of the lib above for production browser build?

import { assign as assignM } from "lodash";
import {
  assign,
  assignAll,
  compact,
  concat,
  curry,
  defaults,
  difference,
  findIndex,
  flatten,
  flow,
  intersection,
  isArray,
  isEmpty,
  isObject,
  map,
  omit,
  partition,
  reduce,
  sortBy,
  startCase,
  toPairsIn,
  values
} from "lodash/fp";
import * as hl from "highland";
import * as VError from "verror";

import { CXMLXPath } from "../spinoffs/cxml-xpath";
import {
  InteractionType,
  PvjsonNode,
  PvjsonSingleFreeNode,
  PvjsonBurr,
  PvjsonEdge,
  PvjsonGroup,
  PvjsonEntity,
  GraphicalLineType,
  GPMLElement,
  Pathway,
  PathwayStarter,
  PvjsonEntitiesById,
  PvjsonPublicationXref,
  PvjsonInteraction
} from "../gpml2pvjson";

import * as GPML2013a from "../../xmlns/pathvisio.org/GPML/2013a";

import * as GPMLDefaults from "../GPMLDefaults";

import { Processor } from "../Processor";
import {
  preprocessGPML as preprocessEdgeGPML,
  postprocessPVJSON as postprocessEdgePVJSON
} from "../edge/edge";
import {
  preprocessGPML as preprocessGroupGPML,
  postprocessPVJSON as postprocessGroupPVJSON
} from "../group";
import {
  arrayify,
  generatePublicationXrefId,
  insertIfNotExists,
  isDefinedCXML,
  isPvjsonBurr,
  isPvjsonEdge,
  isPvjsonGroup,
  isPvjsonSingleFreeNode,
  isPvjsonNode,
  isPvjsonEdgeOrBurr,
  sortByMap,
  supportedNamespaces,
  unionLSV
} from "../gpml-utilities";
import * as VOCABULARY_NAME_TO_IRI from "../spinoffs/VOCABULARY_NAME_TO_IRI.json";

import * as GPML2013aKeyMappings from "./KeyMappings.json";
import * as GPML2013aKeyValueMappings from "./KeyValueConverters";
import * as GPML2013aValueMappings from "./ValueMappings.json";
import * as GPML2013aValueConverters from "./ValueConverters";

// TODO get text alignment correctly mapped to Box Model CSS terms

import * as iassign from "immutable-assign";
iassign.setOption({
  // Deep freeze both input and output. Used in development to make sure they don't change.
  // TODO watch issue and re-enable when addressed: https://github.com/engineforce/ImassignM/issues/11
  //freeze: true,
  ignoreIfNoChange: true
});

interface SortUnsortedAcc {
  sortedIds: string[];
  unsorted: (PvjsonNode | PvjsonEdge)[];
}
interface ReferencedEntitiesMap {
  [key: string]: PvjsonNode | PvjsonEdge;
}

export const RECURSION_LIMIT = 1000;

function partitionStream<T>(
  s: Highland.Stream<T>,
  partitioner: (x: T) => boolean
): [Highland.Stream<T>, Highland.Stream<T>] {
  const yes = s.fork().filter(x => partitioner(x));
  const no = s.fork().filter(x => !partitioner(x));
  return [yes, no];
}

function extendDeep(targetOrTargetArray, source) {
  const target = isArray(targetOrTargetArray)
    ? targetOrTargetArray[0]
    : targetOrTargetArray;
  // TODO: We run into problems if we try to extend both
  // GraphicalLine and Interaction, because they share
  // EdgeGraphicsType. To avoid an infinite recursion of
  // extending, I'm using a short-term solution of just
  // marking whether a target has been extended, and
  // if so, skipping it.
  // Look into a better way of handling this.
  if (!target.hasOwnProperty("_extended")) {
    toPairsIn(target)
      .filter(
        ([targetKey, targetValue]) =>
          source.hasOwnProperty(targetKey) && isObject(source[targetKey])
      )
      .forEach(function([targetKey, targetValue]) {
        extendDeep(targetValue, source[targetKey]);
      });
    assignM(target.constructor.prototype, source);
    target._extended = true;
  }
}

const stringifyKeyValue = curry(function(source, key) {
  return source.hasOwnProperty(key)
    ? startCase(key) + ": " + source[key]
    : null;
});

extendDeep(
  GPML2013a.document.Pathway.constructor.prototype,
  GPMLDefaults.Pathway
);
extendDeep(GPML2013a.DataNodeType.prototype, GPMLDefaults.DataNode);
extendDeep(GPML2013a.GraphicalLineType.prototype, GPMLDefaults.GraphicalLine);
extendDeep(GPML2013a.GroupType.prototype, GPMLDefaults.Group);
extendDeep(GPML2013a.InteractionType.prototype, GPMLDefaults.Interaction);
extendDeep(GPML2013a.LabelType.prototype, GPMLDefaults.Label);
extendDeep(GPML2013a.ShapeType.prototype, GPMLDefaults.Shape);
extendDeep(GPML2013a.StateType.prototype, GPMLDefaults.State);
extendDeep(GPML2013a.EdgeGraphicsType.prototype.Anchor, GPMLDefaults.Anchor);

// TODO specify types
export function toPvjson(
  inputStreamWithMessedUpRDFIDs: NodeJS.ReadableStream,
  pathwayIri?: string
) {
  // NOTE: GPML2013a incorrectly uses "rdf:id" instead of "rdf:ID".
  // We need to fix this error so that CXML can process the GPML.
  const inputStream = hl(inputStreamWithMessedUpRDFIDs)
    .splitBy(' rdf:id="')
    .intersperse(' rdf:ID="');

  const selectorToCXML = {
    // TODO why does TS require that we use the Pathway's "constructor.prototype"
    // instead of just the Pathway?
    // Why does Pathway.Graphics not need that?
    // Why do many of the other require using the prototype?
    //
    "/Pathway/@*": GPML2013a.document.Pathway.constructor.prototype,
    "/Pathway/Comment": GPML2013a.document.Pathway.Comment[0],
    "/Pathway/Graphics/@*": GPML2013a.document.Pathway.Graphics,
    "/Pathway/DataNode": GPML2013a.DataNodeType.prototype,
    "/Pathway/State": GPML2013a.StateType.prototype,
    "/Pathway/Interaction": GPML2013a.InteractionType.prototype,
    "/Pathway/GraphicalLine": GPML2013a.GraphicalLineType.prototype,
    "/Pathway/Label": GPML2013a.LabelType.prototype,
    "/Pathway/Shape": GPML2013a.ShapeType.prototype,
    "/Pathway/Group": GPML2013a.GroupType.prototype,
    "/Pathway/InfoBox": GPML2013a.InfoBoxType.prototype,
    "/Pathway/Legend": GPML2013a.LegendType.prototype,
    "/Pathway/Biopax/bp:PublicationXref":
      GPML2013a.document.Pathway.Biopax.PublicationXref[0],
    "/Pathway/Biopax/bp:openControlledVocabulary":
      GPML2013a.document.Pathway.Biopax.openControlledVocabulary[0]
  };

  const cxmlXPath = new CXMLXPath(inputStream, GPML2013a, {
    bp: "http://www.biopax.org/release/biopax-level3.owl#"
    //rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  });

  const cxmlSources = cxmlXPath.parse(selectorToCXML);

  const processor = new Processor(
    GPML2013aKeyMappings,
    GPML2013aKeyValueMappings,
    GPML2013aValueMappings,
    GPML2013aValueConverters
  );
  const {
    fillInGPMLPropertiesFromParent,
    getPvjsonEntityLatestByGraphId,
    graphIdsByGraphRef,
    graphIdToZIndex,
    getGPMLElementByGraphId,
    preprocessGPMLElement,
    processGPMLAndPropertiesAndType,
    processProperties,
    processPropertiesAndType,
    setPvjsonEntity
  } = processor;

  if (pathwayIri) {
    processor.output = iassign(
      processor.output,
      function(o) {
        return o.pathway;
      },
      function(pathway) {
        pathway.id = pathwayIri;
        return pathway;
      }
    );
  }

  const sortByZIndex = sortByMap(graphIdToZIndex);

  const pathwayMetadataStream = hl([
    cxmlSources["/Pathway/@*"].doto(function(pathway) {
      if (supportedNamespaces.indexOf(pathway._namespace) === -1) {
        // TODO should we do anything further?
        throw new Error(`Unsupported namespace: ${pathway._namespace}`);
      }
    }),
    cxmlSources["/Pathway/Graphics/@*"]
  ])
    .merge()
    .map(processProperties)
    .reduce({} as Record<string, any>, function(acc, metadataChunk) {
      return assign(acc, metadataChunk);
    })
    // there should only be one item through this last step
    .map(function(metadata: Record<string, any>) {
      processor.output = iassign(
        processor.output,
        function(o) {
          return o.pathway;
        },
        function(pathway): Pathway {
          const mergedPathway = assign(pathway, metadata);
          // NOTE: GPML schema specifies that name is required
          const { name } = mergedPathway;
          const splitName = name.split(" (");
          if (
            !!splitName &&
            splitName.length === 2 &&
            !!name.match(/\(/g) &&
            name.match(/\(/g).length === 1 &&
            !!name.match(/\)/g) &&
            name.match(/\)/g).length === 1
          ) {
            mergedPathway.standardName = splitName[0];
            mergedPathway.displayName = splitName[1].replace(")", "");
          } else {
            mergedPathway.standardName = name;
            mergedPathway.displayName = name;
          }

          mergedPathway.textContent = "";
          mergedPathway.textContent += mergedPathway.hasOwnProperty("name") ? mergedPathway["name"] : "";
          if (!!mergedPathway.id) {
            mergedPathway.textContent += " (" + mergedPathway.id + ")";
          }

          const context: (string | Record<string, any>)[] = [
            "https://cdn.rawgit.com/wikipathways/WpVocabularies/7a46a05/contexts/pvjs.jsonld"
          ];
          if (!!mergedPathway.id) {
            context.push({
              "@base": mergedPathway.id + "/"
            });
          } else {
            // If there's no pathway IRI specified, we at least give the user a URL
            // to search WikiPathways. This way, the user at least has a chance of
            // to search WikiPathways to possibly find the source for this data.

            // NOTE: GPML schema specifies that organism is optional
            const organismIriComponent = mergedPathway.hasOwnProperty(
              "organism"
            )
              ? `&species=${mergedPathway.organism}`
              : "";
            mergedPathway.isSimilarTo = encodeURI(
              `http://wikipathways.org/index.php/Special:SearchPathways?query=${name}${organismIriComponent}&doSearch=1`
            );
          }

          return assign(
            {
              "@context": context
            },
            mergedPathway
          ) as Pathway;
        }
      );
      return processor.output;
    })
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing pathwayMetadataStream
				`
      );
    });

  const pathwayCommentStream = hl(cxmlSources["/Pathway/Comment"]).map(function(
    Comment
  ) {
    processor.output = iassign(
      processor.output,
      function(o) {
        return o.pathway;
      },
      function(pathway) {
        const comments = pathway.comments || [];
        comments.push(processProperties(Comment) as any);
        pathway.comments = comments;
        return pathway;
      }
    );
    return processor.output;
  });

  const dataNodeStream = cxmlSources["/Pathway/DataNode"]
    .map(processGPMLAndPropertiesAndType("DataNode"))
    .map(function(entity: PvjsonSingleFreeNode & any) {
      // TODO fix type def for unionLSV so I don't have to use "as"
      entity.type = unionLSV(entity.type, entity.wpType) as string[];
      return entity;
    });

  const stateStream = cxmlSources["/Pathway/State"]
    .map(preprocessGPMLElement)
    .flatMap(function(gpmlState) {
      return hl(getGPMLElementByGraphId(gpmlState.GraphRef)).map(function(
        gpmlDataNode
      ) {
        return fillInGPMLPropertiesFromParent(gpmlDataNode, gpmlState);
      });
    })
    .map(processPropertiesAndType("State"));

  const shapeStream = cxmlSources["/Pathway/Shape"]
    .map(processGPMLAndPropertiesAndType("Shape"))
    .map(function(pvjsonEntity: PvjsonSingleFreeNode & any) {
      const { cellularComponent } = pvjsonEntity;
      // CellularComponent is not a BioPAX term, but "PhysicalEntity" is.
      if (!!cellularComponent) {
        pvjsonEntity.type = unionLSV(
          pvjsonEntity.type,
          "PhysicalEntity",
          "CellularComponent",
          cellularComponent
        ) as string[];
      }
      return pvjsonEntity;
    });

  const labelStream = cxmlSources["/Pathway/Label"].map(
    processGPMLAndPropertiesAndType("Label")
  );

  const gpmlInteractionStream = cxmlSources["/Pathway/Interaction"].map(
    preprocessGPMLElement
  );
  const gpmlGraphicalLineStream = cxmlSources["/Pathway/GraphicalLine"].map(
    preprocessGPMLElement
  );
  const edgeStream = hl([
    gpmlInteractionStream
      .fork()
      .map(preprocessEdgeGPML)
      .map(processPropertiesAndType("Interaction")),
    gpmlGraphicalLineStream
      .fork()
      .map(preprocessEdgeGPML)
      .map(processPropertiesAndType("GraphicalLine"))
  ]).merge() as Highland.Stream<PvjsonEdge>;

  const anchorStream = hl([
    gpmlInteractionStream.fork(),
    gpmlGraphicalLineStream.fork()
  ])
    .merge()
    .filter(function(gpmlEdge: GPMLElement) {
      return (
        isDefinedCXML(gpmlEdge.Graphics) &&
        isDefinedCXML(gpmlEdge.Graphics.Anchor)
      );
    })
    .flatMap(function(gpmlEdge: GPMLElement): Highland.Stream<PvjsonBurr> {
      const { GraphId, Graphics } = gpmlEdge;
      const fillInGPMLPropertiesFromEdge = fillInGPMLPropertiesFromParent(
        gpmlEdge
      );

      const gpmlAnchors = Graphics.Anchor;
      return hl(gpmlAnchors)
        .map(function(gpmlAnchor: GPMLElement) {
          const anchorShape = gpmlAnchor.Shape;
          if (anchorShape === "None") {
            // NOTE: For Anchors with Shape="None", PathVisio-Java displays
            // the anchor as a 4x4 square when nothing is connected,
            // but does not display it when something is connected.
            // TODO: right now, PathVisio-Java writes out GPML such that the
            // Anchor only has a GraphId when an Edge connects to this Anchor,
            // but we may not be able to rely on this in the future.
            if (isDefinedCXML(gpmlAnchor.GraphId)) {
              assignM(gpmlAnchor.Graphics, {
                Height: 0,
                Width: 0
              });
            } else {
              gpmlAnchor.Shape = "Rectangle";
              assignM(gpmlAnchor.Graphics, {
                Height: 4,
                Width: 4
              });
            }
          } else if (anchorShape === "Circle") {
            assignM(gpmlAnchor.Graphics, {
              Height: 8,
              Width: 8
            });
          } else {
            throw new Error(`Anchor Shape "${anchorShape}" is not supported.`);
          }

          return gpmlAnchor;
        })
        .map(preprocessGPMLElement)
        .map(function(gpmlAnchor: GPMLElement) {
          const filledInAnchor = fillInGPMLPropertiesFromEdge(gpmlAnchor);
          filledInAnchor.GraphRef = GraphId;
          return filledInAnchor;
        })
        .map(processPropertiesAndType("Anchor")) as Highland.Stream<PvjsonBurr>;
    });

  const groupStream: Highland.Stream<PvjsonGroup> = cxmlSources[
    "/Pathway/Group"
  ]
    .map(preprocessGroupGPML(processor))
    // PathVisio shouldn't do this, but it sometimes makes empty Groups.
    // We filter them out here.
    .filter((Group: GPMLElement) => !!Group.Contains)
    .map(processGPMLAndPropertiesAndType("Group")) as Highland.Stream<
    PvjsonGroup
  >;

  const EDGES = ["Interaction", "GraphicalLine"];
  const NODES = ["DataNode", "Shape", "Label", "State", "Group"];

  function postprocessAll(
    s
  ): Highland.Stream<PvjsonSingleFreeNode | PvjsonEdge> {
    /*
    // We are sorting the elements by the order in which we must do their
    // post-processing, e.g., if one edge is attached to another edge via
    // an anchor, we must post-process the edge with the anchor before we
    // post-process the other edge.
    const isProcessableTests = [
      curry(function(sortedIds: string[], pvjsonEntity: PvjsonEntity) {
        // In this test, we ensure the entity
        // 1) is not a group AND
        // 2) is not attached to a group and not to an edge
        //    (ie., it is not attached to anything, or
        //     it is attached to something, but that something is neither a group nor an edge)

        return (
          pvjsonEntity.gpmlElementName !== "Group" &&
          unionLSV(
            pvjsonEntity["isAttachedToOrVia"],
            pvjsonEntity["isAttachedTo"]
          )
            .map(
              (isAttachedToOrViaId: string) =>
                processor.output.entitiesById[isAttachedToOrViaId].gpmlElementName
            )
            .filter(
              // Entity is attached to neither a group nor an edge.
              // (Testing that entity is not attached to an edge at all,
              //  whether directly or indirectly via an anchor.)
              isAttachedToOrViaGpmlElementName =>
                ["Group", "Interaction", "GraphicalLine", "Anchor"].indexOf(
                  isAttachedToOrViaGpmlElementName
                ) > -1
            ).length === 0
        );
      }),
      curry(function(sortedIds: string[], pvjsonEntity: PvjsonEntity) {
        const gpmlElementName = pvjsonEntity.gpmlElementName;
        if (
          ["Interaction", "GraphicalLine", "State", "Anchor"].indexOf(
            gpmlElementName
          ) > -1
        ) {
          // This entity is an edge, a state or an anchor.
          // All entities to which this entity is attached must be processable
          // before it is itself processable.
          // That means all entities to which this entity is attached to must
          // be processed before it can be processed.
          const isAttachedToIds = unionLSV(
            pvjsonEntity["isAttachedTo"],
            pvjsonEntity["isAttachedToOrVia"]
          ) as string[];
          const isAttachedToInSortedIds = isAttachedToIds.filter(
            // entity with this id is sortedIds
            isAttachedToId => sortedIds.indexOf(isAttachedToId) > -1
          );
          return isAttachedToIds.length === isAttachedToInSortedIds.length;
        } else if (gpmlElementName === "Group") {
          // is processable when group does not contain an entity that is not processable
          return (
            arrayify(pvjsonEntity["contains"])
              .map(isAttachedToId => processor.output.entitiesById[isAttachedToId])
              .filter(
                candidateEntity => sortedIds.indexOf(candidateEntity.id) > -1
              ).length > 0
          );
        }
      })
    ];
		//*/

    function sortUnsortedRecursive(
      { sortedIds, unsorted }: SortUnsortedAcc,
      i = 0
    ) {
      // TODO is there something better we can do than use RECURSION_LIMIT?
      // WP2037 revision 90015 won't terminate without a limit, but converts
      // OK with the limit set.
      if (unsorted.length === 0 || i > RECURSION_LIMIT) {
        return { sortedIds, unsorted };
      }
      i += 1;
      return sortUnsortedRecursive(
        sortUnsortedOnce({ sortedIds, unsorted }),
        i
      );
    }

    function sortUnsortedOnce({ sortedIds, unsorted }: SortUnsortedAcc) {
      let [sortedOnThisIteration, stillUnsorted] = partition(function(
        pvjsonEntity
      ) {
        const dependencies = unionLSV(
          pvjsonEntity["contains"],
          pvjsonEntity["isAttachedToOrVia"],
          pvjsonEntity["isAttachedTo"]
        );

        return (
          /*
          dependencies
            .map((id: string) => processor.output.entitiesById[id])
            .indexOf(undefined) === -1 &&
					//*/
          intersection(dependencies, sortedIds).length === dependencies.length
        );
      },
      unsorted);

      sortedOnThisIteration
        /*
				.map(function(pvjsonEntity) {
					const testIndex = findIndex(function(isProcessableTest) {
						return isProcessableTest(sortedIds, pvjsonEntity);
					}, isProcessableTests);
					return { testIndex, pvjsonEntity };
				})
				.sort(function(a, b) {
					if (a.testIndex < b.testIndex) {
						return -1;
					} else if (a.testIndex > b.testIndex) {
						return 1;
					} else {
						return 0;
					}
				})
        .map(x => x["pvjsonEntity"]["id"])
				//*/
        .forEach(function(pvjsonEntity) {
          sortedIds.push(pvjsonEntity.id);
        });

      return {
        sortedIds: sortedIds,
        unsorted: stillUnsorted
      };
    }

    return (
      s
        // TODO should we use scan and debounce here to pipe out the in-progress
        // pvjson as it's being converted?
        .reduce(
          {
            sortedIds: [],
            unsorted: []
          },
          function(
            { sortedIds, unsorted }: SortUnsortedAcc,
            pvjsonEntity: PvjsonNode | PvjsonEdge
          ) {
            unsorted.push(pvjsonEntity);
            return sortUnsortedOnce({ sortedIds, unsorted });
          }
        )
        .map(sortUnsortedRecursive)
        .map(function(acc: SortUnsortedAcc) {
          const { sortedIds, unsorted } = acc;
          return sortedIds
            .map(
              (id: string): PvjsonEntity => processor.output.entitiesById[id]
            )
            .concat(unsorted);
        })
        .sequence()
    );
  }

  const pvjsonEntityStream = hl([
    hl([dataNodeStream, stateStream, shapeStream, labelStream]).merge(),
    hl([edgeStream, anchorStream] as Highland.Stream<
      PvjsonNode | PvjsonEntity
    >[]).merge(),
    groupStream
  ])
    .sequence()
    // TODO should this be happening BEFORE the postprocessing step?
    .doto(setPvjsonEntity)
    .through(postprocessAll)
    .flatMap(function(
      pvjsonEntity: PvjsonNode | PvjsonEdge
    ): Highland.Stream<
      | {
          pathway: Pathway | PathwayStarter;
          entitiesById: PvjsonEntitiesById;
        }
      | Error
    > {
      const { id, zIndex } = pvjsonEntity;

      // TODO we might want to sort by other criteria, such as
      // to order a State above its DataNode, which would be
      // ordered above its Group, if any
      const insertEntityIdAndSortByZIndex = flow([
        insertIfNotExists(id),
        sortByZIndex
      ]);

      let finalSortedStream;
      if (isPvjsonEdgeOrBurr(pvjsonEntity)) {
        const isAttachedTo = pvjsonEntity.isAttachedTo;
        arrayify(isAttachedTo).forEach(function(graphRef: string) {
          const graphRefs = graphIdsByGraphRef[graphRef] || [];
          if (graphRefs.indexOf(id) === -1) {
            graphRefs.push(id);
          }
          graphIdsByGraphRef[graphRef] = graphRefs;
        });

        if (isPvjsonBurr(pvjsonEntity)) {
          finalSortedStream = hl(
            getPvjsonEntityLatestByGraphId(isAttachedTo)
          ).map(function(
            referencedEntity: PvjsonSingleFreeNode | PvjsonGroup | PvjsonEdge
          ) {
            if (isPvjsonNode(referencedEntity)) {
              const { attachmentDisplay } = pvjsonEntity;
              const [
                relativeOffsetScalarX,
                relativeOffsetScalarY
              ] = attachmentDisplay.relativeOffset;
              attachmentDisplay.offset = [
                relativeOffsetScalarX * referencedEntity.width,
                relativeOffsetScalarY * referencedEntity.height
              ];
              pvjsonEntity.attachmentDisplay = omit(
                ["relativeOffset"],
                attachmentDisplay
              );
            }
            setPvjsonEntity(pvjsonEntity);

            // NOTE: burrs are not added to the property "contained".
            // Rather, they are added to the property "burrs".
            referencedEntity.burrs = referencedEntity.burrs || [];
            insertEntityIdAndSortByZIndex(referencedEntity.burrs);
            setPvjsonEntity(referencedEntity);

            return processor.output;
          });
        } else if (isPvjsonEdge(pvjsonEntity)) {
          try {
            const pvjsonEdge = postprocessEdgePVJSON(
              processor.output.entitiesById as {
                [key: string]: PvjsonNode | PvjsonEdge;
              },
              pvjsonEntity
            );
            processor.output = iassign(
              processor.output,
              function(o) {
                return o.pathway.contains;
              },
              insertEntityIdAndSortByZIndex
            );

            setPvjsonEntity(pvjsonEdge);

            finalSortedStream = hl([processor.output]);
          } catch (err) {
            return hl.fromError(err);
          }
        } else {
          return hl.fromError(
            new VError(
              `
		Unexpected entity type.
		Only Edge or Burr should return true for
		isPvjsonEdgeOrBurr(
			${JSON.stringify(pvjsonEntity, null, "  ")}
		)
		`
            )
          );
        }
      } else if (isPvjsonGroup(pvjsonEntity)) {
        // We still have some GPML files with empty Groups and/or nested Groups
        // floating around, but we don't process them, because that's a
        // curation issue, not a gpml2pvjson issue.
        const containedCount = pvjsonEntity.contains.length;
        if (containedCount === 0 || pvjsonEntity.hasOwnProperty("groupRef")) {
          if (containedCount === 0) {
            return hl.fromError(
              new Error(
                `
		Encountered empty Group:
		${JSON.stringify(pvjsonEntity, null, "  ")}
		`
              )
            );
          }
          if (pvjsonEntity.hasOwnProperty("groupRef")) {
            return hl.fromError(
              new Error(
                `
		Encountered nested Group:
		${JSON.stringify(pvjsonEntity, null, "  ")}
		`
              )
            );
          }
          finalSortedStream = hl([processor.output]);
        } else {
          const graphIdOfGroup = pvjsonEntity.id;
          try {
            finalSortedStream = hl(
              pvjsonEntity.contains.map(
                containedId => processor.output.entitiesById[containedId]
              )
            )
              .filter(groupedEntity => groupedEntity.kaavioType !== "Group")
              .collect()
              .map(function(
                groupedEntities: (PvjsonSingleFreeNode | PvjsonEdge)[]
              ): PvjsonGroup {
                const pvjsonGroup = postprocessGroupPVJSON(
                  groupedEntities,
                  pvjsonEntity
                );
                const graphIdToZIndex = processor.graphIdToZIndex;
                pvjsonGroup.contains = sortBy(
                  [
                    function(thisEntityId) {
                      return graphIdToZIndex[thisEntityId];
                    }
                  ],
                  groupedEntities.map(x => x.id)
                );

                const { id, x, y } = pvjsonGroup;

                const groupedEntitiesFinal = groupedEntities.map(function(
                  groupedEntity
                ) {
                  if (isPvjsonEdge(groupedEntity)) {
                    groupedEntity.points = map(function(point) {
                      point.x -= x;
                      point.y -= y;
                      return point;
                    }, groupedEntity.points);
                  } else if (isPvjsonSingleFreeNode(groupedEntity)) {
                    groupedEntity.height;
                    groupedEntity.x -= x;
                    groupedEntity.y -= y;
                  } else {
                    return hl.fromError(
                      new Error(
                        `
			Encountered unexpected entity
			${JSON.stringify(groupedEntity, null, "  ")}
			in Group
			${JSON.stringify(pvjsonGroup, null, "  ")}
			`
                      )
                    );
                  }
                  // NOTE: this is needed for GPML2013a, because GPML2013a uses both
                  // GroupId/GroupRef and GraphId/GraphRef. GPML2017 uses a single
                  // identifier per entity. That identifier can be referenced by
                  // GroupRef and/or GraphRef. Pvjson follows GPML2017 in this, so
                  // we convert from GPML2013a format:
                  //   GroupRef="GROUP_ID_VALUE"
                  // to pvjson format:
                  //   {isPartOf: "GRAPH_ID_VALUE"}
                  groupedEntity.isPartOf = id;
                  return omit(["groupRef"], groupedEntity);
                });

                groupedEntitiesFinal.forEach(function(pvjsonEntity) {
                  setPvjsonEntity(pvjsonEntity);
                });

                setPvjsonEntity(pvjsonGroup);

                processor.output = iassign(
                  processor.output,
                  function(o) {
                    return o.pathway.contains;
                  },
                  function(contains) {
                    return insertEntityIdAndSortByZIndex(
                      difference(
                        contains,
                        groupedEntitiesFinal.map(x => x["id"])
                      ),
                      id
                    );
                  }
                );

                return pvjsonGroup;
              })
              .map(function(pvjsonEntity) {
                return processor.output;
              });
          } catch (err) {
            return hl.fromError(err);
          }
        }
      } else {
        setPvjsonEntity(pvjsonEntity);
        processor.output = iassign(
          processor.output,
          function(o) {
            return o.pathway.contains;
          },
          insertEntityIdAndSortByZIndex
        );
        finalSortedStream = hl([processor.output]);
      }

      return finalSortedStream;
    });

  pvjsonEntityStream
    .observe()
    .last()
    .doto(function() {
      processor.pvjsonEntityLatestStream.end();
    });

  const openControlledVocabularyStream = hl(
    cxmlSources["/Pathway/Biopax/bp:openControlledVocabulary"]
  )
    .map(processPropertiesAndType("openControlledVocabulary"))
    .map(function(openControlledVocabulary: Record<string, any>) {
      const vocabularyName = openControlledVocabulary.ontology;
      let vocabularyIRI = VOCABULARY_NAME_TO_IRI[vocabularyName];
      if (!vocabularyIRI) {
        return hl.fromError(
          new Error(
            `
		Encountered unexpected name "${vocabularyName}" for openControlledVocabulary,
		with xrefIdentifier "${openControlledVocabulary.xrefIdentifier}"
		`
          )
        );
        /* TODO should we use this?
        vocabularyIRI = `http://www.ebi.ac.uk/miriam/main/search?query=${vocabularyName.replace(
          /\ /,
          "+"
        )}#`;
				//*/
      }
      openControlledVocabulary.id =
        vocabularyIRI + openControlledVocabulary.xrefIdentifier;
      return openControlledVocabulary;
    })
    .collect()
    .map(function(openControlledVocabularies: Record<string, any>) {
      // TODO should these go through the processor instead?

      processor.output = iassign(processor.output, function(o) {
        const { pathway, entitiesById } = o;

        openControlledVocabularies.forEach(function(openControlledVocabulary) {
          const { id } = openControlledVocabulary;
          entitiesById[id] = openControlledVocabulary;
          if (openControlledVocabulary.ontology === "Pathway Ontology") {
            pathway.type.push(id);
          }
        });

        return o;
      });
      return processor.output;
    });

  const publicationXrefStream = hl(
    cxmlSources["/Pathway/Biopax/bp:PublicationXref"]
  )
    .map(processPropertiesAndType("PublicationXref"))
    .collect()
    .map(function(publicationXrefs: PvjsonPublicationXref[] & any) {
      publicationXrefs
        // TODO I believe we sort by date, but check that is true and
        // not by the order they appear in the GPML
        .sort(function(a, b) {
          const yearA = parseInt(a.year);
          const yearB = parseInt(b.year);
          if (yearA > yearB) {
            return 1;
          } else if (yearA < yearB) {
            return -1;
          } else {
            return 0;
          }
        })
        .forEach(function(publicationXref, i) {
          publicationXref.textContent = String(i + 1);
        });
      return publicationXrefs as PvjsonPublicationXref[];
    })
    .map(function(publicationXrefs: PvjsonPublicationXref[]) {
      // TODO should these go through the processor instead?

      processor.output = iassign(
        processor.output,
        function(o) {
          return o.entitiesById;
        },
        function(entitiesById) {
          publicationXrefs.forEach(function(publicationXref) {
            entitiesById[publicationXref.id] = publicationXref;
          });
          return entitiesById;
        }
      );
      return processor.output;
    });

  /* TODO do we need to handle these?
		 <xsd:element ref="gpml:InfoBox" minOccurs="1" maxOccurs="1" />
		 <xsd:element ref="gpml:Legend" minOccurs="0" maxOccurs="1"/>
	 */
  return hl([
    pathwayMetadataStream,
    pathwayCommentStream,
    pvjsonEntityStream,
    openControlledVocabularyStream,
    publicationXrefStream
  ])
    .merge()
    .errors(function(err) {
      throw new VError(
        err,
        ` when converting pathway ${pathwayIri}
				`
      );
    });

  //  // TODO Double-check old code to make sure nothing is missed.
  //  // TODO does the stream ever end?
  //  // TODO does backpressure work?
  //  TODO compare the old pvjs/kaavio code below for grouping entities to
  //  ensure we don't have any regression errors.
  /*
  getGroupedZIndexedEntities(zIndexedEntities) {
    const { entitiesById } = this.props;
    return zIndexedEntities
      .filter(entity => !entity.isPartOf)
      .reduce(function(acc, entity) {
        const kaavioType = entity.kaavioType;
        if (kaavioType === "Group") {
          // TODO: refactor this so that contains is actually a map of the contained elements. Not just an array of their IDs
          entity.contains = entity.contains
            .map(id => entitiesById[id])
            .sort(function(a, b) {
              const zIndexA = a.zIndex;
              const zIndexB = b.zIndex;
              if (zIndexA < zIndexB) {
                return 1;
              } else if (zIndexA > zIndexB) {
                return -1;
              } else {
                return 0;
              }
            })
            .map(entity => entity.id);
        } else if (entity.hasOwnProperty("burrs")) {
          entity.burrs = entity.burrs
            .map(id => entitiesById[id])
            .sort(function(a, b) {
              const zIndexA = a.zIndex;
              const zIndexB = b.zIndex;
              if (zIndexA < zIndexB) {
                return 1;
              } else if (zIndexA > zIndexB) {
                return -1;
              } else {
                return 0;
              }
            })
            .map(entity => entity.id);
        }
        if (
          ["Burr"].indexOf(kaavioType) === -1 &&
          !entity.hasOwnProperty("isPartOf")
        ) {
          acc.push(entity);
        }
        return acc;
      }, []);
  }
	//*/
}
