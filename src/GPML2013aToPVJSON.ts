import "source-map-support/register";
// TODO should I get rid of the lib above for production browser build?

import { assign as assignM } from "lodash";
import {
  assign,
  assignAll,
  concat,
  flow,
  isArray,
  isEmpty,
  isObject,
  map,
  omit,
  reduce,
  sortBy,
  toPairsIn
} from "lodash/fp";
import * as hl from "highland";

import { CXMLXPath } from "./topublish/cxml-xpath";

import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";

import * as GPMLDefaults from "./GPMLDefaults";

import { Processor } from "./Processor";
import { createEdgeTransformStream } from "./edge";
import {
  preprocess as preprocessGroupGPML,
  postprocess as postprocessGroupPVJSON
} from "./group";
import { postprocess as postprocessShapePVJSON } from "./Shape";
import {
  arrayify,
  generatePublicationXrefId,
  insertIfNotExists,
  isPvjsonBurr,
  isPvjsonEdge,
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

function partition<T>(
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
    processPropertiesAndType,
    getPvjsonEntityLatestByGraphId,
    graphIdsByGraphRef,
    graphIdToZIndex,
    getGPMLElementByGraphId,
    fillInGPMLPropertiesFromParent,
    preprocessGPMLElement,
    processProperties,
    processGeneral
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
    .errors(function(err) {
      throw err;
    })
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
          // NOTE: GPML schema specifies that name is required
          const { name } = metadata;
          const splitName = name.split(" (");
          if (
            !!splitName &&
            splitName.length === 2 &&
            !!name.match(/\(/g) &&
            name.match(/\(/g).length === 1 &&
            !!name.match(/\)/g) &&
            name.match(/\)/g).length === 1
          ) {
            metadata.standardName = splitName[0];
            metadata.displayName = splitName[1].replace(")", "");
          } else {
            metadata.standardName = name;
            metadata.displayName = name;
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
          if (metadata.hasOwnProperty("id")) {
            context.push({
              "@base": metadata.id + "/"
            });
          } else {
            // If there's no pathway IRI specified, we at least give the user a URL
            // to search WikiPathways to possibly find the source for this data.

            // NOTE: GPML schema specifies that organism is optional
            const organismIriComponent = metadata.hasOwnProperty("organism")
              ? `&species=${metadata.organism}`
              : "";
            metadata.isSimilarTo = encodeURI(
              `http://wikipathways.org/index.php/Special:SearchPathways?query=${name}${organismIriComponent}&doSearch=1`
            );
          }

          return assignAll([
            {
              "@context": context
            },
            pathway,
            metadata
          ]);
        }
      );
      return processor.output;
    });

  const pathwayCommentStream = hl(cxmlSources["/Pathway/Comment"])
    .errors(function(err) {
      throw err;
    })
    .map(function(Comment) {
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
    processGeneral("DataNode")
  );

  const stateStream = cxmlSources["/Pathway/State"]
    .errors(function(err) {
      throw err;
    })
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
    .map(processGeneral("Shape"))
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

  const labelStream = cxmlSources["/Pathway/Label"]
    .errors(function(err) {
      throw err;
    })
    .map(processGeneral("Label"));

  const edgeStream = hl([
    cxmlSources["/Pathway/Interaction"]
      .errors(function(err) {
        throw err;
      })
      .through(createEdgeTransformStream(processor, "Interaction")),
    cxmlSources["/Pathway/GraphicalLine"]
      .errors(function(err) {
        throw err;
      })
      .through(createEdgeTransformStream(processor, "GraphicalLine"))
  ]).merge();

  const groupStream: Highland.Stream<PvjsonNode> = cxmlSources["/Pathway/Group"]
    .map(preprocessGroupGPML)
    .map(preprocessGPMLElement)
    .flatMap(function(gpmlGroup: GPMLElement) {
      const { GroupId } = gpmlGroup;
      const graphIdOfGroup = gpmlGroup.GraphId;
      return hl(processor.containedGraphIdsByGroupGroupId[GroupId])
        .map(processor.getPvjsonEntityLatestByGraphId)
        .flatMap(hl)
        .collect()
        .map(function(
          groupedEntities: (PvjsonNode | PvjsonEdge)[]
        ): PvjsonNode {
          const pvjsonGroup = postprocessGroupPVJSON(
            groupedEntities,
            processor.processPropertiesAndType("Group", gpmlGroup)
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
              groupedEntity.points = map(groupedEntity.points, function(point) {
                point.x -= x;
                point.y -= y;
                return point;
              });
            } else if (isPvjsonNode(groupedEntity)) {
              groupedEntity.height;
              groupedEntity.x -= x;
              groupedEntity.y -= y;
            }
            groupedEntity.isPartOf = id;
            return groupedEntity;
          });

          groupedEntitiesFinal.forEach(function(pvjsonEntity) {
            processor.setPvjsonEntityFinal(pvjsonEntity);
          });

          return pvjsonGroup;
        });
    });

  const pvjsonEntityStream = hl([
    hl([
      hl([dataNodeStream, stateStream]).sequence(),
      shapeStream,
      labelStream
    ]).merge(),
    hl([edgeStream, groupStream]).merge()
  ])
    .sequence()
    .filter((pvjsonEntity: (PvjsonNode | PvjsonEdge)) => !pvjsonEntity.isPartOf)
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
        finalProcessedStream = hl(
          getPvjsonEntityLatestByGraphId(isAttachedTo)
        ).map(function(referencedEntity: PvjsonNode | PvjsonInteraction) {
          /* TODO do we need to do anything here?
          if (isPvjsonEdge(referencedEntity)) {
          } else if (isPvjsonNode(referencedEntity)) {
          }
					//*/

          processor.setPvjsonEntityFinal(pvjsonEntity);

          referencedEntity.burrs = referencedEntity.burrs || [];
          insertEntityIdAndSortByZIndex(referencedEntity.burrs);
          processor.setPvjsonEntityFinal(referencedEntity);

          return processor.output;
        });
      } else {
        processor.output = iassign(
          processor.output,
          function(o) {
            return o.pathway.contains;
          },
          insertEntityIdAndSortByZIndex
        );

        processor.setPvjsonEntityFinal(pvjsonEntity);

        finalProcessedStream = hl([processor.output]);
      }

      return finalProcessedStream;
    })
    .errors(function(err) {
      throw err;
    });

  pvjsonEntityStream.observe().last().doto(function() {
    processor.pvjsonEntityLatestStream.end();
  });

  const openControlledVocabularyStream = hl(
    cxmlSources["/Pathway/Biopax/bp:openControlledVocabulary"]
  )
    .errors(function(err) {
      throw err;
    })
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
    .errors(function(err) {
      throw err;
    })
    .map(processPropertiesAndType("PublicationXref"))
    .collect()
    .map(function(publicationXrefs: PvjsonPublicationXref[]) {
      publicationXrefs.forEach(function(publicationXref, i) {
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

  //  //*/
  //  /* TODO should we sort by date, or by the order they appear in the GPML?
  //  data.PublicationXref
  //    .reduce(getFromElementMapByIdIfExists, [])
  //    .sort(function(a, b) {
  //      const yearA = parseInt(a.year);
  //      const yearB = parseInt(b.year);
  //      if (yearA > yearB) {
  //        return 1;
  //      } else if (yearA < yearB) {
  //        return -1;
  //      } else {
  //        return 0;
  //      }
  //    })
  //    .map(function(publicationXref, i) {
  //      publicationXref.displayName = String(i + 1);
  //      return publicationXref;
  //    })
  //	//*/

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
  ]).merge();

  //  // TODO Double-check old code to make sure nothing is missed.
  //  // TODO does the stream ever end?
  //  // TODO does backpressure work?
}
