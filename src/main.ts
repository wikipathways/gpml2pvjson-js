/// <reference path="../gpml2pvjson.d.ts" />

import { keys, merge, omit, values } from 'lodash';
import * as He from 'he';
import { supportedNamespaces, unionLSV } from './gpml-utilities';
import { postProcess as postProcessEdge } from './edge';
import { postProcess as postProcessGroup } from './group';
import { postProcess as postProcessInteraction } from './interaction';
import * as sax from 'sax';
import { fromGPML as elementFromGPML } from './xml-element';
import { postProcess as postProcessDataNode } from './data-node';

import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import 'rxjs/add/observable/fromEventPattern';
import 'rxjs/add/observable/merge';

import 'rxjs/add/operator/do';
import 'rxjs/add/operator/last';
import 'rxjs/add/operator/let';
import 'rxjs/add/operator/map';
import 'rx-extra/add/operator/throughNodeStream';

// TODO why was I getting an error in pvjs when I had sourceStream: Observable<string>?
//export default function(sourceStream: Observable<string>) {
//}
export default function(sourceStream: any, pathwayIri?: string) {

  const NODES = [
    'DataNode',
    'Label',
    'Shape',
    'Group',
    'State',
  ];

  const EDGES = [
    'Interaction',
    'GraphicalLine',
  ];

	// The top-level Pathway GPML element and all its children that represent entities.
  const PATHWAY_AND_CHILD_TARGET_ELEMENTS = NODES.concat(EDGES).concat([
		'Pathway',
	]);

	// GPML Elements that represent entities and are grandchildren or lower descendants of top-level Pathway element.
  const SUB_CHILD_TARGET_ELEMENTS = [
    'Anchor'
  ];
	
	const TARGET_ELEMENTS = PATHWAY_AND_CHILD_TARGET_ELEMENTS.concat(SUB_CHILD_TARGET_ELEMENTS);

  const SUPPLEMENTAL_ELEMENTS_WITH_ATTRIBUTES = [
    'Graphics',
    'Xref'
  ];
  const SUPPLEMENTAL_ELEMENTS_WITH_TEXT = [
    'BiopaxRef',
    'Comment'
  ];
  const NESTED_SUPPLEMENTAL_ELEMENTS = [
    'Point',
    'Attribute'
  ];

  let data = {
		elementMap: {},
		elements: [],
		GraphIdToGroupId: {},
		containedIdsByGroupId: {},
		PublicationXref: [],
		Point: [],
	} as Data;

	TARGET_ELEMENTS.forEach(function(gpmlElementName) {
		data[gpmlElementName] = [];
	});

  let saxStream;
  const SAX_STREAM_IS_STRICT = true; // set to false for html-mode
  let openTagStream;
  let currentTagName;
  let textStream;
  let closeTagStream;

  function createNewSAXStream() {
    // stream usage
    // takes the same options as the parser
    saxStream = sax.createStream(SAX_STREAM_IS_STRICT, {
      xmlns: true,
      trim: true
    });
    saxStream.on('error', function(e) {
      // unhandled errors will throw, since this is a proper node
      // event emitter.
      console.error('error!', e);
      // clear the error
      this._parser.error = null;
      this._parser.resume();
    });

		function fromSAXEvent(eventName) {
			return Observable.fromEventPattern(function(handler) {
				saxStream.on(eventName, handler);
			}, function(handler) {
				saxStream._parser['on' + eventName] = undefined;
			});
		}

		openTagStream = fromSAXEvent('opentag') as Observable<GPMLElement>;
		textStream = fromSAXEvent('text') as Observable<string>;
		closeTagStream = fromSAXEvent('closetag') as Observable<string>;

    return saxStream;
  }

  saxStream = createNewSAXStream();

	/* We want to be sure that every child element of the GPML Pathway element has a GraphId.
	 * If the GraphId is already specified, we don't change it.
	 * If it is not specified, we want to generate one with these properties:
	 *   1) stability/purity: always the same data output for a given GPML input.
	 *      We ensure this by using the startTagPosition.
	 *   2) uniqueness: don't clobber an existing element id in the pathway.
	 *      We do this by prepending the namespace "id-pvjson-".
	 */
  function ensureGraphIdExists(x) {
    x.attributes.GraphId = x.attributes.GraphId || {
			name: 'GraphId',
			value: 'id-pvjson-' + saxStream._parser.startTagPosition
		};
    return x;
  }

  let saxStreamFiltered = Observable.merge(openTagStream, textStream, closeTagStream);

  let currentTargetElement = {} as GPMLElement;
  let lastTargetElement = {
		attributes: {}
	} as GPMLElement;
  let currentNestedTargetElements = [];

	// NOTE: this is for handling the BioPAX as currently embedded in GPML.
	// Such BioPAX is not currently conformant with the BioPAX 3 spec.
  let currentPublicationXref;
  let currentPublicationXrefTag;
  let currentPublicationXrefDisplayName = 0;
	const bpToDataMappings = {
		'bp:ID': 'dbId',
		'bp:DB': 'dbName',
		'bp:TITLE': 'title',
		'bp:SOURCE': 'source',
		'bp:YEAR': 'year',
		'bp:AUTHORS': 'author',
	};
	function BioPAX(x): void {
		if (x === 'bp:PublicationXref') {
			const currentPublicationXrefId = currentPublicationXref.id;
			data.PublicationXref.push(currentPublicationXrefId)
			data.elementMap[currentPublicationXrefId] = currentPublicationXref;
			currentPublicationXref = null;
		} else if (x.name === 'bp:PublicationXref') {
			currentPublicationXrefDisplayName += 1;
			currentPublicationXref = {
				id: x.attributes['rdf:id'].value,
				displayName: String(currentPublicationXrefDisplayName),
				type: ['PublicationXref']
			} as PublicationXref;
		} else if (keys(bpToDataMappings).indexOf(x.name) > -1) {
			currentPublicationXrefTag = bpToDataMappings[x.name];
		} else if (!x.name && keys(bpToDataMappings).indexOf(x) === -1) {
			// using He.decode here, because some GPML at some point didn't use UTF-8
			// for things like author names.
			currentPublicationXref[currentPublicationXrefTag] = He.decode(x);
		} else if (keys(bpToDataMappings).indexOf(x) > -1) {
			currentPublicationXrefTag = null;
		}
	}

	function pushIntoArray(elements, element: DataElement): void {
		elements.push(element);
	}

	function upsertDataMapEntry(dataMap, element: DataElement): void {
		dataMap[element.id] = element;
	}

	function getFromTempById(id: string): DataElement {
		return data.elementMap[id];
	}

	function getFromTempByIdAndFilter(acc: any[], id: string): any[] {
		const element = getFromTempById(id);
		if (element) {
			acc.push(element);
		}
		return acc;
	}

	let topLevelGPMLElementStream = new Subject() as Subject<GPMLElement>;
	// TODO the union seems wrong. How do we handle this?
  saxStreamFiltered.subscribe(function(x: GPMLElement & string) {
    if (!!x.name) {
      currentTagName = x.name;
    }

    if ((PATHWAY_AND_CHILD_TARGET_ELEMENTS.indexOf(x) > -1 ||
         PATHWAY_AND_CHILD_TARGET_ELEMENTS.indexOf(x.name) > -1) &&
           PATHWAY_AND_CHILD_TARGET_ELEMENTS.indexOf(currentTargetElement.name) > -1) {
      topLevelGPMLElementStream.next(currentTargetElement);
      currentTargetElement = {} as GPMLElement;

      currentNestedTargetElements.forEach(function(currentNestedTargetElement) {
        currentNestedTargetElement.attributes.Color = {};
        currentNestedTargetElement.attributes.Color.name = 'Color';
        currentNestedTargetElement.attributes.Color.value =
          lastTargetElement.attributes.Color.value;

        currentNestedTargetElement.attributes.GraphRef = {};
        currentNestedTargetElement.attributes.GraphRef.name = 'GraphRef';
        currentNestedTargetElement.attributes.GraphRef.value =
          lastTargetElement.attributes.GraphId.value;

        currentNestedTargetElement.attributes.ZOrder = {};
        currentNestedTargetElement.attributes.ZOrder.name = 'ZOrder';
        currentNestedTargetElement.attributes.ZOrder.value =
          lastTargetElement.attributes.ZOrder.value + 0.1;

				topLevelGPMLElementStream.next(currentNestedTargetElement);
      });
      currentNestedTargetElements = [];
    }

    if (PATHWAY_AND_CHILD_TARGET_ELEMENTS.indexOf(x.name) > -1) {
      if (x.name !== 'Pathway') {
        x = ensureGraphIdExists(x);
      } else if (x.name === 'Pathway') {
        const attributes = x.attributes;
        const xmlns = attributes.xmlns.value;

        if (supportedNamespaces.indexOf(xmlns) === -1) {
          // test for whether file is GPML
					// TODO do we need to destroy saxStreamFiltered?
          const message = 'Pvjs does not support the data format provided. ' +
            'Please convert to valid GPML and retry.';
					topLevelGPMLElementStream.error(message);
        } else if (supportedNamespaces.indexOf(xmlns) !== 0) {
          // test for whether the GPML file version matches the latest version
          // (only the latest version will be supported by pvjs).
          // TODO call the Java RPC updater or in some other way call for the file to be updated.
					// TODO do we need to destroy saxStreamFiltered?
          const message = 'Pvjs may not fully support the version of GPML provided (xmlns: ' +
            xmlns + '). Please convert to the supported version of GPML (xmlns: ' +
            supportedNamespaces[0] + ').';
					topLevelGPMLElementStream.error(message);
        }
      }
      currentTargetElement = x;
    } else if (SUPPLEMENTAL_ELEMENTS_WITH_ATTRIBUTES.indexOf(x.name) > -1) {
      merge(currentTargetElement.attributes, x.attributes);
    } else if (SUB_CHILD_TARGET_ELEMENTS.indexOf(x.name) > -1) {
      x = ensureGraphIdExists(x);
      currentNestedTargetElements.push(x);
    } else if (NESTED_SUPPLEMENTAL_ELEMENTS.indexOf(x.name) > -1) {
      currentTargetElement.attributes[x.name] = currentTargetElement.attributes[x.name] || {};
      currentTargetElement.attributes[x.name].name = x.name;
      currentTargetElement.attributes[x.name].value =
        currentTargetElement.attributes[x.name].value || [];
      currentTargetElement.attributes[x.name].value.push(x);
    } else if (SUPPLEMENTAL_ELEMENTS_WITH_TEXT.indexOf(currentTagName) > -1 &&
               !x.name &&
                 currentTagName !== x) {
      currentTargetElement.attributes = currentTargetElement.attributes || {};
      currentTargetElement.attributes[currentTagName] =
        currentTargetElement.attributes[currentTagName] || {};
      currentTargetElement.attributes[currentTagName].name = currentTagName;
      currentTargetElement.attributes[currentTagName].value =
        currentTargetElement.attributes[currentTagName].value || [];
      currentTargetElement.attributes[currentTagName].value.push(x);
    } else if (x.name === 'bp:PublicationXref' || currentPublicationXref) {
			BioPAX(x);
    }

    if (x === 'Pathway') {
      topLevelGPMLElementStream.complete();
    }
  });

	let pvjsonStream = topLevelGPMLElementStream
		.do(function(element: GPMLElement) {
			if (PATHWAY_AND_CHILD_TARGET_ELEMENTS.indexOf(element.name) > -1) {
				lastTargetElement = element;
			}
			let dataElement = ((element.name !== 'Pathway') ? {} : data) as DataElement & Data;
			data = elementFromGPML({
				data: data,
				// TODO is this union below correct?
				dataElement: dataElement,
				gpmlElement: element
			});
		})
		.last()
		.map(function(gpmlElement: GPMLElement): Data {
			// TODO is there a cleaner way to handle this?
			// Right now, we're just returning data once we've gone through
			// all appropriate elements.
			return data;
		})
		.map(function(data: Data) {
			const GPML_ELEMENT_NAME_TO_PVJSON_TYPE = {
				'DataNode': 'Node',
				'Shape': 'Node',
				'Label': 'Node',
				'State': 'Decoration',
				'PublicationXref': 'Citation',
				'Group': 'Group',
				'Interaction': 'Edge',
				'GraphicalLine': 'Edge',
			};

			let elementMap = data.elementMap;
			values(elementMap)
				.map(function(element) {
					const pvjsonType = element.pvjsonType = GPML_ELEMENT_NAME_TO_PVJSON_TYPE[element.gpmlElementName];
					element.type = unionLSV(element.type, element.gpmlElementName, element.wpType, pvjsonType) as string[];
					return element;
				})
				.forEach(upsertDataMapEntry.bind(undefined, elementMap));

			data.DataNode
				.reduce(getFromTempByIdAndFilter, [])
				.map(postProcessDataNode.bind(undefined, data))
				.forEach(upsertDataMapEntry.bind(undefined, elementMap));

			// Update all groups, now that the rest of the elements have all been converted.
			data.Group
				.reduce(getFromTempByIdAndFilter, [])
				.map(postProcessGroup.bind(undefined, data))
				// A bug in PathVisio means GPML sometimes keeps empty groups.
				// We don't want these empty groups in pvjson.
				//.filter((group: DataElement) => group.contains.length > 0)
				.filter(function(group: DataElement) {
					const containsCount = group.contains.length;
					if (containsCount === 0) {
						// NOTE: notice side effect
						delete elementMap[group.id];
					}
					return containsCount > 0
				})
				.map(function(element) {
					return omit(element, ['gpml:Style']);
				})
				.forEach(function(group: DataElement) {
					upsertDataMapEntry(elementMap, group);

					// group.id refers to the value of the GraphId
					const groupId = group.id;
					group.contains.forEach(function(containedId) {
						let contained = elementMap[containedId];
						contained.isPartOf = groupId;
					});
				});

			NODES.reduce(function(acc, gpmlElementName) {
				return acc.concat(data[gpmlElementName]);
			}, [])
				.reduce(getFromTempByIdAndFilter, [])
				.map(function(element) {
					return omit(element, ['relX', 'relY']);
				})
				.forEach(pushIntoArray.bind(undefined, data.elements));

			data.GraphicalLine
				.reduce(getFromTempByIdAndFilter, [])
				.map(postProcessEdge.bind(undefined, data))
				.map(function(edge) {
					return omit(edge, ['gpml:Point']);
				})
				.forEach(pushIntoArray.bind(undefined, data.elements));

			data.Interaction
				.reduce(getFromTempByIdAndFilter, [])
				.map(postProcessEdge.bind(undefined, data))
				.map(function(edge) {
					return omit(edge, ['gpml:Point']);
				})
				.map(postProcessInteraction.bind(undefined, data))
				.forEach(pushIntoArray.bind(undefined, data.elements));

			data.PublicationXref
				.reduce(getFromTempByIdAndFilter, [])
				.forEach(pushIntoArray.bind(undefined, data.elements));

			const name = data.name;
			const organism = data.organism;
			if (!pathwayIri) {
				const organismIriComponent = !!organism ? '&species=' + organism : '';
				pathwayIri = encodeURI('http://wikipathways.org/index.php/Special:SearchPathways?query=' +
															 name + organismIriComponent + '&doSearch=1');
			}

			// TODO where should these be hosted?
			const context = [
				'https://wikipathwayscontexts.firebaseio.com/biopax.json',
				'https://wikipathwayscontexts.firebaseio.com/cellularLocation.json',
				'https://wikipathwayscontexts.firebaseio.com/display.json',
				//'https://wikipathwayscontexts.firebaseio.com/interactionType.json',
				'https://wikipathwayscontexts.firebaseio.com/organism.json',
				'https://wikipathwayscontexts.firebaseio.com/bridgedb/.json',
				{
					'@base': pathwayIri + '/'
				}
			];

			return {
				'@context': context,
				id: pathwayIri,
				name: name,
				organism: organism,
				width: data.width,
				height: data.height,
				// NOTE: GPML does not contain a way to express background color.
				// It's always just white.
				backgroundColor: 'white',
				type: ['Pathway'],
				elements: data.elements
			};
		});

  // TODO
  // * Comments
  // * Better handling of x,y for anchors

	return sourceStream
	.let(function(o) {
		o.subscribe(function(x) {
			saxStream.write(x);
		}, function(err) {
			// TODO is this how we want to handle errors?
			saxStream.emit('error', err);
			topLevelGPMLElementStream.error(err);
			saxStream.end();
			throw err;
		}, function() {
			saxStream.end();
		});
		
		return pvjsonStream;
	});
};
