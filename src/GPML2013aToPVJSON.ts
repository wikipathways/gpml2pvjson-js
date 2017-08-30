import "source-map-support/register";
// TODO should I get rid of the lib above for production browser build?

import { assign as assignM } from "lodash";
import {
  assign,
  assignAll,
  concat,
  curry,
  defaultsDeep,
  difference,
  findIndex,
  flow,
  isArray,
  isEmpty,
  isObject,
  map,
  omit,
  partition,
  reduce,
  sortBy,
  toPairsIn,
  values
} from "lodash/fp";
import * as hl from "highland";

import { CXMLXPath } from "./topublish/cxml-xpath";

import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";

import * as GPMLDefaults from "./GPMLDefaults";

import { Processor } from "./Processor";
import {
  preprocessGPML as preprocessEdgeGPML,
  postprocessPVJSON as postprocessEdgePVJSON
} from "./edge";
import {
  preprocessGPML as preprocessGroupGPML,
  postprocessPVJSON as postprocessGroupPVJSON
} from "./group";
import { postprocessPVJSON as postprocessShapePVJSON } from "./Shape";
import {
  arrayify,
  augmentErrorMessage,
  generatePublicationXrefId,
  insertIfNotExists,
  isPvjsonBurr,
  isPvjsonEdge,
  isPvjsonGroup,
  isPvjsonNode,
  sortByMap,
  supportedNamespaces,
  unionLSV
} from "./gpml-utilities";
import * as VOCABULARY_NAME_TO_IRI from "./VOCABULARY_NAME_TO_IRI.json";

import * as iassign from "immutable-assign";
iassign.setOption({
  // Deep freeze both input and output. Used in development to make sure they don't change.
  // TODO watch issue and re-enable when addressed: https://github.com/engineforce/ImassignM/issues/11
  //freeze: true,
  ignoreIfNoChange: true
});

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

  toPairsIn(target)
    .filter(
      ([targetKey, targetValue]) =>
        source.hasOwnProperty(targetKey) && isObject(source[targetKey])
    )
    .forEach(function([targetKey, targetValue]) {
      extendDeep(targetValue, source[targetKey]);
    });
  assignM(target.constructor.prototype, source);
}

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

// TODO specify types
// NOTE: there are some differences between this version and previous version, e.g.:
// 'Double' instead of 'double' for double lines
export function GPML2013aToPVJSON(
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

  const processor = new Processor();
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

          // TODO where should these contexts be hosted?
          // Probably at Github.
          // The ones below are currently outdated.
          const context: (string | Record<string, any>)[] = [
            "https://wikipathwayscontexts.firebaseio.com/biopax.json",
            "https://wikipathwayscontexts.firebaseio.com/cellularLocation.json",
            "https://wikipathwayscontexts.firebaseio.com/display.json",
            //'https://wikipathwayscontexts.firebaseio.com/interactionType.json',
            "https://wikipathwayscontexts.firebaseio.com/organism.json",
            "https://wikipathwayscontexts.firebaseio.com/bridgedb/.json"
          ];
          if (mergedPathway.hasOwnProperty("id")) {
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
          );
        }
      );
      return processor.output;
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
        comments.push(processProperties(Comment));
        pathway.comments = comments;
        return pathway;
      }
    );
    return processor.output;
  });

  const dataNodeStream = cxmlSources["/Pathway/DataNode"].map(
    processGPMLAndPropertiesAndType("DataNode")
  );

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
  //  /* NOTE probably going to let the renderer handle this State processing step instead of doing it here
  //		.flatMap(function(pvjsonState: PvjsonBurr) {
  //			const referencedElementCenterX = referencedElement.x + referencedElement.width / 2;
  //			const referencedElementCenterY = referencedElement.y + referencedElement.height / 2;
  //
  //			const elementCenterX = referencedElementCenterX +	element['gpml:RelX'] * referencedElement.width / 2;
  //			const elementCenterY = referencedElementCenterY +	element['gpml:RelY'] * referencedElement.height / 2;
  //
  //			element.x = elementCenterX - element.width / 2;
  //			element.y = elementCenterY - element.height / 2;
  //		});
  //		//*/

  const shapeStream = cxmlSources["/Pathway/Shape"]
    .map(processGPMLAndPropertiesAndType("Shape"))
    .map(postprocessShapePVJSON)
    .map(function(processed) {
      const { cellularComponent } = processed;
      // CellularComponent is not a BioPAX term, but "PhysicalEntity" is.
      if (!!cellularComponent) {
        processed.type = unionLSV(
          processed.type,
          "PhysicalEntity",
          "CellularComponent",
          cellularComponent
        ) as string[];
      }
      return processed;
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
    .flatMap(function(gpmlEdge: GPMLElement): Highland.Stream<PvjsonNode> {
      const { GraphId, Graphics } = gpmlEdge;
      const fillInGPMLPropertiesFromEdge = fillInGPMLPropertiesFromParent(
        gpmlEdge
      );

      const gpmlAnchors = Graphics.hasOwnProperty("Anchor") &&
        Graphics.Anchor &&
        Graphics.Anchor[0] &&
        Graphics.Anchor[0]._exists !== false
        ? Graphics.Anchor.filter(a => a.hasOwnProperty("GraphId"))
        : [];
      return hl(gpmlAnchors)
        .map(preprocessGPMLElement)
        .map(function(gpmlAnchor: GPMLElement) {
          const filledInAnchor = fillInGPMLPropertiesFromEdge(gpmlAnchor);
          filledInAnchor.GraphRef = GraphId;
          return filledInAnchor;
        })
        .map(processPropertiesAndType("Anchor"))
        .map(function(pvjsonAnchor: PvjsonNode): PvjsonNode {
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
          return pvjsonAnchor;
        });
    });

  const groupStream: Highland.Stream<PvjsonNode> = cxmlSources["/Pathway/Group"]
    .map(preprocessGroupGPML(processor))
    // PathVisio shouldn't do this, but it sometimes makes empty Groups.
    // We filter them out here.
    .filter((Group: GPMLElement) => !!Group.Contains)
    .map(processGPMLAndPropertiesAndType("Group"));

  interface ReferencedEntitiesMap {
    [key: string]: (PvjsonNode | PvjsonEdge);
  }
  const EDGES = ["Interaction", "GraphicalLine"];
  const NODES = ["DataNode", "Shape", "Label", "State", "Group"];

  function postprocessAll(s): Highland.Stream<(PvjsonNode | PvjsonEdge)> {
    interface ProcessDependentAcc {
      missing: (PvjsonNode | PvjsonEdge)[];
      tranches: (PvjsonNode | PvjsonEdge)[][];
    }

    const independenceTests = [
      curry(function(tranch, pvjsonEntity) {
        return (
          pvjsonEntity.gpmlElementName !== "Group" &&
          (!pvjsonEntity.hasOwnProperty("isAttachedTo") ||
            arrayify(pvjsonEntity.isAttachedTo)
              .map(isAttachedToId => processor.output.entityMap[isAttachedToId])
              .filter(
                candidateEntity =>
                  ["Group", "Interaction", "GraphicalLine"].indexOf(
                    candidateEntity.gpmlElementName
                  ) > -1
              ).length === 0)
        );
      }),
      curry(function(tranch, pvjsonEntity) {
        const gpmlElementName = pvjsonEntity.gpmlElementName;
        if (
          ["Interaction", "GraphicalLine", "State"].indexOf(gpmlElementName) >
          -1
        ) {
          // independent when edge or state not attached to a dependent
          return (
            arrayify(pvjsonEntity.isAttachedTo)
              .map(isAttachedToId => processor.output.entityMap[isAttachedToId])
              .filter(
                candidateEntity => tranch.indexOf(candidateEntity.id) > -1
              ).length > 0
          );
        } else if (gpmlElementName === "Group") {
          // independent when group does not contain a dependent
          return (
            arrayify(pvjsonEntity.contains)
              .map(isAttachedToId => processor.output.entityMap[isAttachedToId])
              .filter(
                candidateEntity => tranch.indexOf(candidateEntity.id) > -1
              ).length > 0
          );
        }
      })
    ];

    const TEST_COUNT = independenceTests.length;

    function processDependent(
      { missing, tranches }: ProcessDependentAcc,
      pvjsonEntity: PvjsonNode | PvjsonEdge
    ) {
      missing.push(pvjsonEntity);

      let [notMissing, remainingMissing] = partition(function(pvjsonEntity) {
        let referencedEntitiesProcessed;
        if (pvjsonEntity.gpmlElementName === "Group") {
          referencedEntitiesProcessed = arrayify(pvjsonEntity.contains).map(
            containedId => processor.output.entityMap[containedId]
          );
        } else if (pvjsonEntity.hasOwnProperty("isAttachedTo")) {
          referencedEntitiesProcessed = arrayify(pvjsonEntity.isAttachedTo).map(
            isAttachedToId => processor.output.entityMap[isAttachedToId]
          );
        } else {
          referencedEntitiesProcessed = [];
        }

        return referencedEntitiesProcessed.indexOf(undefined) === -1;
      }, missing);

      let testIndex;
      notMissing.forEach(function(x) {
        const matchingTranchIndex = findIndex(function(tranch) {
          const matchingTestIndex = findIndex(function(independenceTest) {
            return independenceTest(tranch, x);
          }, independenceTests);
          if (matchingTestIndex > -1) {
            testIndex = matchingTestIndex;
          }
          return matchingTestIndex > -1;
        }, tranches);
        if (matchingTranchIndex > -1 || testIndex > -1) {
          const targetTranchIndex =
            (matchingTranchIndex > -1 ? matchingTranchIndex : tranches.length) +
            (testIndex > -1 ? testIndex : TEST_COUNT);
          tranches[targetTranchIndex] = tranches[targetTranchIndex] || [];
          tranches[targetTranchIndex].push(x);
        } else {
          remainingMissing.push(x);
        }
      });

      return {
        tranches: tranches,
        missing: remainingMissing
      };
    }

    return s
      .reduce(
        {
          missing: [],
          tranches: [[]]
        },
        processDependent
      )
      .map(function(acc) {
        const { tranches, missing } = acc;
        tranches.push(missing);
        return hl(tranches.reduce((acc, tranch) => acc.concat(tranch), []));
      })
      .sequence();
  }

  const pvjsonEntityStream = hl([
    hl([dataNodeStream, stateStream, shapeStream, labelStream]).merge(),
    hl(
      [edgeStream, anchorStream] as Highland.Stream<
        (PvjsonNode | PvjsonEntity)
      >[]
    ).merge(),
    groupStream
  ])
    .sequence()
    .doto(setPvjsonEntity)
    .through(postprocessAll)
    .flatMap(function(
      pvjsonEntity: PvjsonNode | PvjsonEdge
    ): Highland.Stream<{
      pathway: Pathway | PathwayStarter;
      entityMap: PvjsonEntityMap;
    }> {
      const { id, isAttachedTo, zIndex } = pvjsonEntity;

      // TODO we might want to sort by other criteria, such as
      // to order a State above its DataNode, which would be
      // ordered above its Group, if any
      const insertEntityIdAndSortByZIndex = flow([
        insertIfNotExists(id),
        sortByZIndex
      ]);

      if (!!isAttachedTo) {
        arrayify(isAttachedTo).forEach(function(graphRef: string) {
          const graphRefs = graphIdsByGraphRef[graphRef] || [];
          if (graphRefs.indexOf(id) === -1) {
            graphRefs.push(id);
          }
          graphIdsByGraphRef[graphRef] = graphRefs;
        });
      }

      let finalProcessedStream;
      if (isPvjsonBurr(pvjsonEntity)) {
        // NOTE: burrs are not added to the property "contained".
        // Rather, they are added to the property "burrs".
        finalProcessedStream = hl(
          getPvjsonEntityLatestByGraphId(isAttachedTo)
        ).map(function(referencedEntity: PvjsonNode | PvjsonInteraction) {
          /* TODO do we need to do anything here?
          if (isPvjsonEdge(referencedEntity)) {
          } else if (isPvjsonNode(referencedEntity)) {
          }
					//*/

          setPvjsonEntity(pvjsonEntity);

          referencedEntity.burrs = referencedEntity.burrs || [];
          insertEntityIdAndSortByZIndex(referencedEntity.burrs);
          setPvjsonEntity(referencedEntity);

          return processor.output;
        });
      } else if (isPvjsonGroup(pvjsonEntity)) {
        //finalProcessedStream = hl([pvjsonEntity]);
        const graphIdOfGroup = pvjsonEntity.id;
        finalProcessedStream = hl(
          pvjsonEntity.contains.map(
            containedId => processor.output.entityMap[containedId]
          )
        )
          .collect()
          .map(function(
            groupedEntities: (PvjsonNode | PvjsonEdge)[]
          ): PvjsonNode {
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
                groupedEntity.points = map(groupedEntity.points, function(
                  point
                ) {
                  point.x -= x;
                  point.y -= y;
                  return point;
                });
              } else if (isPvjsonNode(groupedEntity)) {
                groupedEntity.height;
                groupedEntity.x -= x;
                groupedEntity.y -= y;
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
                  difference(contains, groupedEntitiesFinal.map(x => x.id)),
                  id
                );
              }
            );

            return pvjsonGroup;
          })
          .map(function(pvjsonEntity) {
            return processor.output;
          });
      } else if (isPvjsonEdge(pvjsonEntity)) {
        const pvjsonEdge = postprocessEdgePVJSON(
          processor.output.entityMap as {
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

        finalProcessedStream = hl([processor.output]);
      } else {
        setPvjsonEntity(pvjsonEntity);
        processor.output = iassign(
          processor.output,
          function(o) {
            return o.pathway.contains;
          },
          insertEntityIdAndSortByZIndex
        );
        finalProcessedStream = hl([processor.output]);
      }

      return finalProcessedStream;
    });

  pvjsonEntityStream.observe().last().doto(function() {
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
        console.warn(
          `Unknown openControlledVocabulary name "${vocabularyName}" with dbId "${openControlledVocabulary.dbId}"`
        );
        vocabularyIRI = `http://www.ebi.ac.uk/miriam/main/search?query=${vocabularyName.replace(
          /\ /,
          "+"
        )}#`;
      }
      openControlledVocabulary.id =
        vocabularyIRI + openControlledVocabulary.dbId;
      return openControlledVocabulary;
    })
    .collect()
    .map(function(openControlledVocabularies: Record<string, any>) {
      // TODO should these go through the processor instead?

      processor.output = iassign(processor.output, function(o) {
        const { pathway, entityMap } = o;

        openControlledVocabularies.forEach(function(openControlledVocabulary) {
          const { id } = openControlledVocabulary;
          entityMap[id] = openControlledVocabulary;
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
    .map(function(publicationXrefs: PvjsonPublicationXref[]) {
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
          publicationXref.displayName = String(i + 1);
        });
      return publicationXrefs;
    })
    .map(function(publicationXrefs: PvjsonPublicationXref[]) {
      // TODO should these go through the processor instead?

      processor.output = iassign(
        processor.output,
        function(o) {
          return o.entityMap;
        },
        function(entityMap) {
          publicationXrefs.forEach(function(publicationXref) {
            entityMap[publicationXref.id] = publicationXref;
          });
          return entityMap;
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
      throw augmentErrorMessage(err, ` for pathway with id="${pathwayIri}"`);
    });

  //  // TODO Double-check old code to make sure nothing is missed.
  //  // TODO does the stream ever end?
  //  // TODO does backpressure work?
}
