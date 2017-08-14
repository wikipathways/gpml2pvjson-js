import "source-map-support/register";
// TODO should I get rid of the lib above for production browser build?

import { assign as assignM } from "lodash";
import {
  assign,
  concat,
  fromPairs,
  isArray,
  isObject,
  map,
  sortBy,
  toPairs,
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
import * as GPMLDefaults from "./GPMLDefaults";

import { processKV, Processor } from "./Processor";
import { createEdgeTransformStream } from "./edge";
import {
  preprocess as preprocessGroupGPML,
  postprocess as postprocessGroupPVJSON
} from "./group";
import { postprocess as postprocessShapePVJSON } from "./Shape";
import { isPvjsonEdge, supportedNamespaces, unionLSV } from "./gpml-utilities";

iassign.setOption({
  // Deep freeze both input and output. Used in development to make sure they don't change.
  // TODO watch issue and re-enable when addressed: https://github.com/engineforce/ImassignM/issues/11
  //freeze: true,
  ignoreIfNoChange: true
});

/*
export type GPMLElement = GPML2013a.PathwayType &
  typeof GPML2013a.DataNodeType.prototype &
  typeof GPML2013a.GraphicalLineType.prototype &
  typeof GPML2013a.GroupType.prototype &
  typeof GPML2013a.InteractionType.prototype &
  typeof GPML2013a.LabelType.prototype &
  typeof GPML2013a.ShapeType.prototype &
  typeof GPML2013a.StateType.prototype;
//*/

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
  inputStream: NodeJS.ReadableStream,
  pathwayIri?: string
) {
  const selectorToCXML = {
    // TODO why does TS require that we use the Pathway's "constructor.prototype"
    // instead of just the Pathway?
    // Why does Pathway.Graphics not need that?
    // Why do many of the other require using the prototype?
    "/Pathway/@*": GPML2013a.document.Pathway.constructor.prototype,
    "/Pathway/Biopax": GPML2013a.BiopaxType.prototype,
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

  const cxmlXPath = new CXMLXPath(inputStream, GPML2013a);

  const result = cxmlXPath.parse(selectorToCXML);

  const processor = new Processor();

  hl([result["/Pathway/@*"], result["/Pathway/Graphics/@*"]])
    .merge()
    .errors(function(err) {
      throw err;
    })
    .each(function(metadata) {
      processor.output = iassign(
        processor.output,
        function(o) {
          return o.metadata;
        },
        function(outputMetadata) {
          /*
					const processed = fromPairs(
						toPairs(metadata).reduce(
							(acc, x) => concat(acc, processKV(metadata, x)),
								[]
						)
					);
					processed.type = unionLSV(processed.type, "Pathway");
					//*/
          const processed = processor.process("Pathway", metadata);

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

          return assign(outputMetadata, processed);
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
          return o.metadata;
        },
        function(outputMetadata) {
          outputMetadata.comment = iassign(
            outputMetadata.comment || [],
            function(l) {
              return l.concat([
                fromPairs(
                  toPairs(Comment).reduce(
                    (acc, x) => concat(acc, processKV(Comment, x)),
                    []
                  )
                )
              ]);
            }
          );
          return outputMetadata;
        }
      );

      processor.outputStream.write(processor.output);
    });

  hl(result["/Pathway/DataNode"])
    .errors(function(err) {
      throw err;
    })
    .each(function(DataNode) {
      const processed = processor.process("DataNode", DataNode);
      const { Type } = DataNode;
      const wpType = Type["_exists"] === false ? "Unknown" : Type;
      processed.type = unionLSV(processed.type, wpType);
      processed.wpType = wpType;

      /*
			// TODO should we update pvjsonEntity here or as part of processing result["/Pathway/Group"]?
			if (DataNode.GroupRef && !DataNode.GroupRef.hasOwnProperty("_exists")) {
			console.log("DataNode w/ GroupRef");
			console.log(DataNode);
			processor.getByGroupId(DataNode.GroupRef).then(function(group) {
			console.log("awaited group");
			console.log(group);
			});
			}
			//*/

      processor.pvjsonEntityStream.write(processed);
    });

  hl(result["/Pathway/Shape"])
    .errors(function(err) {
      throw err;
    })
    .each(function(Shape) {
      const processed = postprocessShapePVJSON(
        processor.process("Shape", Shape)
      );

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

      processor.pvjsonEntityStream.write(processed);
    });

  hl(result["/Pathway/Label"])
    .errors(function(err) {
      throw err;
    })
    .each(function(Label) {
      const processed = processor.process("Label", Label);
      processor.pvjsonEntityStream.write(processed);
    });

  //*
  const EdgeStream = hl([
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
  ])
    .merge()
    .each(function({
      edge,
      anchors
    }: {
      edge: PvjsonEdge;
      anchors: PvjsonNode[];
    }) {
      processor.pvjsonEntityStream.write(edge);
      anchors.forEach(function(anchor) {
        processor.pvjsonEntityStream.write(anchor);
      });
    });
  //*/

  //*
  hl(result["/Pathway/Group"])
    .errors(function(err) {
      throw err;
    })
    .map(preprocessGroupGPML)
    .each(function(Group) {
      const { GroupId } = Group;

      const groupedElementIds = processor.graphIdsByGroupRef[Group.GroupId];
      if (groupedElementIds) {
        const processed = processor.process("Group", Group);

        hl(groupedElementIds)
          .flatMap(function(id) {
            return hl(processor.getByGraphId(id));
          })
          .map(function(pvjsonEntity: any) {
            pvjsonEntity.isPartOf = processed.id;
            delete pvjsonEntity.groupRef;
            return pvjsonEntity;
          })
          .errors(function(err) {
            throw err;
          })
          .toArray(function(groupedEntities) {
            // TODO add zIndex, etc. to group.
            // TODO update coordinates of groupedElements to be relative to group.
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

            groupedEntities.forEach(function(groupedEntity) {
              if (isPvjsonEdge(groupedEntity)) {
                groupedEntity.points = map(groupedEntity.points, function(
                  point
                ) {
                  point.x -= x;
                  point.y -= y;
                  return point;
                });
                /*
                groupedEntity.points.forEach(function(point) {
                  point.x -= x;
                  point.y -= y;
                });
								//*/
              } else {
                groupedEntity.x -= x;
                groupedEntity.y -= y;
              }
              processor.pvjsonEntityStream.write(groupedEntity);
            });
            processor.pvjsonEntityStream.write(updatedProcessed);
          });
      }
    });
  //*/

  return processor.outputStream.debounce(17);
  //return outputStream.last();

  //export const NODES = ["DataNode", "Label", "Shape", "Group", "State"];
  //
  //export const EDGES = ["Interaction", "GraphicalLine"];
  //
  //  // The top-level Pathway GPML element and all its children that represent entities.
  //  const PATHWAY_AND_CHILD_TARGET_ELEMENTS = NODES.concat(EDGES).concat([
  //    "Pathway"
  //  ]);
  //
  //  // GPML Elements that represent entities and are grandchildren or lower descendants of top-level Pathway element.
  //  const SUB_CHILD_TARGET_ELEMENTS = ["Anchor"];
  //
  //  const TARGET_ELEMENTS = PATHWAY_AND_CHILD_TARGET_ELEMENTS.concat(
  //    SUB_CHILD_TARGET_ELEMENTS
  //  );
  //
  //  const SUPPLEMENTAL_ELEMENTS_WITH_ATTRIBUTES = ["Graphics", "Xref"];
  //  const SUPPLEMENTAL_ELEMENTS_WITH_TEXT = ["BiopaxRef", "Comment"];
  //  const NESTED_SUPPLEMENTAL_ELEMENTS = ["Point", "Attribute"];

  //  var cXMLRx = new CXMLRx(inputStream, GPML2013a);
  //  const parsed = cXMLRx.parse(selectors);
  //
  //  // Conversion steps
  //  // 1. Convert property keys
  //  // 2. Convert property values
  //  // 3. Transform structures
  //  // 4. Perform conversions with dependencies
  //
  //  // What about immutable data structures and streaming?
  //  // We are basically going to be doing "scan" for this,
  //  // where we return the entire thing each time.
  //  //
  //  // Conversion steps (updated)
  //  // 1. Return pathway metadata, incl/ boardwidth & height
  //  // 2. Convert elements
  //  //    a. Fully convert elements w/out deps. Convert elements w/ deps as much as possible.
  //  //    b. Walk tree backwards to fully convert elements w/ deps
  //
  //  return Observable.from(values(parsed) as Observable<any>[])
  //    .mergeMap(function(x) {
  //      return Observable.merge([
  //        x["/Pathway/@*"].map(function(metadata) {
  //          // TODO should this line be re-enabled?
  //          // It's pulled out of the iassign overload function,
  //          // because iassign doesn't like comments.
  //          //m.tagName = 'Pathway';
  //          return iassign(metadata, function(m) {
  //            m.id = pathwayIri;
  //            return m;
  //          });
  //        }),
  //        x["/Pathway/DataNode"]
  //          //.map(preprocessGPMLDataNode(rxSax, {}))
  //          .do(console.log),
  //        /*
  //				Observable.merge(
  //						//x['/Pathway/Label'],
  //						//x['/Pathway/Interaction'],
  //						//x['/Pathway/GraphicalLine']
  //				),
  //				//*/
  //        /*
  //					.map(value => iassign(
  //							value,
  //							(value: SimpleElement) => value.attributes,
  //							ensureGraphIdExists.bind(undefined, rxSax)
  //					)),
  //					//*/
  //        // NOTE: potential side effects
  //        /*
  //					.do(({type, value}) => ensureGraphIdExists(rxSax, value))
  //					.do(function({type, value}) {
  //						value.type = value.type || [];
  //						value.type.push(value.tagName);
  //					})
  //					//*/
  //        /*
  //					// TODO Apply whatever transformations are needed. Scan results back.
  //					.let(function(subO) {
  //						const [hasIdSource, missingIdSource] = subO
  //							.partition(({type, value}: any) => value.attributes.hasOwnProperty('GraphId'));
  //
  //						return hasIdSource.concat(
  //								missingIdSource
  //									.reduce(function(x) {
  //
  //									}, {})
  //						);
  //
  //
  //					})
  //					//*/
  //        /*
  //					.do(function({type, value}) {
  //						if (!value.attributes.hasOwnProperty('GraphId')) {
  //							console.error('Missing GraphId');
  //							console.log(value);
  //							throw new Error('Missing GraphId');
  //						}
  //					}),
  //				  //*/
  //        x["/Pathway/Biopax"]
  //      ]);
  //    })
  //    .mergeAll()
  //    .scan(
  //      function(acc, gpmlElement) {
  //        const { tagName } = gpmlElement;
  //        if (tagName === "Biopax") {
  //          gpmlElement.OpenControlledVocabulary.forEach(function(
  //            openControlledVocabulary
  //          ) {
  //            const openControlledVocabularyId = openControlledVocabulary.id;
  //            acc.elementMap[
  //              openControlledVocabularyId
  //            ] = openControlledVocabulary;
  //            acc.OpenControlledVocabulary.push(openControlledVocabularyId);
  //          });
  //          gpmlElement.PublicationXref.forEach(function(publicationXref) {
  //            const publicationXrefId = publicationXref.id;
  //            acc.elementMap[publicationXrefId] = publicationXref;
  //            acc.PublicationXref.push(publicationXrefId);
  //          });
  //          return acc;
  //        } else if (
  //          ["DataNode", "Label", "Interaction", "GraphicalLine"].indexOf(
  //            tagName
  //          ) > -1
  //        ) {
  //          return acc;
  //          /*
  //				return reduce(
  //						[value].concat(value.children),
  //						function(subAcc: any, valueOrChild: any) {
  //							elementFromGPML(acc, subAcc, valueOrChild);
  //							return subAcc;
  //						},
  //						{type: []}
  //				);
  //				//*/
  //        } else {
  //          return acc;
  //        }
  //      },
  //      TARGET_ELEMENTS.reduce(
  //        function(data, tagName) {
  //          data[tagName] = [];
  //          return data;
  //        },
  //        {
  //          elementMap: {},
  //          elements: [],
  //          GraphIdToGroupId: {},
  //          containedIdsByGroupId: {},
  //          PublicationXref: [],
  //          OpenControlledVocabulary: [],
  //
  //          Point: [],
  //          DataNode: [],
  //          Label: [],
  //          Interaction: [],
  //          GraphicalLine: []
  //        } as Data
  //      )
  //    )
  //    .do(x => console.log("next182"), console.error, x =>
  //      console.log("complete182")
  //    );
  //
  //  //	const rxSax = new RxSax(inputStream);
  //  //	return rxSax.parse(selectors)
  //  //		.mergeMap(function(x) {
  //  //			return Observable.merge([
  //  //				x['/Pathway/@*']
  //  //					.map(function(metadata) {
  //  //						// TODO should this line be re-enabled?
  //  //						// It's pulled out of the iassign overload function,
  //  //						// because iassign doesn't like comments.
  //  //						//m.tagName = 'Pathway';
  //  //						return iassign(metadata, function(m) {
  //  //							m.id = pathwayIri;
  //  //							return m;
  //  //						});
  //  //					}),
  //  //				x['/Pathway/DataNode']
  //  //					//.map(preprocessGPMLDataNode(rxSax, {}))
  //  //					.do(console.log),
  //  //				/*
  //  //				Observable.merge(
  //  //						//x['/Pathway/Label'],
  //  //						//x['/Pathway/Interaction'],
  //  //						//x['/Pathway/GraphicalLine']
  //  //				),
  //  //				//*/
  //  //					/*
  //  //					.map(value => iassign(
  //  //							value,
  //  //							(value: SimpleElement) => value.attributes,
  //  //							ensureGraphIdExists.bind(undefined, rxSax)
  //  //					)),
  //  //					//*/
  //  //					// NOTE: potential side effects
  //  //					/*
  //  //					.do(({type, value}) => ensureGraphIdExists(rxSax, value))
  //  //					.do(function({type, value}) {
  //  //						value.type = value.type || [];
  //  //						value.type.push(value.tagName);
  //  //					})
  //  //					//*/
  //  //					/*
  //  //					// TODO Apply whatever transformations are needed. Scan results back.
  //  //					.let(function(subO) {
  //  //						const [hasIdSource, missingIdSource] = subO
  //  //							.partition(({type, value}: any) => value.attributes.hasOwnProperty('GraphId'));
  //  //
  //  //						return hasIdSource.concat(
  //  //								missingIdSource
  //  //									.reduce(function(x) {
  //  //
  //  //									}, {})
  //  //						);
  //  //
  //  //
  //  //					})
  //  //					//*/
  //  //				  /*
  //  //					.do(function({type, value}) {
  //  //						if (!value.attributes.hasOwnProperty('GraphId')) {
  //  //							console.error('Missing GraphId');
  //  //							console.log(value);
  //  //							throw new Error('Missing GraphId');
  //  //						}
  //  //					}),
  //  //				  //*/
  //  //				x['/Pathway/Biopax']
  //  //					.map(function(x) {
  //  //						return reduce(
  //  //								x.children,
  //  //								parseBioPAXElements,
  //  //								{
  //  //									PublicationXref: [],
  //  //									OpenControlledVocabulary: [],
  //  //								}
  //  //						);
  //  //					}),
  //  //			]);
  //  //		})
  //  //		.mergeAll()
  //  //		.scan(function(acc, gpmlElement) {
  //  //			const {tagName} = gpmlElement;
  //  //			if (tagName === 'Biopax') {
  //  //				gpmlElement.OpenControlledVocabulary.forEach(function(openControlledVocabulary) {
  //  //					const openControlledVocabularyId = openControlledVocabulary.id;
  //  //					acc.elementMap[openControlledVocabularyId] = openControlledVocabulary;
  //  //					acc.OpenControlledVocabulary.push(openControlledVocabularyId);
  //  //				});
  //  //				gpmlElement.PublicationXref.forEach(function(publicationXref) {
  //  //					const publicationXrefId = publicationXref.id;
  //  //					acc.elementMap[publicationXrefId] = publicationXref;
  //  //					acc.PublicationXref.push(publicationXrefId);
  //  //				});
  //  //				return acc;
  //  //			} else if (['DataNode', 'Label', 'Interaction', 'GraphicalLine'].indexOf(tagName) > -1) {
  //  //				if (tagName === 'DataNode') {
  //  //					return converters[tagName](acc, gpmlElement);
  //  //				} else {
  //  //					return acc;
  //  //				}
  //  //				/*
  //  //				return reduce(
  //  //						[value].concat(value.children),
  //  //						function(subAcc: any, valueOrChild: any) {
  //  //							elementFromGPML(acc, subAcc, valueOrChild);
  //  //							return subAcc;
  //  //						},
  //  //						{type: []}
  //  //				);
  //  //				//*/
  //  //			} else {
  //  //				return acc;
  //  //			}
  //  //		},
  //  //		TARGET_ELEMENTS
  //  //			.reduce(function(data, tagName) {
  //  //				data[tagName] = [];
  //  //				return data;
  //  //			}, {
  //  //				elementMap: {},
  //  //				elements: [],
  //  //				GraphIdToGroupId: {},
  //  //				containedIdsByGroupId: {},
  //  //				PublicationXref: [],
  //  //				OpenControlledVocabulary: [],
  //  //
  //  //				Point: [],
  //  //				DataNode: [],
  //  //				Label: [],
  //  //				Interaction: [],
  //  //				GraphicalLine: [],
  //  //
  //  //
  //  //			} as Data)
  //  //		)
  //  //		.do(x => console.log('next182'), console.error, x => console.log('complete182'))
  //  //		//.do(console.log)
}
