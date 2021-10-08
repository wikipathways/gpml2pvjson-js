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
  defaultsDeepAll,
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
  //InteractionType,
  PvjsonNode,
  PvjsonSingleFreeNode,
  PvjsonBurr,
  PvjsonEdge,
  PvjsonGroup,
  PvjsonEntity,
  //GraphicalLineType,
  GPMLElement,
  Pathway,
  PathwayStarter,
  PvjsonEntitiesById,
  PvjsonPublicationXref,
  PvjsonInteraction
} from "../gpml2pvjson";

import * as GPML2021 from "../../xmlns/pathvisio.org/GPML/2021";

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

import * as GPML2021KeyMappings from "./KeyMappings.json";
import * as GPML2021KeyValueMappings from "./KeyValueConverters";
import * as GPML2021ValueMappings from "./ValueMappings.json";
import * as GPML2021ValueConverters from "./ValueConverters";

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

// TODO specify types
export function toPvjson(
  inputStreamRaw: NodeJS.ReadableStream,
  pathwayIri?: string
) {
  const inputStream = hl(inputStreamRaw);

  const selectorToCXML = {
    "/Pathway/@*": GPML2021.document.Pathway,
    "/Pathway/Comment": GPML2021.document.Pathway.Comment[0],
    //"/Pathway/Graphics/@*": GPML2021.document.Pathway.Graphics[0],
    "/Pathway/Graphics/@*": GPML2021.document.Pathway.Graphics.constructor.prototype,
    "/Pathway/DataNodes/DataNode": GPML2021.document.DataNodes.DataNode[0],
    // State elements are now at /Pathway/DataNodes/DataNode/States/State
    //"/Pathway/States/State": GPML2021.document.States.State[0],
    "/Pathway/Interactions/Interaction": GPML2021.document.Interactions.Interaction[0],
    "/Pathway/GraphicalLines/GraphicalLine": GPML2021.document.GraphicalLines.GraphicalLine[0],
    "/Pathway/Labels/Label": GPML2021.document.Labels.Label[0],
    "/Pathway/Shapes/Shape": GPML2021.document.Shapes.Shape[0],
    "/Pathway/Groups/Group": GPML2021.document.Groups.Group[0],
    "/Pathway/Annotations/Annotation": GPML2021.document.Annotations.Annotation[0],
    "/Pathway/Citations/Citation": GPML2021.document.Citations.Citation[0],
    // TODO: how about vocabs, ontologies, evidence?
  };

  const cxmlXPath = new CXMLXPath(inputStream, GPML2021, {
    bp: "http://www.biopax.org/release/biopax-level3.owl#"
    //rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  });

  const cxmlSources = cxmlXPath.parse(selectorToCXML);

  const processor = new Processor(
    GPML2021KeyMappings,
    GPML2021KeyValueMappings,
    GPML2021ValueMappings,
    GPML2021ValueConverters
  );
  const {
    fillInGPMLPropertiesFromParent,
    getPvjsonEntityLatestByElementId,
    elementIdsByElementRef,
    elementIdToZIndex,
    getGPMLElementByElementId,
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

  const sortByZIndex = sortByMap(elementIdToZIndex);

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

          const stringifyKeyValueForPathway = stringifyKeyValue(mergedPathway);
          mergedPathway.textContent = compact([
            stringifyKeyValueForPathway("name"),
            stringifyKeyValueForPathway("license"),
            stringifyKeyValueForPathway("lastModified"),
            stringifyKeyValueForPathway("organism")
          ]).join("\n");

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

  const pathwayCommentStream = hl(cxmlSources["/Pathway/Comment"])
    .map(function(
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
    })
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing pathwayCommentStream
				`
      );
    });

  // NOTE: in GPML2013a, State elements are at the top level.
  //       in GPML2021, they are always children of DataNode elements, like this:
  //       /Pathway/DataNodes/DataNode/States/State
  const stateStream: Highland.Stream<any> = cxmlSources["/Pathway/DataNodes/DataNode"]
    .observe()
    .filter(function(gpmlDataNode: GPMLElement) {
      return (
        isDefinedCXML(gpmlDataNode.States) &&
        isDefinedCXML(gpmlDataNode.States.State)
      );
    })
    .flatMap(function(gpmlDataNode) {
      const dataNodeId = gpmlDataNode.elementId;
      return hl(gpmlDataNode.States.State)
        .map(function(gpmlState) {
          gpmlState["elementRef"] = dataNodeId;
          return gpmlState;
        })
        .map(x => defaultsDeepAll([x, GPMLDefaults.State]))
        .map(preprocessGPMLElement)
        .map(function(gpmlState) {
          return fillInGPMLPropertiesFromParent(gpmlDataNode, gpmlState);
        })
        .map(processPropertiesAndType("State"))
        .errors(function(err) {
          throw new VError(
            err,
            ` when processing stateStream (inner)
            `
          );
        });
    })
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing stateStream (outer)
        `
      );
    });

  const dataNodeStream = cxmlSources["/Pathway/DataNodes/DataNode"]
    .map(x => defaultsDeepAll([x, GPMLDefaults.DataNode]))
    .map(processGPMLAndPropertiesAndType("DataNode"))
    .map(function(entity: PvjsonSingleFreeNode & any) {
      // TODO fix type def for unionLSV so I don't have to use "as"
      entity.type = unionLSV(entity.type, entity.wpType) as string[];
      return entity;
    })
    .map(function(entity: PvjsonSingleFreeNode & any) {
      // see note above definition of stateStream
      delete entity.states;
      return entity;
    })
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing dataNodeStream
				`
      );
    });

  const cellularComponents = [
    "Cell",
    "EndoplasmicReticulum",
    "ExtracellularRegion",
    "GolgiApparatus",
    "Mitochondria",
    "Nucleus",
    "Organelle",
    "SarcoplasmicReticulum",
    "Vesicle",
  ];

  const shapeStream = cxmlSources["/Pathway/Shapes/Shape"]
    .map(function(x) {
      // TODO: this is a kludge. It appears defaults from GPMLDefaults.Shape
      // aren't getting added to without the stringify/parse kludge below.
      return defaultsDeepAll([JSON.parse(JSON.stringify(x)), GPMLDefaults.Shape])
    })
    //.map(x => defaultsDeepAll([x, GPMLDefaults.Shape]))
    .map(processGPMLAndPropertiesAndType("Shape"))
    .map(function(pvjsonEntity: PvjsonSingleFreeNode & any) {
      const { drawAs } = pvjsonEntity;
      // CellularComponent is not a BioPAX term, but "PhysicalEntity" is.
      if (cellularComponents.indexOf(drawAs) > -1) {
        pvjsonEntity.cellularComponent = drawAs;
        pvjsonEntity.type = unionLSV(
          pvjsonEntity.type,
          "PhysicalEntity",
          "CellularComponent",
          drawAs
        ) as string[];
      }

      // TODO: this is a kludge due to the GPML2021 changes
      if (["Cell", "ExtracellularRegion", "Organelle", "none"].indexOf(drawAs) > -1) {
        pvjsonEntity.drawAs = "rect";
        pvjsonEntity.rx = 15;
        pvjsonEntity.ry = 15;
      } else if (["Nucleus", "Vesicle"].indexOf(drawAs) > -1) {
        pvjsonEntity.drawAs = "Ellipse";
      }
      return pvjsonEntity;
    })
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing shapeStream
				`
      );
    });

  const labelStream = cxmlSources["/Pathway/Labels/Label"]
    .map(x => defaultsDeepAll([x, GPMLDefaults.Label]))
    .map(
      processGPMLAndPropertiesAndType("Label")
    )
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing labelStream
				`
      );
    });

  const gpmlInteractionStream = cxmlSources["/Pathway/Interactions/Interaction"]
    .map(x => defaultsDeepAll([x, GPMLDefaults.Interaction]))
    .map(
      preprocessGPMLElement
    )
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing interactionStream
				`
      );
    });
  const gpmlGraphicalLineStream = cxmlSources["/Pathway/GraphicalLines/GraphicalLine"]
    .map(x => defaultsDeepAll([x, GPMLDefaults.GraphicalLine]))
    .map(
      preprocessGPMLElement
    )
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing graphicalLineStream
				`
      );
    });
  const edgeStream = hl([
    gpmlInteractionStream
      .fork()
      .map(preprocessEdgeGPML)
      .map(processPropertiesAndType("Interaction")),
    gpmlGraphicalLineStream
      .fork()
      .map(preprocessEdgeGPML)
      .map(processPropertiesAndType("GraphicalLine"))
  ])
    .merge()
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing edgeStream
				`
      );
    }) as Highland.Stream<PvjsonEdge>;

  const anchorStream = hl([
    gpmlInteractionStream.fork(),
    gpmlGraphicalLineStream.fork()
  ])
    .merge()
    .filter(function(gpmlEdge: GPMLElement) {
      return (
        isDefinedCXML(gpmlEdge.Waypoints) &&
        isDefinedCXML(gpmlEdge.Waypoints.Anchor)
      );
    })
    .flatMap(function(gpmlEdge: GPMLElement): Highland.Stream<PvjsonBurr> {
      const { elementId: edgeElementId, Waypoints } = gpmlEdge;
      const fillInGPMLPropertiesFromEdge = fillInGPMLPropertiesFromParent(
        gpmlEdge
      );

      const gpmlAnchors = Waypoints.Anchor;
      return hl(gpmlAnchors)
        .map(function(gpmlAnchor: GPMLElement) {
          const anchorShape = gpmlAnchor.shapeType;
          // TODO: before GPML2021, I didn't need the following line. Why?
          gpmlAnchor.Graphics = gpmlAnchor.Graphics || {};
          if (anchorShape === "None") {
            // NOTE: For Anchors with Shape="None", PathVisio-Java displays
            // the anchor as a 4x4 square when nothing is connected,
            // but does not display it when something is connected.
            if (isDefinedCXML(gpmlAnchor.elementId)) {
              assignM(gpmlAnchor.Graphics, {
                height: 0,
                width: 0
              });
            } else {
              gpmlAnchor.shapeType = "Rectangle";
              assignM(gpmlAnchor.Graphics, {
                height: 4,
                width: 4
              });
            }
          } else if (anchorShape === "Circle") {
            assignM(gpmlAnchor.Graphics, {
              height: 8,
              width: 8
            });
          } else {
            throw new Error(`Anchor Shape "${anchorShape}" is not supported.`);
          }

          return gpmlAnchor;
        })
        .map(x => defaultsDeepAll([x, GPMLDefaults.Anchor]))
        .map(preprocessGPMLElement)
        .map(function(gpmlAnchor: GPMLElement) {
          const filledInAnchor = fillInGPMLPropertiesFromEdge(gpmlAnchor);
          filledInAnchor.elementRef = edgeElementId;
          return filledInAnchor;
        })
        // TODO: for some reason, the following section seems to result in shapeType() being
        // called twice for every anchor. Why?
        .map(processPropertiesAndType("Anchor"))
        .errors(function(err) {
          throw new VError(
            err,
            ` when processing inner part of anchorStream
            `
          );
        }) as Highland.Stream<PvjsonBurr>;
    })
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing outer part of anchorStream
				`
      );
    });

  const groupStream: Highland.Stream<PvjsonGroup> = cxmlSources[
    "/Pathway/Groups/Group"
  ]
    .map(x => {
      return defaultsDeepAll([x, GPMLDefaults["Group" + x.type]]);
    })
    .map(preprocessGroupGPML(processor))
    // PathVisio shouldn't do this, but it sometimes makes empty Groups.
    // We filter them out here.
    .filter((Group: GPMLElement) => !!Group.Contains)
    .map(processGPMLAndPropertiesAndType("Group"))
    .map(x => {
      const groupDefaults = GPMLDefaults["Group" + x["wpType"]];
      x.type = groupDefaults.type;
      return x;
    })
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing groupStream
				`
      );
    }) as Highland.Stream<PvjsonGroup>;

  const EDGES = ["Interaction", "GraphicalLine"];
  const NODES = ["DataNode", "Shape", "Label", "State", "Group"];

  function postprocessAll(
    s
  ): Highland.Stream<PvjsonSingleFreeNode | PvjsonEdge> {
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
          intersection(dependencies, sortedIds).length === dependencies.length
        );
      },
      unsorted);

      sortedOnThisIteration
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
        .errors(function(err) {
          throw new VError(
            err,
            ` when running postprocessAll
            `
          );
        })
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
    .errors(function(err) {
      throw new VError(
        err,
        ` after postprocessAll when processing pvjsonEntityStream
				`
      );
    })
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
        arrayify(isAttachedTo).forEach(function(elementRef: string) {
          const elementRefs = elementIdsByElementRef[elementRef] || [];
          if (elementRefs.indexOf(id) === -1) {
            elementRefs.push(id);
          }
          elementIdsByElementRef[elementRef] = elementRefs;
        });

        if (isPvjsonBurr(pvjsonEntity)) {
          finalSortedStream = hl(
            getPvjsonEntityLatestByElementId(isAttachedTo)
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
                const elementIdToZIndex = processor.elementIdToZIndex;
                pvjsonGroup.contains = sortBy(
                  [
                    function(thisEntityId) {
                      return elementIdToZIndex[thisEntityId];
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
                  return groupedEntity;
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

      return finalSortedStream
        .errors(function(err) {
          throw new VError(
            err,
            ` when processing finalSortedStream in pvjsonEntityStream
            `
          );
        });
    })
    .errors(function(err) {
      throw new VError(
        err,
        ` when processing pvjsonEntityStream
				`
      );
    });

  pvjsonEntityStream
    .observe()
    .last()
    .doto(function() {
      processor.pvjsonEntityLatestStream.end();
    });

  /* TODO do we need to handle these?
		 <xsd:element ref="gpml:InfoBox" minOccurs="1" maxOccurs="1" />
		 <xsd:element ref="gpml:Legend" minOccurs="0" maxOccurs="1"/>
	 */
  return hl([
    pathwayMetadataStream,
    pathwayCommentStream,
    pvjsonEntityStream,
  ])
    .merge()
    .errors(function(err) {
      throw new VError(
        err,
        ` when converting pathway ${pathwayIri}
				`
      );
    });
}
