/// <reference path="./json.d.ts" />
/// <reference path="../highland.d.ts" />
import "source-map-support/register";
// TODO should I get rid of the lib above for production browser build?

import { assign as mutableAssign } from "lodash";
import {
  assign,
  camelCase,
  concat,
  defaultsDeep,
  find,
  flatten,
  flattenDepth,
  fromPairs,
  isArray,
  isObject,
  isString,
  keysIn,
  map,
  toPairs,
  toPairsIn,
  reduce,
  values
} from "lodash/fp";
import {
  arrayify,
  supportedNamespaces,
  transform,
  unionLSV
} from "./gpml-utilities";

import { CXMLXPath } from "./topublish/cxml-xpath";

//import * as cxml from "cxml";
import * as cxml from "../../cxml/lib/cxml";

// TODO compile this as part of the build step for this package
//import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";
import * as GPML2013a from "../../cxml/test/xmlns/pathvisio.org/GPML/2013a";
import * as GPMLDefaults from "./GPMLDefaults";
import * as BioPAXToPvjson from "./BioPAXToPvjson.json";
import * as GPML2013aKeyMappings from "./GPML2013aKeyMappings.json";
import * as GPML2013aValueMappings from "./GPML2013aValueMappings.json";
import * as GPML2013aValueConverters from "./GPML2013aValueConverters";
import * as iassign from "immutable-assign";
import * as hl from "highland";

import { createEdgeTransformStream } from "./edge";
import { process as processInteraction } from "./Interaction";

iassign.setOption({
  // Deep freeze both input and output. Used in development to make sure they don't change.
  // TODO watch issue and re-enable when addressed: https://github.com/engineforce/ImmutableAssign/issues/11
  //freeze: true,
  ignoreIfNoChange: true
});

function liftProperties(target, source) {
  return assign(target, source);
}

function addressPathVisioShapeRenderingBugs(gpmlElement, pvjsonElement) {
  const { Rotation, ShapeType } = gpmlElement.Graphics;
  let transformationSequence = [];

  // Correct GPML position and size values.
  //
  // Some GPML elements with ShapeTypes have Graphics values that
  // do not match what is visually displayed in PathVisio-Java.
  // Below are corrections for the GPML so that the display in
  // pvjs matches the display in PathVisio-Java.

  let xTranslation;
  let yTranslation;
  let xScale;
  let yScale;

  if (ShapeType === "Triangle") {
    // NOTE: the numbers below come from visually experimenting with different widths
    // in PathVisio-Java and making linear approximations of the translation
    // scaling required to make x, y, width and height values match what is visually
    // displayed in PathVisio-Java.
    xScale = (pvjsonElement.width + 0.04) / 1.07 / pvjsonElement.width;
    yScale = (pvjsonElement.height - 0.14) / 1.15 / pvjsonElement.height;
    xTranslation = 0.28 * pvjsonElement.width - 2.0;
    yTranslation = 0;

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: Rotation
      });
    }

    transformationSequence.push({
      key: "translate",
      value: [xTranslation, yTranslation]
    });

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: -1 * Rotation
      });
    }

    transformationSequence.push({
      key: "scale",
      value: [xScale, yScale]
    });
  } else if (ShapeType === "Hexagon") {
    xScale = 1;
    yScale = 0.88;
    transformationSequence.push({
      key: "scale",
      value: [xScale, yScale]
    });
  } else if (ShapeType === "Pentagon") {
    xScale = 0.9;
    yScale = 0.95;
    xTranslation = 0.047 * pvjsonElement.width + 0.01;
    yTranslation = 0;

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: Rotation
      });
    }

    transformationSequence.push({
      key: "translate",
      value: [xTranslation, yTranslation]
    });

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: -1 * Rotation
      });
    }

    transformationSequence.push({
      key: "scale",
      value: [xScale, yScale]
    });
  } else if (ShapeType === "Arc") {
    xScale = 1;
    yScale = 0.5;
    xTranslation = 0;
    yTranslation = pvjsonElement.height * yScale / 2;

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: Rotation
      });
    }

    transformationSequence.push({
      key: "translate",
      value: [xTranslation, yTranslation]
    });

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: -1 * Rotation
      });
    }

    transformationSequence.push({
      key: "scale",
      value: [xScale, yScale]
    });
  }
  /*
		else if (ShapeType === 'Sarcoplasmic Reticulum') {
		// TODO: enable this after comparing results from old converter
			xScale = 0.76;
			yScale = 0.94;
			xTranslation = 0.043 * pvjsonElement.width + 0.01;
			yTranslation = 0.009 * pvjsonElement.height - 15.94;

			if (typeof Rotation === 'number' && Rotation !== 0) {
				transformationSequence.push({
					key: 'rotate',
					value: Rotation
				});
			}

			transformationSequence.push({
				key: 'translate',
				value: [xTranslation, yTranslation]
			});

			if (typeof Rotation === 'number' && Rotation !== 0) {
				transformationSequence.push({
					key: 'rotate',
					value: (-1) * Rotation
				});
			}

			transformationSequence.push({
				key: 'scale',
				value: [xScale, yScale]
			});
		}
		//*/

  return transform({
    element: pvjsonElement,
    transformationSequence: transformationSequence
  });
}

function processKV(gpmlElement, [gpmlKey, gpmlValue]) {
  const pvjsonKey = GPML2013aKeyMappings[gpmlKey];
  // NOTE "pvjson:lift" is for elements like "Graphics", where they
  // are nested in GPML but are merged into the parent in pvjson.

  if (gpmlKey[0] === "_" || pvjsonKey === "pvjson:delete") {
    // NOTE: we don't want to include "private" keys, such as
    // "_exists" or "_namespace".
    return [];
  } else if (pvjsonKey === "pvjson:lift") {
    return toPairsIn(gpmlValue)
      .map(processKV.bind(undefined, gpmlElement))
      .map(flatten);
  } else if (gpmlKey === "Attribute") {
    // NOTE: in GPML, 'Attribute' is an XML *ELEMENT* named "Attribute".
    return toPairs(
      gpmlValue
        .map(function({ Key, Value }) {
          return processKV(gpmlElement, [Key, Value]);
        })
        .reduce(function(acc, [[processedKey, processedValue]]) {
          // NOTE: this looks more complicated than it needs to be,
          // but it's to handle the case where there are two or more
          // sibling Attribute elements that share the same Key.
          // I don't know of any cases of this in our actual GPML,
          // but the XSD does not require unique Keys for sibling
          // Attributes.
          if (acc.hasOwnProperty(processedKey)) {
            acc[processedKey] = unionLSV(acc[processedKey], processedValue);
          } else {
            acc[processedKey] = processedValue;
          }
          return acc;
        }, {})
    );
  } else {
    // NOTE: jsSafeGPMLKey is for attributes like "Data-Source", because
    // this is not valid JS:
    //   export function Data-Source() {};
    const jsSafeGPMLKey = gpmlKey.replace("-", "");
    const pvjsonValue = GPML2013aValueConverters.hasOwnProperty(jsSafeGPMLKey)
      ? GPML2013aValueConverters[jsSafeGPMLKey](gpmlElement)
      : gpmlValue;
    /* TODO for gpmlValues that are arrays, do we want to recursively descend into and process each array element?
      : isArray(gpmlValue)
        ? gpmlValue.map(function(valueItem) {
            if (!isObject(valueItem) || isArray(valueItem)) {
              return valueItem;
            } else {
              return fromPairs(
                toPairs(valueItem).map(function([key, value]) {
                  return processKV(valueItem, [key, value]);
                })
              );
            }
          })
        : gpmlValue;
		//*/
    // NOTE: not including key/value pairs when the value is missing
    if (["", null, undefined].indexOf(pvjsonValue) === -1) {
      return [
        [
          pvjsonKey || camelCase(gpmlKey),
          GPML2013aValueConverters.hasOwnProperty(jsSafeGPMLKey)
            ? GPML2013aValueConverters[jsSafeGPMLKey](gpmlElement)
            : GPML2013aValueMappings.hasOwnProperty(gpmlKey)
              ? GPML2013aValueMappings[gpmlKey]
              : gpmlValue
        ]
      ];
    } else {
      return [];
    }
  }
}

// see
// https://github.com/PathVisio/pathvisio/blob/3cb194f120de550ef2e102877965bed3c54a6a75/modules/org.pathvisio.core/src/org/pathvisio/core/biopax/BiopaxElement.java#L245
export class GraphIdManager {
  greatestAsInt: number;
  constructor() {
    this.greatestAsInt = parseInt("0xa00", 16);
  }

  generateAndRecord() {
    this.greatestAsInt += 1;
    return this.greatestAsInt.toString(16);
  }

  recordExisting(graphIdAsHex) {
    const { greatestAsInt } = this;
    const graphIdAsInt = parseInt(graphIdAsHex, 16);
    if (graphIdAsInt > greatestAsInt) {
      this.greatestAsInt = graphIdAsInt;
    }
  }
}

export class Processor {
  graphIdManager: GraphIdManager;

  graphIdsByGraphRef: any;
  graphIdsByGroupRef: any;

  promisedGraphIdByGroupId: any;
  promisedPvjsonElementByGraphId: any;

  pvjsonElementStream: Highland.Stream<any>;
  groupIdToGraphIdStream: Highland.Stream<any>;

  constructor() {
    this.graphIdManager = new GraphIdManager();

    this.graphIdsByGraphRef = {};
    const graphIdsByGraphRef = this.graphIdsByGraphRef;

    this.graphIdsByGroupRef = {};

    this.promisedGraphIdByGroupId = {};
    const promisedGraphIdByGroupId = this.promisedGraphIdByGroupId;

    this.promisedPvjsonElementByGraphId = {};
    const promisedPvjsonElementByGraphId = this.promisedPvjsonElementByGraphId;

    const pvjsonElementStream = hl();
    this.pvjsonElementStream = pvjsonElementStream;
    pvjsonElementStream.each(function(pvjsonElement: any) {
      const { isAttachedTo, id } = pvjsonElement;
      promisedPvjsonElementByGraphId[id] = Promise.resolve(pvjsonElement);

      if (!!isAttachedTo) {
        arrayify(isAttachedTo).forEach(function(graphRef) {
          graphIdsByGraphRef[graphRef] = graphIdsByGraphRef[graphRef] || [];
          graphIdsByGraphRef[graphRef].push(id);
        });
      }
    });

    const groupIdToGraphIdStream = hl();
    this.groupIdToGraphIdStream = groupIdToGraphIdStream;
    groupIdToGraphIdStream.each(function([groupId, graphId]) {
      promisedGraphIdByGroupId[groupId] = Promise.resolve(graphId);
    });

    /*
    endStream.each(function(x) {
      groupIdToGraphIdStream.end();
      pvjsonElementStream.end();
    });
		//*/
  }

  getByGraphId = graphId => {
    let promisedPvjsonElement = this.promisedPvjsonElementByGraphId[graphId];
    if (promisedPvjsonElement) {
      return promisedPvjsonElement;
    } else {
      const { pvjsonElementStream } = this;
      promisedPvjsonElement = new Promise(function(resolve, reject) {
        pvjsonElementStream
          .observe()
          .find(pvjsonElement => pvjsonElement.id === graphId)
          .errors(reject)
          .each(resolve);
      });

      return promisedPvjsonElement;
    }
  };

  getByGroupId = targetGroupId => {
    const { getByGraphId, groupIdToGraphIdStream } = this;
    let promisedGraphId = this.promisedGraphIdByGroupId[targetGroupId];
    if (!promisedGraphId) {
      promisedGraphId = this.promisedGraphIdByGroupId[
        targetGroupId
      ] = new Promise(function(resolve, reject) {
        groupIdToGraphIdStream
          .observe()
          .find(([groupId, graphId]) => groupId === targetGroupId)
          .errors(reject)
          .each(function([groupId, graphId]) {
            resolve(graphId);
          });
      });
    }

    return promisedGraphId.then(getByGraphId);
  };

  process = (gpmlElementName, gpmlElement) => {
    const { graphIdManager } = this;
    const { GroupId, GroupRef } = gpmlElement;

    let GraphId = gpmlElement.GraphId;
    // Does the schema allow the element to have a GraphId?
    if (!!GraphId) {
      // Does it actually have one?
      if (GraphId._exists === false) {
        // NOTE: we are making sure that elements that CAN have a GraphId
        // always DO have a GraphId. GraphIds are optional in GPML for Groups,
        // so we will add one if it's not already specified. But Pathway
        // elements never have GraphIds, so we don't add one for them.
        GraphId = gpmlElement.GraphId = graphIdManager.generateAndRecord();
      } else {
        graphIdManager.recordExisting(GraphId);
      }

      if (!!GroupRef && GroupRef._exists !== false) {
        this.graphIdsByGroupRef[GroupRef] =
          this.graphIdsByGroupRef[GroupRef] || [];
        this.graphIdsByGroupRef[GroupRef].push(GraphId);
      }

      if (!!GroupId && GroupId._exists !== false) {
        this.groupIdToGraphIdStream.write([GroupId, GraphId]);
      }
    }

    const processed = fromPairs(
      toPairs(gpmlElement).reduce(
        (acc, x) => concat(acc, processKV(gpmlElement, x)),
        []
      )
    );
    processed.type = unionLSV(processed.type, gpmlElementName);

    return processed;
  };
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
  mutableAssign(target.constructor.prototype, source);
}

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
  let output = {
    entities: []
  } as {
    comment: any[];
    entities: any[];
  };
  const outputStream = hl();

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
      output = iassign(output, function(o) {
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

        return assign(o, processed);
      });
      outputStream.write(output);
    });

  hl(result["/Pathway/Comment"])
    .errors(function(err) {
      throw err;
    })
    .each(function(Comment) {
      output = iassign(output, function(o) {
        o.comment = iassign(o.comment || [], function(l) {
          return l.concat([
            fromPairs(
              toPairs(Comment).reduce(
                (acc, x) => concat(acc, processKV(Comment, x)),
                []
              )
            )
          ]);
        });
        return o;
      });

      outputStream.write(output);
    });

  hl(result["/Pathway/DataNode"])
    .errors(function(err) {
      throw err;
    })
    .each(function(DataNode) {
      const { Type } = DataNode;
      const wpType = Type["_exists"] === false ? "Unknown" : Type;
      output = iassign(output, function(o) {
        o.entities = iassign(o.entities, function(l) {
          const processed = processor.process("DataNode", DataNode);
          processed.type = unionLSV(processed.type, wpType);
          processed.wpType = wpType;
          processor.pvjsonElementStream.write(processed);
          /*
				// TODO should we update pvjsonElement here or as part of processing result["/Pathway/Group"]?
        if (DataNode.GroupRef && !DataNode.GroupRef.hasOwnProperty("_exists")) {
          console.log("DataNode w/ GroupRef");
          console.log(DataNode);
          processor.getByGroupId(DataNode.GroupRef).then(function(group) {
            console.log("awaited group");
            console.log(group);
          });
        }
        //*/
          return l.concat([processed]);
        });
        return o;
      });

      outputStream.write(output);
    });

  hl(result["/Pathway/Shape"])
    .errors(function(err) {
      throw err;
    })
    .each(function(Shape) {
      output = iassign(output, function(o) {
        o.entities = iassign(o.entities, function(l) {
          const processed = processor.process("Shape", Shape);

          const { cellularComponent } = processed;
          // CellularComponent is not a BioPAX term, but "PhysicalEntity" is.
          if (!!cellularComponent) {
            processed.type = unionLSV(
              processed.type,
              "PhysicalEntity",
              "CellularComponent",
              cellularComponent
            );
          }

          processor.pvjsonElementStream.write(processed);
          return l.concat([processed]);
        });
        return o;
      });

      outputStream.write(output);
    });

  hl(result["/Pathway/Label"])
    .errors(function(err) {
      throw err;
    })
    .each(function(Label) {
      output = iassign(output, function(o) {
        o.entities = iassign(o.entities, function(l) {
          const processed = processor.process("Label", Label);
          processor.pvjsonElementStream.write(processed);
          return l.concat([processed]);
        });
        return o;
      });

      outputStream.write(output);
    });

  const InteractionStream = hl(result["/Pathway/Interaction"])
    .errors(function(err) {
      throw err;
    })
    .through(createEdgeTransformStream(processor, "Interaction"))
    .each(function({ edge, anchors, referencedEntities }) {
      processor.pvjsonElementStream.write(edge);
      anchors.forEach(function(anchor) {
        processor.pvjsonElementStream.write(anchor);
      });
      output = iassign(output, function(o) {
        o.entities = iassign(o.entities, function(l) {
          return l
            .concat([processInteraction(referencedEntities, edge)])
            .concat(anchors);
        });
        return o;
      });

      outputStream.write(output);
    });

  hl(result["/Pathway/GraphicalLine"])
    .errors(function(err) {
      throw err;
    })
    .through(createEdgeTransformStream(processor, "GraphicalLine"))
    .each(function({ edge, anchors }) {
      processor.pvjsonElementStream.write(edge);
      anchors.forEach(function(anchor) {
        processor.pvjsonElementStream.write(anchor);
      });
      output = iassign(output, function(o) {
        o.entities = iassign(o.entities, function(l) {
          return l.concat([edge]).concat(anchors);
        });
        return o;
      });

      outputStream.write(output);
    });

  hl(result["/Pathway/Group"])
    .errors(function(err) {
      throw err;
    })
    .each(function(Group) {
      const { GroupId, Style } = Group;

      const groupedElementIds = processor.graphIdsByGroupRef[Group.GroupId];
      if (groupedElementIds) {
        const processed = processor.process("Group", Group);

        processed["gpml:Style"] = Style;
        delete processed.style;
        delete processed.groupId;

        processed.type = unionLSV(processed.type, ["Group" + Style]);

        hl(groupedElementIds)
          .flatMap(function(id) {
            return hl(processor.getByGraphId(id));
          })
          .map(function(pvjsonElement: any) {
            pvjsonElement.isPartOf = processed.id;
            delete pvjsonElement.groupRef;
            return pvjsonElement;
          })
          .errors(function(err) {
            throw err;
          })
          .toArray(function(groupedElements) {
            // TODO add zIndex, etc. to group.
            // TODO update coordinates of groupedElements to be relative to group.
            processed.groupContents = groupedElements;
            processor.pvjsonElementStream.write(processed);
            output = iassign(output, function(o) {
              o.entities = iassign(
                o.entities.filter(
                  entity => groupedElementIds.indexOf(entity.id) === -1
                ),
                function(l) {
                  return l.concat([processed]);
                }
              );
              return o;
            });

            outputStream.write(output);
          });
      }
    });

  return outputStream.debounce(17);
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
