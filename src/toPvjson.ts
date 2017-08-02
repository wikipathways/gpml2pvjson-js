/// <reference path="./json.d.ts" />
/// <reference path="../highland.d.ts" />
import "source-map-support/register";
// TODO should I get rid of the above for production, browser build?
import { assign, reduce, values } from "lodash/fp";
//import {assignInWith, isArray, values} from 'lodash';
//import {defaultsDeepAll} from 'lodash/fp';
import { supportedNamespaces, unionLSV } from "./gpml-utilities";

import { CXMLXPath } from "./topublish/cxml-xpath";

//import * as cxml from "cxml";
import * as cxml from "../../cxml/lib/cxml";

// TODO compile this as part of the build step for this package
//import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";
import * as GPML2013a from "../../cxml/test/xmlns/pathvisio.org/GPML/2013a";
import * as GPMLDefaults from "./GPMLDefaults.json";
import * as BIOPAX_TO_PVJSON from "./biopax-to-pvjson.json";
import * as iassign from "immutable-assign";
import * as hl from "highland";

iassign.setOption({
  // Deep freeze both input and output. Used in development to make sure they don't change.
  // TODO watch issue and re-enable when addressed: https://github.com/engineforce/ImmutableAssign/issues/11
  //freeze: true,
  ignoreIfNoChange: true
});

export const NODES = ["DataNode", "Label", "Shape", "Group", "State"];

export const EDGES = ["Interaction", "GraphicalLine"];

//export function convert(inputStream: any, pathwayIri?: string) {}

// TODO specify types
export function convertStreaming(
  inputStream: NodeJS.ReadableStream,
  pathwayIri?: string
) {
  // The top-level Pathway GPML element and all its children that represent entities.
  const PATHWAY_AND_CHILD_TARGET_ELEMENTS = NODES.concat(EDGES).concat([
    "Pathway"
  ]);

  // GPML Elements that represent entities and are grandchildren or lower descendants of top-level Pathway element.
  const SUB_CHILD_TARGET_ELEMENTS = ["Anchor"];

  const TARGET_ELEMENTS = PATHWAY_AND_CHILD_TARGET_ELEMENTS.concat(
    SUB_CHILD_TARGET_ELEMENTS
  );

  const SUPPLEMENTAL_ELEMENTS_WITH_ATTRIBUTES = ["Graphics", "Xref"];
  const SUPPLEMENTAL_ELEMENTS_WITH_TEXT = ["BiopaxRef", "Comment"];
  const NESTED_SUPPLEMENTAL_ELEMENTS = ["Point", "Attribute"];

  let output = {} as GPML2013a.PathwayType;
  const outputStream = hl();

  const selectorToCXML = {
    "/Pathway/@*": GPML2013a.document.Pathway,
    "/Pathway/Biopax": GPML2013a.document.Pathway.Biopax,
    "/Pathway/Comment/@*": GPML2013a.document.Pathway.Comment[0],
    "/Pathway/Comment": GPML2013a.document.Pathway.Comment[0],
    "/Pathway/DataNode": GPML2013a.document.Pathway.DataNode[0],
    "/Pathway/GraphicalLine": GPML2013a.document.Pathway.GraphicalLine[0],
    "/Pathway/Graphics/@*": GPML2013a.document.Pathway.Graphics,
    "/Pathway/Interaction": GPML2013a.document.Pathway.Interaction[0],
    "/Pathway/Label": GPML2013a.document.Pathway.Label[0]
  };

  const cxmlXPath = new CXMLXPath(inputStream, GPML2013a);

  const result = cxmlXPath.parse(selectorToCXML);

  hl([result["/Pathway/@*"], result["/Pathway/Graphics/@*"]])
    .merge()
    .reduce1(function(acc, metadata): { [key: string]: string | number } {
      return assign(acc, metadata);
    })
    .each(function(metadata) {
      output = iassign(output, function(o) {
        return assign(o, metadata);
      });
      outputStream.write(output);
    });

  hl(result["/Pathway/Comment"]).each(function(Comment) {
    output = iassign(output, function(o) {
      o.Comment = iassign(o.Comment || [], function(l) {
        return l.concat([Comment]);
      });
      return o;
    });

    outputStream.write(output);
  });

  return outputStream;

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
