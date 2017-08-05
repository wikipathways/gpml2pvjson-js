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
  flatten,
  flattenDepth,
  fromPairs,
  isArray,
  isObject,
  toPairs,
  toPairsIn,
  reduce,
  values
} from "lodash/fp";
import { supportedNamespaces, transform, unionLSV } from "./gpml-utilities";

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

  if (gpmlKey[0] === "_") {
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

function process(gpmlElementName, gpmlElement) {
  const processed = fromPairs(
    toPairs(gpmlElement).reduce(
      (acc, x) => concat(acc, processKV(gpmlElement, x)),
      []
    )
  );
  processed.type = unionLSV(processed.type, gpmlElementName);

  return processed;
}

//mutableAssign(GPML2013a.document.Pathway.Label[0].Graphics.constructor.prototype, new GPMLDefaults.Label().Graphics);
//console.log("new GPMLDefaults.Label().Graphics");
//console.log(new GPMLDefaults.Label().Graphics);
//GPML2013a.document.Pathway.Label[0].Graphics.constructor.prototype.Color = new GPMLDefaults.Label().Graphics.Color;
//GPML2013a.document.Pathway.Label[0].Graphics.constructor.prototype.ShapeType = new GPMLDefaults.Label().Graphics.ShapeType;
//extendDeep(GPML2013a.document.Pathway.Label[0], GPMLDefaults.Label);
/*
GPML2013a.LabelType.prototype.Graphics.constructor.prototype.Color =
  GPMLDefaults.Label.Graphics.Color;
GPML2013a.document.Pathway.Label[0].Graphics.constructor.prototype.ShapeType =
  GPMLDefaults.Label.Graphics.ShapeType;
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
  let output = {} as {
    comment: any[];
    entities: any[];
  };
  const outputStream = hl();

  const selectorToCXML = {
    "/Pathway/@*": GPML2013a.document.Pathway,
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

  hl([result["/Pathway/@*"], result["/Pathway/Graphics/@*"]])
    .merge()
    .each(function(metadata) {
      output = iassign(output, function(o) {
        const processed = process("Pathway", metadata);

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

  hl(result["/Pathway/Comment"]).each(function(Comment) {
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

  hl(result["/Pathway/DataNode"]).each(function(DataNode) {
    const { Type } = DataNode;
    const wpType = Type["_exists"] === false ? "Unknown" : Type;
    output = iassign(output, function(o) {
      o.entities = iassign(o.entities || [], function(l) {
        const processed = process("DataNode", DataNode);
        processed.type = unionLSV(processed.type, wpType);
        processed.wpType = wpType;
        return l.concat([processed]);
      });
      return o;
    });

    outputStream.write(output);
  });

  hl(result["/Pathway/Shape"]).each(function(Shape) {
    output = iassign(output, function(o) {
      o.entities = iassign(o.entities || [], function(l) {
        const processed = process("Shape", Shape);

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

        return l.concat([processed]);
      });
      return o;
    });

    outputStream.write(output);
  });

  hl(result["/Pathway/Label"]).each(function(Label) {
    output = iassign(output, function(o) {
      o.entities = iassign(o.entities || [], function(l) {
        const processed = process("Label", Label);
        return l.concat([processed]);
      });
      return o;
    });

    outputStream.write(output);
  });

  hl(result["/Pathway/Interaction"]).each(function(Interaction) {
    output = iassign(output, function(o) {
      o.entities = iassign(o.entities || [], function(l) {
        const processed = process("Interaction", Interaction);
        return l.concat([processed]);
      });
      return o;
    });

    outputStream.write(output);
  });

  hl(result["/Pathway/GraphicalLine"]).each(function(GraphicalLine) {
    output = iassign(output, function(o) {
      o.entities = iassign(o.entities || [], function(l) {
        const processed = process("GraphicalLine", GraphicalLine);
        return l.concat([processed]);
      });
      return o;
    });

    outputStream.write(output);
  });

  hl(result["/Pathway/Group"]).each(function(Group) {
    const { Style } = Group;

    output = iassign(output, function(o) {
      o.entities = iassign(o.entities || [], function(l) {
        const processed = process("Interaction", Group);

        processed["gpml:Style"] = Style;
        delete processed.style;

        processed.type = unionLSV(processed.type, ["Group" + Style]);
        return l.concat([processed]);
      });
      return o;
    });

    outputStream.write(output);
  });

  return outputStream.debounce(17);

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
