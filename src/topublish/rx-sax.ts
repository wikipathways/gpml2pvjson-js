/// <reference path="../../gpml2pvjson.d.ts" />

import {defaults, find, forEach, keys, map, merge, reduce} from 'lodash';
import * as sax from 'sax';
import {Observable} from 'rxjs/Observable';
import {ReplaySubject} from 'rxjs/ReplaySubject';
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/fromEventPattern';
import 'rxjs/add/observable/merge';
import 'rxjs/add/observable/zip';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/delay';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/find';
import 'rxjs/add/operator/let';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mapTo';
import 'rxjs/add/operator/mergeAll';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/observeOn';
import 'rxjs/add/operator/publishReplay';
import 'rxjs/add/operator/reduce';
import 'rxjs/add/operator/repeat';
import 'rxjs/add/operator/scan';
import 'rxjs/add/operator/skip';
import 'rxjs/add/operator/share';
import 'rxjs/add/operator/takeUntil';
import 'rxjs/add/operator/timeoutWith';
import 'rxjs/add/operator/window';
import 'rxjs/add/operator/windowToggle';
import 'rxjs/add/operator/windowWhen';
import 'rxjs/add/operator/withLatestFrom';
import 'rx-extra/add/operator/throughNodeStream';
import {async} from 'rxjs/scheduler/async';
import {queue} from 'rxjs/scheduler/queue';
import {create as createOpeningsClosingsSource} from './openingsClosingsSource';

export interface SAXAttribute {
	name: string;
	value: string;
}

export interface EnrichedSAXAttribute {
	name: string;
	attribute: SAXAttribute;
}

export type StrippedAttribute = {
	[key: string]: string;
};

export type StrippedNodePicked = Pick<Node, 'childNodes' | 'localName'>;
export interface StrippedNode extends StrippedNodePicked {
	attributes: StrippedAttribute;
}

export type StrippedXPathResultPicked = Pick<XPathResult, 'booleanValue' | 'numberValue' | 'stringValue' | 'invalidIteratorState' | 'singleNodeValue' | 'snapshotLength' | 'snapshotItem'>;
export interface StrippedXPathResult extends StrippedXPathResultPicked {
	iterateNext: () => StrippedNode;
};

export class XPathEvaluator {
	/*
	ANY_TYPE: any;
	ANY_UNORDERED_NODE_TYPE: any;
	BOOLEAN_TYPE: any;
	FIRST_ORDERED_NODE_TYPE: any;
	NUMBER_TYPE: any;
	ORDERED_NODE_ITERATOR_TYPE: any;
	UNORDERED_NODE_ITERATOR_TYPE: any;
	ORDERED_NODE_SNAPSHOT_TYPE: any;
	UNORDERED_NODE_SNAPSHOT_TYPE: any;
	STRING_TYPE: any;
	resultType: any;
	//*/
	booleanValue: boolean;
	numberValue: number;
	stringValue: string;
	invalidIteratorState: boolean;
	singleNodeValue: any;
	snapshotLength: number;
	snapshotItem: any;
	private xpathExpression: string;
	private data: StrippedNode[];
	private i: number;
	constructor(xpathExpression, contextNode, namespaceResolver, resultType, result) {
		this.xpathExpression = xpathExpression;
		this.data = [
			{
				childNodes: null,
				localName: 'DIV',
				attributes: {
					id: 'wow',
				}
			}
		];
		this.i = 0;
	}

	iterateNext(): StrippedNode {
		const {data, i} = this;
		if (i >= data.length - 1) {
			return null;
		}
		const next = data[i];
		this.i += 1;
		return next;
	}
}

export class XPathEvaluatorMultiple {
	source: Observable<string>;
	outputs: any;
	constructor(source) {
		this.source = source;
		this.outputs = {};
	}
	
	evaluate(xpathExpression, contextNode, namespaceResolver, resultType, result) {
		this.outputs[xpathExpression] = new XPathEvaluator(xpathExpression, contextNode, namespaceResolver, resultType, result);
	}
}

const hey: StrippedNode = {
	childNodes: null,
	localName: 'DIV',
	attributes: {
		id: 'wow',
	}
}

const wow = new XPathEvaluatorMultiple(Observable.of('wow'));
//const wow: StrippedXPathResult = new XPathEvaluator('//Pathway');

/*
State
  |
  v            Event ->   | init | open | text | close |
--------------------------|----------------------------|
s0: uninitialized, x=0    |  s1  |  -   |  -   |   -   |
s1: adding to level x=1   |  -   |s2,x+1|  s1  |  s5   |
s2: adding to level x>1   |  -   |s2,x+1|  s2  |s2,x-1 |
s3: complete              |  -   |  -   |  -   |  -    |
*/

function getParent(element, path) {
	const parentIndex = path.length - 2;
	return path.slice(0, parentIndex).reduce(function(el, pathX) {
		const children = el.children;
		return children[children.length - 1];
	}, element);
}

function SaxState() {
	let path = [];
	let element: any = {};
	return {
		init: function() {
			return element;
		},
		open: function(value) {
			/*
			console.log('path');
			console.log(path);
			console.log('value');
			console.log(value);
			//*/
			path.push(value['tagName']);
			if (path.length > 1) {
				let parentEl = getParent(element, path);
				let parentChildren = parentEl.children;
				parentChildren.push(value);
			} else {
				defaults(element, value)
			}
			return element;
		},
		attribute: function(value) {
			//path.push(value['tagName']);
			if (path.length > 1) {
				let parentEl = getParent(element, path);
				let parentChildren = parentEl.children;
				parentChildren.push(value);
			} else {
				defaults(element, value)
			}
			return element;
		},
		/*
		attribute: function(value) {
			if (path.length > 1) {
				let parentEl = getParent(element, path);
				let parentChildren = parentEl.children;
				let child = parentChildren[parentChildren.length - 1];
				child.attributes[value.attribute.name] = value.attribute.value;
			} else {
				element.attributes[value.attribute.name] = value.attribute.value;
			}
			return element;
		},
		//*/
		text: function(value) {
			if (path.length > 1) {
				let parentEl = getParent(element, path);
				let parentChildren = parentEl.children;
				let child = parentChildren[parentChildren.length - 1];
				child.textContent = value;
			} else {
				element.textContent += value;
			}
			return element;
		},
		close: function(value) {
			path.pop();
			return element;
		},
	};
}

export function parse<ATTR_NAMES_AND_TYPES>(
		inputSource: Observable<string>,
		selectors: string[]
) {
	// stream usage
	// takes the same options as the parser
	const saxStream = sax.createStream(true, {
		//xmlns: true,
		trim: true
	});

	function fromSAXEvent(eventName): Observable<SAXOpenTag<ATTR_NAMES_AND_TYPES>|SAXAttribute|string> {
		return Observable.fromEventPattern(function(handler: SaxEventHandler<ATTR_NAMES_AND_TYPES>) {
			saxStream.on(eventName, handler);
		}, function(handler) {
			saxStream._parser['on' + eventName] = undefined;
		});
	}

	const openTagSource = fromSAXEvent('opentag').share() as Observable<SAXOpenTag<ATTR_NAMES_AND_TYPES>>;
	//const attributeSource = fromSAXEvent('opentag').share() as Observable<ATTR_NAMES_AND_TYPES>;
	//*
	const attributeSource = fromSAXEvent('attribute')
		.map(function(attribute: SAXAttribute): EnrichedSAXAttribute {
			return {
				name: saxStream['_parser']['tagName'],
				attribute: attribute
			};
		})
		.share();
	//*/
	const textSource = fromSAXEvent('text').share() as Observable<string>;
	const closeTagSource = fromSAXEvent('closetag').share() as Observable<string>;

	const saxSource =  Observable.merge(
			openTagSource
				.map(function(openTag) {
					return {
						type: 'open',
						value: {
							tagName: openTag.name,
							textContent: '',
							attributes: openTag.attributes,
							children: [],
						} 
					};
				}),
			//* TODO this returns attributes before openTags, so we won't know which tag we're on
			attributeSource
				.map(function(enrichedAttribute) {
					return {
						type: 'attribute',
						value: {
							tagName: enrichedAttribute.name,
							attribute: enrichedAttribute.attribute,
						}
					};
				}),
			//*/
			textSource
				.map(function(text) {
					return {
						type: 'text',
						value: text
					};
				}),
			closeTagSource
				.map(function(closeTag) {
					return {
						type: 'close',
						value: closeTag
					};
				}),

			queue
	);

	const outputSource = Observable.from(selectors)
		// TODO add types for acc and output
		.reduce(function(acc, selector: string) {
			const startStopSource = createOpeningsClosingsSource(
					openTagSource,
					attributeSource,
					textSource,
					closeTagSource,
					selector
			)
				.share();

			acc[selector] = saxSource.
				windowToggle(startStopSource.filter(x => x), function(x) {
					return startStopSource
						.filter(x => !x);
				})
				.mergeMap(function(subO) {
					let saxState = SaxState();
					return subO
						.reduce(function(subAcc, {type, value}) {
							return saxState[type](value);
						}, saxState.init());
				});

			return acc;
		}, {});

	return Observable.create(function(observer) {
		outputSource.subscribe(observer);
		inputSource.subscribe(function(x) {
			saxStream.write(x);
		}, function(err) {
			saxStream.end();
			throw err;
		}, function() {
			saxStream.end();
		});
	})
		.observeOn(queue);

};
