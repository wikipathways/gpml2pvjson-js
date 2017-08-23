import "source-map-support/register";
// TODO should I get rid of the lib above for production browser build?

import { assign as assignM } from "lodash";
import {
  assign,
  concat,
  isArray,
  isObject,
  map,
  reduce,
  sortBy,
  toPairsIn
} from "lodash/fp";
import * as hl from "highland";
import * as iassign from "immutable-assign";

// TODO use published version
//import * as cxml from "cxml";
import * as cxml from "../../cxml/lib/cxml";
import { CXMLXPath } from "./topublish/cxml-xpath";

// TODO compile this as part of the build step for this package
//import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";
import * as GPML2013a from "../../cxml/test/xmlns/pathvisio.org/GPML/2013a";
//import * as Biopax from "../../cxml/test/xmlns/www.biopax.org/release/biopax-level3.owl";
import * as GPMLDefaults from "./GPMLDefaults";

import { Processor } from "./Processor";
import { createEdgeTransformStream } from "./edge";
import {
  preprocess as preprocessGroupGPML,
  postprocess as postprocessGroupPVJSON
} from "./group";
import { postprocess as postprocessShapePVJSON } from "./Shape";
import {
  generatePublicationXrefId,
  isPvjsonEdge,
  supportedNamespaces,
  unionLSV
} from "./gpml-utilities";
import * as VOCABULARY_NAME_TO_IRI from "./VOCABULARY_NAME_TO_IRI.json";

iassign.setOption({
  // Deep freeze both input and output. Used in development to make sure they don't change.
  // TODO watch issue and re-enable when addressed: https://github.com/engineforce/ImassignM/issues/11
  //freeze: true,
  ignoreIfNoChange: true
});

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
    "/Pathway/@*": GPML2013a.document.Pathway.constructor.prototype,
    "/Pathway/Biopax/bp:PublicationXref":
      GPML2013a.document.Pathway.Biopax.PublicationXref[0],
    "/Pathway/Biopax/bp:openControlledVocabulary":
      GPML2013a.document.Pathway.Biopax.openControlledVocabulary[0],
    "/Pathway/Comment/@*": GPML2013a.document.Pathway.Comment[0],
    "/Pathway/Comment": GPML2013a.document.Pathway.Comment[0],
    "/Pathway/DataNode": GPML2013a.DataNodeType.prototype,
    "/Pathway/GraphicalLine": GPML2013a.GraphicalLineType.prototype,
    "/Pathway/Graphics/@*": GPML2013a.document.Pathway.Graphics,
    "/Pathway/Group": GPML2013a.GroupType.prototype,
    "/Pathway/InfoBox": GPML2013a.InfoBoxType.prototype,
    "/Pathway/Interaction": GPML2013a.InteractionType.prototype,
    "/Pathway/Label": GPML2013a.LabelType.prototype,
    "/Pathway/Legend": GPML2013a.LegendType.prototype,
    "/Pathway/Shape": GPML2013a.ShapeType.prototype,
    "/Pathway/State": GPML2013a.StateType.prototype
  };

  const cxmlXPath = new CXMLXPath(inputStream, GPML2013a, {
    bp: "http://www.biopax.org/release/biopax-level3.owl#"
    //rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  });

  const result = cxmlXPath.parse(selectorToCXML);

  const processor = new Processor();
  const {
    processPropertiesAndAddType,
    getByGraphId,
    getGPMLElementByGraphId,
    fillInGPMLPropertiesFromParent,
    preprocessGPMLElement,
    processProperties,
    processAsync
  } = processor;

  hl([
    result["/Pathway/@*"].doto(function(pathway) {
      if (supportedNamespaces.indexOf(pathway._namespace) === -1) {
        // TODO should we do anything further?
        throw new Error(`Unsupported namespace: ${pathway._namespace}`);
      }
    }),
    result["/Pathway/Graphics/@*"]
  ])
    .merge()
    .errors(function(err) {
      throw err;
    })
    .map(processPropertiesAndAddType("Pathway"))
    .each(function(processed: Record<string, any>) {
      processor.output = iassign(
        processor.output,
        function(o) {
          return o.pathway;
        },
        function(pathway) {
          const { name } = processed;
          if (!!name) {
            const splitName = name.split(" (");
            if (
              !!splitName &&
              splitName.length === 2 &&
              !!name.match(/\(/g) &&
              name.match(/\(/g).length === 1 &&
              !!name.match(/\)/g) &&
              name.match(/\)/g).length === 1
            ) {
              processed.standardName = splitName[0];
              processed.displayName = splitName[1].replace(")", "");
            } else {
              processed.standardName = name;
              processed.displayName = name;
            }
          }

          return assign(pathway, processed);
        }
      );
      processor.outputStream.write(processor.output);
    });

  hl(result["/Pathway/Comment"])
    .errors(function(err) {
      throw err;
    })
    .each(function(Comment) {
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

      processor.outputStream.write(processor.output);
    });

  const dataNodeStream = hl(result["/Pathway/DataNode"])
    .errors(function(err) {
      throw err;
    })
    .flatMap(processAsync("DataNode"));

  const shapeStream = hl(result["/Pathway/Shape"])
    .errors(function(err) {
      throw err;
    })
    .flatMap(processAsync("Shape"))
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

  const stateStream = hl(result["/Pathway/State"])
    .errors(function(err) {
      throw err;
    })
    .flatMap(preprocessGPMLElement)
    .flatMap(function(gpmlState) {
      return hl(getGPMLElementByGraphId(gpmlState.GraphRef)).map(function(
        gpmlDataNode
      ) {
        return fillInGPMLPropertiesFromParent(gpmlDataNode, gpmlState);
      });
    })
    .map(processPropertiesAndAddType("State"));

  const labelStream = hl(result["/Pathway/Label"])
    .errors(function(err) {
      throw err;
    })
    .flatMap(processAsync("Label"));

  const edgeStream = hl([
    hl(result["/Pathway/Interaction"])
      .errors(function(err) {
        throw err;
      })
      .through(createEdgeTransformStream(processor, "Interaction")),
    hl(result["/Pathway/GraphicalLine"])
      .errors(function(err) {
        throw err;
      })
      .through(createEdgeTransformStream(processor, "GraphicalLine"))
  ]).merge();

  const groupStream = hl(result["/Pathway/Group"])
    .errors(function(err) {
      throw err;
    })
    .map(preprocessGroupGPML)
    .flatMap(processAsync("Group"))
    .flatMap(function(processed: PvjsonNode) {
      const { id } = processed;

      const groupedElementIds = processor.graphIdsByGroup[id];
      return !groupedElementIds
        ? hl([])
        : hl(groupedElementIds)
            .flatMap(function(id) {
              return hl(getByGraphId(id));
            })
            .map(function(pvjsonEntity: PvjsonNode | PvjsonEdge) {
              // NOTE: side effect
              pvjsonEntity.isPartOf = processed.id;
              return pvjsonEntity;
            })
            .errors(function(err) {
              throw err;
            })
            .collect()
            .flatMap(function(
              groupedEntities: (PvjsonNode | PvjsonEdge)[]
            ): Highland.Stream<PvjsonNode | PvjsonEdge> {
              const graphIdToZIndex = processor.graphIdToZIndex;
              processed.contains = sortBy(
                [
                  function(thisEntityId) {
                    return graphIdToZIndex[thisEntityId];
                  }
                ],
                groupedEntities.map(entity => entity.id)
              );

              const updatedProcessed = postprocessGroupPVJSON(
                groupedEntities,
                processed
              );
              const { x, y } = updatedProcessed;

              return hl(
                concat(
                  [updatedProcessed],
                  groupedEntities.map(function(groupedEntity) {
                    if (isPvjsonEdge(groupedEntity)) {
                      groupedEntity.points = map(groupedEntity.points, function(
                        point
                      ) {
                        point.x -= x;
                        point.y -= y;
                        return point;
                      });
                    } else if (groupedEntity.hasOwnProperty("x")) {
                      groupedEntity.x -= x;
                      groupedEntity.y -= y;
                    } else {
                      console.error(groupedEntity);
                      throw new Error(
                        "Unexpected entity found in group (see above)"
                      );
                    }
                    return groupedEntity;
                  })
                )
              );
            });
    });

  hl([
    dataNodeStream,
    shapeStream,
    stateStream,
    labelStream,
    edgeStream,
    groupStream
  ])
    .merge()
    .doto((processed: PvjsonNode) =>
      processor.pvjsonEntityStream.write(processed)
    )
    .errors(function(err) {
      throw err;
    })
    .each(function(processed) {});

  hl(result["/Pathway/Biopax/bp:openControlledVocabulary"])
    .errors(function(err) {
      throw err;
    })
    .map(processPropertiesAndAddType("openControlledVocabulary"))
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
    .each(function(openControlledVocabularies: Record<string, any>) {
      // TODO should these go through the processor instead?

      processor.output = iassign(processor.output, function(output) {
        const { pathway, entityMap } = output;

        openControlledVocabularies.forEach(function(openControlledVocabulary) {
          const { id } = openControlledVocabulary;
          entityMap[id] = openControlledVocabulary;
          if (openControlledVocabulary.ontology === "Pathway Ontology") {
            pathway.type.push(id);
          }
        });

        return output;
      });

      processor.outputStream.write(processor.output);
    });

  hl(result["/Pathway/Biopax/bp:PublicationXref"])
    .errors(function(err) {
      throw err;
    })
    .map(processPropertiesAndAddType("PublicationXref"))
    .collect()
    .doto(function(publicationXrefs: PvjsonPublicationXref[]) {
      publicationXrefs.forEach(function(publicationXref, i) {
        publicationXref.displayName = String(i + 1);
      });
    })
    .each(function(publicationXrefs: PvjsonPublicationXref[]) {
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

      processor.outputStream.write(processor.output);
    });

  return processor.outputStream.debounce(17);

  // TODO double-check that groups are correctly getting their contents.
  // TODO Double-check old code to make sure nothing is missed.
  // TODO get CLI working again
  // TODO does the stream ever end?
  // TODO does backpressure work?
}
