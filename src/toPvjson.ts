import 'source-map-support/register'
// TODO should I get rid of the above for production, browser build?
import {keys, map, merge, toPairs, reduce} from 'lodash';
import {supportedNamespaces} from './gpml-utilities';
import {unionLSV} from './gpml-utilities';
import {fromGPML as elementFromGPML} from './xml-element';
import {postProcess} from './post-process';
import {parseBioPAXElements} from './Biopax';
import {SimpleElement, RxSax} from './topublish/rx-sax/rx-sax';
import {preprocessGPMLElement as preprocessGPMLDataNode, convert as convertDataNode} from './DataNode';

import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/merge';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/last';
import 'rxjs/add/operator/let';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/partition';
import 'rxjs/add/operator/scan';
import 'rxjs/add/operator/toArray';
import 'rx-extra/add/operator/throughNodeStream';

import * as iassign from 'immutable-assign';
iassign.setOption({
	// Deep freeze both input and output. Used in development to make sure they don't change. 
	// TODO watch issue and re-enable when addressed: https://github.com/engineforce/ImmutableAssign/issues/11
	//freeze: true,
	ignoreIfNoChange: true,
});

export const NODES = [
	'DataNode',
	'Label',
	'Shape',
	'Group',
	'State',
];

export const EDGES = [
	'Interaction',
	'GraphicalLine',
];

export function convert(inputStream: any, pathwayIri?: string) {
};

const converters = {
	DataNode: convertDataNode,
};

// TODO why was I getting an error in pvjs when I had inputStream: Observable<string>?
//export default function(inputStream: Observable<string>) {
//}
export function convertStreaming(inputStream: any, pathwayIri?: string) {

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

	const selectors = [
		'/Pathway/@*',
		'/Pathway/DataNode',
		'/Pathway/Label',
		'/Pathway/Interaction',
		'/Pathway/GraphicalLine',
		'/Pathway/Biopax',
	];













	/*
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
               !x.name && currentTagName !== x) {
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
	//*/


























	const rxSax = new RxSax(inputStream);
	return rxSax.parse(selectors)
		.mergeMap(function(x) {
			return Observable.merge([
				x['/Pathway/@*']
					.map(function(metadata) {
						// TODO should this line be re-enabled?
						// It's pulled out of the iassign overload function,
						// because iassign doesn't like comments.
						//m.tagName = 'Pathway';
						return iassign(metadata, function(m) {
							m.id = pathwayIri;
							return m;
						});
					}),
				x['/Pathway/DataNode']
					.map(preprocessGPMLDataNode(rxSax, {}))
					.do(console.log),
				/*
				Observable.merge(
						//x['/Pathway/Label'],
						//x['/Pathway/Interaction'],
						//x['/Pathway/GraphicalLine']
				),
				//*/
					/*
					.map(value => iassign(
							value,
							(value: SimpleElement) => value.attributes,
							ensureGraphIdExists.bind(undefined, rxSax)
					)),
					//*/
					// NOTE: potential side effects
					/*
					.do(({type, value}) => ensureGraphIdExists(rxSax, value))
					.do(function({type, value}) {
						value.type = value.type || [];
						value.type.push(value.tagName);
					})
					//*/
					/*
					// TODO Apply whatever transformations are needed. Scan results back.
					.let(function(subO) {
						const [hasIdSource, missingIdSource] = subO
							.partition(({type, value}: any) => value.attributes.hasOwnProperty('GraphId'));

						return hasIdSource.concat(
								missingIdSource
									.reduce(function(x) {

									}, {})
						);


					})
					//*/
				  /*
					.do(function({type, value}) {
						if (!value.attributes.hasOwnProperty('GraphId')) {
							console.error('Missing GraphId');
							console.log(value);
							throw new Error('Missing GraphId');
						}
					}),
				  //*/
				x['/Pathway/Biopax']
					.map(function(x) {
						return reduce(
								x.children,
								parseBioPAXElements,
								{
									PublicationXref: [],
									OpenControlledVocabulary: [],
								}
						);
					}),
			]);
		})
		.mergeAll()
		.scan(function(acc, gpmlElement) {
			const {tagName} = gpmlElement;
			if (tagName === 'Biopax') {
				gpmlElement.OpenControlledVocabulary.forEach(function(openControlledVocabulary) {
					const openControlledVocabularyId = openControlledVocabulary.id;
					acc.elementMap[openControlledVocabularyId] = openControlledVocabulary;
					acc.OpenControlledVocabulary.push(openControlledVocabularyId);
				});
				gpmlElement.PublicationXref.forEach(function(publicationXref) {
					const publicationXrefId = publicationXref.id;
					acc.elementMap[publicationXrefId] = publicationXref;
					acc.PublicationXref.push(publicationXrefId);
				});
				return acc;
			} else if (['DataNode', 'Label', 'Interaction', 'GraphicalLine'].indexOf(tagName) > -1) {
				if (tagName === 'DataNode') {
					return converters[tagName](acc, gpmlElement);
				} else {
					return acc;
				}
				/*
				return reduce(
						[value].concat(value.children),
						function(subAcc: any, valueOrChild: any) {
							elementFromGPML(acc, subAcc, valueOrChild);
							return subAcc;
						},
						{type: []}
				);
				//*/
			} else {
				return acc;
			}
		},
		TARGET_ELEMENTS
			.reduce(function(data, tagName) {
				data[tagName] = [];
				return data;
			}, {
				elementMap: {},
				elements: [],
				GraphIdToGroupId: {},
				containedIdsByGroupId: {},
				PublicationXref: [],
				OpenControlledVocabulary: [],

				Point: [],
				DataNode: [],
				Label: [],
				Interaction: [],
				GraphicalLine: [],


			} as Data)
		)
		.do(x => console.log('next182'), console.error, x => console.log('complete182'))
		//.do(console.log)
};
