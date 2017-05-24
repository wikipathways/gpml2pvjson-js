/// <reference path="../gpml2pvjson.d.ts" />

import {keys, merge} from 'lodash';
import * as He from 'he';
import {generatePublicationXrefId, supportedNamespaces} from './gpml-utilities';
import {unionLSV} from './gpml-utilities';
import * as sax from 'sax';
import {sax as saxtract} from 'saxtract';
import {fromGPML as elementFromGPML} from './xml-element';
import {postProcess} from './post-process';

import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/fromEventPattern';
import 'rxjs/add/observable/merge';

//import {parse} from './topublish/rx-sax/rx-sax';
import {RxSax} from './topublish/rx-sax/rx-sax';

import 'rxjs/add/operator/do';
import 'rxjs/add/operator/last';
import 'rxjs/add/operator/let';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/takeUntil';
import 'rxjs/add/operator/toArray';
import 'rx-extra/add/operator/throughNodeStream';

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

  let data = {
		elementMap: {},
		elements: [],
		GraphIdToGroupId: {},
		containedIdsByGroupId: {},
		PublicationXref: [],
		Point: [],
	} as Data;

	/* We want to be sure that every child element of the GPML Pathway element has a GraphId.
	 * If the GraphId is already specified, we don't change it.
	 * If it is not specified, we want to generate one with these properties:
	 *   1) stability/purity: always the same data output for a given GPML input.
	 *      We ensure this by using the startTagPosition.
	 *   2) uniqueness: don't clobber an existing element id in the pathway.
	 *      We do this by prepending the namespace "id-pvjson-".
	 */
//  function ensureGraphIdExists(x) {
//    x.attributes.GraphId = x.attributes.GraphId || {
//			name: 'GraphId',
//			value: 'id-pvjson-' + saxStream._parser.startTagPosition
//		};
//    return x;
//  }

  let currentTargetElement = {} as GPMLElement;
  let lastTargetElement = {
		attributes: {}
	} as GPMLElement;
  let currentNestedTargetElements = [];

	// NOTE: this is for handling the BioPAX as currently embedded in GPML.
	// Such BioPAX is not currently conformant with the BioPAX 3 spec.
  let currentPublicationXref;
  let currentPublicationXrefTag;
  //let currentPublicationXrefDisplayName = 0;
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
			//currentPublicationXrefDisplayName += 1;
			currentPublicationXref = {
				id: generatePublicationXrefId(x.attributes['rdf:id'].value),
				//displayName: String(currentPublicationXrefDisplayName),
				type: ['PublicationXref'],
				gpmlElementName: 'BiopaxRef',
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

	const selectors = [
		//'/Pathway',
		//'/Pathway/@Name',
		'/Pathway/@*',
		'/Pathway/DataNode',
		//'/Pathway/DataNode/@GraphId',
		//'/Pathway/DataNode/@*',
		'/Pathway/Label',
		//'/Pathway/Label/@*',
	];

	const rxSax = new RxSax(inputStream);
	return rxSax.parse(selectors)
	/*
  .mergeMap(function(x) {
    const sources = selectors.reduce(function(acc, selector) {
      acc.push(x[selector]);
      return acc;
    }, []);
    return Observable.merge(sources);
  })
	//*/
  .mergeMap(function(x) {
    return Observable.merge([
			//*
			x['/Pathway/@*']
				.map(function(metadata) {
					//console.log('metadata167');
					//console.log(metadata);
					return metadata;
				}),
				//.takeUntil(x['/Pathway/DataNode'])
				//.do(x => console.log('next171'), console.error, x => console.log('complete171'))
				//.do(x => console.log('next173'), console.error, x => console.log('complete173'))
//				.reduce(function(acc, metadata) {
//					const {name, value} = metadata;
//					acc[name] = value;
//					//console.log('metadata173');
//					//console.log(metadata);
//					return acc;
//				}, {}),
			//*/
			x['/Pathway/DataNode'],
			//x['/Pathway/Label/@*'],
			//x['/Pathway/Label'],
		]);
  })
	//.do(x => console.log('next180'), console.error, x => console.log('complete180'))
  .mergeAll()
	//.do(x => console.log('next182'), console.error, x => console.log('complete182'))
	//.do(console.log)
	//.toArray()

//  .mergeMap(function(x) {
//		//return x['/Pathway/@*']
//		return x['/Pathway/DataNode']
//			.do(x => console.log('next169'), console.error, x => console.log('complete169'))
//			.map(function(metadata) {
//				console.log('metadata167');
//				console.log(metadata);
//				return metadata;
//			})
//			.do(x => console.log('next171'), console.error, x => console.log('complete171'))
//			.toArray()
//			.do(x => console.log('next173'), console.error, x => console.log('complete173'))
//			.map(function(metadata) {
//				//console.log('metadata173');
//				//console.log(metadata);
//				return metadata;
//			})
//			.do(x => console.log('next205'), console.error, x => console.log('complete205'))
//  })
	//.do(x => console.log('next208'), console.error, x => console.log('complete208'))
};
