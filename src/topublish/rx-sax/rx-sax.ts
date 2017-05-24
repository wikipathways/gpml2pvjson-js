import {defaults, isEmpty} from 'lodash';
import * as sax from 'sax';
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/fromEventPattern';
import 'rxjs/add/observable/merge';
import 'rxjs/add/operator/delayWhen';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/observeOn';
import 'rxjs/add/operator/reduce';
import 'rxjs/add/operator/share';
import 'rxjs/add/operator/skip';
import 'rxjs/add/operator/takeUntil';
import 'rxjs/add/operator/window';
import 'rxjs/add/operator/windowToggle';
import {queue} from 'rxjs/scheduler/queue';
import {create as createOpeningsClosingsSource} from './openingsClosingsSource';

export interface SAXAttribute {
	name: string;
	value: string;
}

export interface EnrichedSAXAttribute {
	id: string,
	name: string;
	attribute: SAXAttribute;
}

export type SimpleAttributeMap = {
	[key: string]: string;
};

export type SimpleElementPicked = Pick<Element, 'children' | 'tagName' | 'textContent'>;
export interface SimpleElement extends SimpleElementPicked {
	attributes: SimpleAttributeMap;
}
export type SimpleNode = SimpleElement | SimpleAttributeMap;

export type SimpleXPathResultKeysToPick =
	'ANY_TYPE' |
	'ANY_UNORDERED_NODE_TYPE' |
	'BOOLEAN_TYPE' |
	'FIRST_ORDERED_NODE_TYPE' |
	'NUMBER_TYPE' |
	'ORDERED_NODE_ITERATOR_TYPE' |
	'UNORDERED_NODE_ITERATOR_TYPE' |
	'ORDERED_NODE_SNAPSHOT_TYPE' |
	'UNORDERED_NODE_SNAPSHOT_TYPE' |
	'STRING_TYPE' |
	'booleanValue' |
	'numberValue' |
	'stringValue' |
	'singleNodeValue' |
	'resultType' |
	'invalidIteratorState' |
	'snapshotLength' |
	'snapshotItem';

export type SimpleXPathResultPicked = Pick<XPathResult, SimpleXPathResultKeysToPick>;
export interface SimpleXPathResult extends SimpleXPathResultPicked {
	iterateNext: () => SimpleElement;
};

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

class SaxState {
	path;
	element: any;

	constructor() {
		this.path = [];
		this.element = {};
	}

	init() {
		return this.element;
	}

	open(value) {
		let {element, path} = this;
		path.push(value['tagName']);
		if (path.length > 1) {
			let parentEl = getParent(element, path);
			let parentChildren = parentEl.children;
			parentChildren.push(value);
		} else {
			defaults(element, value)
		}
		return element;
	}

	attribute(value) {
		let {element, path} = this;
		defaults(element, value)
		/*
		if (!element.hasOwnProperty('attributes')) {
			defaults(element, value)
		}
		//*/
		return element;
	}

	attributeSet(value) {
		let {element, path} = this;
		defaults(element, value)
		/*
		if (!element.hasOwnProperty('attributes')) {
			defaults(element, value)
		}
		//*/
		return element;
	}

	text(value) {
		let {element, path} = this;
		if (path.length > 1) {
			let parentEl = getParent(element, path);
			let parentChildren = parentEl.children;
			let child = parentChildren[parentChildren.length - 1];
			child.textContent = value;
		} else {
			element.textContent += value;
		}
		return element;
	}

	close(value) {
		let {element, path} = this;
		path.pop();
		return element;
	}
}

export class RxSax<ATTR_NAMES_AND_TYPES> {
	inputSource: Observable<string>;
	endSource: any;
	saxStream: any;
	constructor(inputSource: Observable<string>) {
		this.inputSource = inputSource;
		// stream usage
		// takes the same options as the parser
		const saxStream = this.saxStream = sax.createStream(true, {
			//xmlns: true,
			trim: true
		});
		this.endSource = this.fromSAXEventNoStop('end');
	}

	fromSAXEventNoStop(eventName): Observable<SAXOpenTag<ATTR_NAMES_AND_TYPES>|SAXAttribute|string> {
		const {saxStream} = this;
		return Observable.fromEventPattern(function(handler: SaxEventHandler<ATTR_NAMES_AND_TYPES>) {
			saxStream.on(eventName, handler);
		}, function(handler) {
			saxStream._parser['on' + eventName] = undefined;
			if (!!handler) {
				handler();
			}
		});
	}

	fromSAXEvent(eventName): Observable<SAXOpenTag<ATTR_NAMES_AND_TYPES>|SAXAttribute|string> {
		const {endSource, saxStream} = this;
		return Observable.fromEventPattern(function(handler: SaxEventHandler<ATTR_NAMES_AND_TYPES>) {
			saxStream.on(eventName, handler);
		}, function(handler) {
			saxStream._parser['on' + eventName] = undefined;
			if (!!handler) {
				handler();
			}
		})
			.takeUntil(endSource)
			//.first()
			.share();
	}

	write(x) {
		this.saxStream.write(x);
	}

	end() {
		this.saxStream.end();
	}

	parse(selectors: string[]) {
		const rxSax = this;
		const {inputSource, endSource} = this;

		const openTagStartSource = rxSax.fromSAXEvent('opentagstart').share() as Observable<string>;
		const openTagFullSource = rxSax.fromSAXEvent('opentag').share() as Observable<SAXOpenTag<ATTR_NAMES_AND_TYPES>>;
		const textSource = rxSax.fromSAXEvent('text').share() as Observable<string>;
		const closeTagSource = rxSax.fromSAXEvent('closetag').share() as Observable<string>;

		/*
		const openCloseSourceNoStop = getOpenCloseSource(state, sharedAttributeSource.filter((x, i) => i % 2 === 0), sharedAttributeSource.filter((x, i) => i % 2 === 1))
		const openSource = openCloseSourceNoStop.filter(x => x);
		openCloseSource = openCloseSourceNoStop.takeUntil(sharedOpenTagSource.skipUntil(openSource));
		//*/

		const attributeSource = rxSax.fromSAXEvent('attribute')
			.mergeMap(function(subO) {
				return Observable.merge([subO, subO], queue)
			})
			.share();

		//*
		const attributeSetSource = openTagFullSource
			.map(x => x.attributes)
			.mergeMap(function(subO) {
				return Observable.merge([subO, subO], queue)
			})
			.share();
		//*/

		/*
		const attributeSetSource = attributeSource
			.window(openTagStartSource)
//			.windowToggle(openTagStartSource, function() {
//				return Observable.merge(openTagStartSource.skip(1), textSource, closeTagSource);
//			})
			.do(x => console.log('attributeSet starting'))
			.mergeMap(function(subO) {
				return subO
				.reduce(function(acc: any, {name, value}) {
					acc[name] = value;
					return acc;
				}, {});
			})
			.filter(x => !isEmpty(x))
			.do(x => console.log('attributeSet'))
			.do(console.log)
			.share();
		//*/

		const saxSource =  Observable.merge(
				openTagFullSource
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
				attributeSource
					.map(function(attribute) {
						return {
							type: 'attribute',
							value: attribute
						};
					}),
				attributeSetSource
					.map(function(attributeSet) {
						return {
							type: 'attributeSet',
							value: attributeSet
						};
					}),
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
				const openCloseSource = createOpeningsClosingsSource(
						openTagStartSource,
						openTagFullSource,
						attributeSource,
						attributeSetSource,
						textSource,
						closeTagSource,
						selector
				)
					.share();

				acc[selector] = saxSource
					//.do(x => console.log(`ln302`))
					//.do(console.log)
					.windowToggle(openCloseSource.filter(x => x), function(x) {
						return openCloseSource
							.filter(x => !x)
					})
					//.do(x => console.log(`ln310`))
					//.do(console.log)
					.mergeMap(function(subO) {
						let saxState = new SaxState();
						return subO
							// NOTE this filter is needed so that we don't add attributes to elements when
							// the attributes are already in the 'attributes' property of the element.
							// TODO it would probably be cleaner for this logic to go into the openingsClosingsSource
							// instead of here, maybe by refactoring stateStack to only accept attributes and
							// attributeSets when the selector ends in "@*" or "@MY_ATTR_NAME".
							.filter(function({type, value}, i) {
								return i === 0 || ['attribute', 'attributeSet'].indexOf(type) === -1;
							})
							.reduce(function(subAcc, {type, value}, i) {
								//console.log(`type: ${type}`);
								return saxState[type](value);
							}, saxState.init());
					})
					//.do(x => console.log(`ln318`))
					//.do(console.log)

				/*
				const openCloseSourceNoStop = getOpenCloseSource(state, sharedAttributeSource.filter((x, i) => i % 2 === 0), sharedAttributeSource.filter((x, i) => i % 2 === 1))
				const openSource = openCloseSourceNoStop.filter(x => x);
				openCloseSource = openCloseSourceNoStop.takeUntil(sharedOpenTagSource.skipUntil(openSource));
				//*/

				return acc;
			}, {});

		return Observable.create(function(observer) {
			// TODO the first item doesn't come through when I use the one-liner below,
			// but it does when I use the long-hand version further down. Why?
			//outputSource.subscribe(observer);
			//*
			// This works even when the console.logs are commented out.
			outputSource.subscribe(function(x) {
				//console.log('next');
				observer.next(x);
			}, function(err) {
				//console.log('err');
				observer.next(err);
			}, function() {
				//console.log('complete');
			});
			//*/

			inputSource.subscribe(function(x) {
				rxSax.write(x);
			}, function(err) {
				rxSax.end();
				throw err;
			}, function() {
				rxSax.end();
			});
		})
			.observeOn(queue)
			.takeUntil(endSource);

	};
}

//export class XPathEvaluator {
//	ANY_TYPE: any;
//	ANY_UNORDERED_NODE_TYPE: any;
//	BOOLEAN_TYPE: any;
//	FIRST_ORDERED_NODE_TYPE: any;
//	NUMBER_TYPE: any;
//	ORDERED_NODE_ITERATOR_TYPE: any;
//	UNORDERED_NODE_ITERATOR_TYPE: any;
//	ORDERED_NODE_SNAPSHOT_TYPE: any;
//	UNORDERED_NODE_SNAPSHOT_TYPE: any;
//	STRING_TYPE: any;
//	booleanValue: boolean;
//	numberValue: number;
//	stringValue: string;
//	singleNodeValue: any;
//	resultType: any;
//	snapshotLength: number;
//	snapshotItem: any;
//	invalidIteratorState: boolean;
//	private xpathExpression: string;
//	private data: SimpleElement[];
//	private i: number;
//	constructor(xpathExpression, contextNode, namespaceResolver, resultType, result) {
//		this.xpathExpression = xpathExpression;
//		this.data = [
//			{
//				children: null,
//				tagName: 'DIV',
//				textContent: 'wow',
//				attributes: {
//					id: 'wow',
//				}
//			}
//		];
//		this.i = 0;
//	}
//
//	iterateNext(): SimpleElement {
//		const {data, i} = this;
//		if (i >= data.length - 1) {
//			return null;
//		}
//		const next = data[i];
//		this.i += 1;
//		return next;
//	}
//}
//
//// TODO should we use this? If so, should we also use XPathEvaluator (single)?
//export class XPathEvaluatorMultiple<ATTR_NAMES_AND_TYPES> {
//	xpathExpressions: string[] = [];
//	inputSource: Observable<string>;
//	openTagFullSource: Observable<any>;
//	attributeSource: Observable<any>;
//	textSource: Observable<any>;
//	closeTagSource: Observable<any>;
//	saxSource: Observable<any>;
//	outputs: any;
//	constructor(inputSource) {
//		this.inputSource = inputSource;
//
//		// stream usage
//		// takes the same options as the parser
//		const saxStream = sax.createStream(true, {
//			//xmlns: true,
//			trim: true
//		});
//
//		function fromSAXEvent(eventName): Observable<SAXOpenTag<ATTR_NAMES_AND_TYPES>|SAXAttribute|string> {
//			return Observable.fromEventPattern(function(handler: SaxEventHandler<ATTR_NAMES_AND_TYPES>) {
//				saxStream.on(eventName, handler);
//			}, function(handler) {
//				saxStream._parser['on' + eventName] = undefined;
//			});
//		}
//
//		const openTagFullSource = this.openTagFullSource = fromSAXEvent('opentag').share() as Observable<SAXOpenTag<ATTR_NAMES_AND_TYPES>>;
//		const attributeSource = this.attributeSource = fromSAXEvent('attribute')
//			.share()
//			.mergeMap(function(x) {
//				return Observable.from([x, x], queue);
//			})
//			.delayWhen(a => openTagFullSource)
//			.share()
//		const textSource = this.textSource = fromSAXEvent('text').share() as Observable<string>;
//		const closeTagSource = this.closeTagSource = fromSAXEvent('closetag').share() as Observable<string>;
//
//		const saxSource = this.saxSource = Observable.merge(
//				openTagFullSource
//					.map(function(openTag) {
//						return {
//							type: 'open',
//							value: {
//								tagName: openTag.name,
//								textContent: '',
//								attributes: openTag.attributes,
//								children: [],
//							} 
//						};
//					}),
//				attributeSource
//					.map(function(attribute) {
//						return {
//							type: 'attribute',
//							value: attribute
//						};
//					}),
//				textSource
//					.map(function(text) {
//						return {
//							type: 'text',
//							value: text
//						};
//					}),
//				closeTagSource
//					.map(function(closeTag) {
//						return {
//							type: 'close',
//							value: closeTag
//						};
//					}),
//
//				queue
//		);
//
//		this.outputs = {};
//	}
//
//	// TODO do something with the rest of the args
//	evaluate(xpathExpression, contextNode, namespaceResolver, resultType, result) {
//		this.xpathExpressions.push(xpathExpression);
//		const {openTagFullSource, attributeSource, textSource, closeTagSource, saxSource} = this;
//		const openCloseSource = createOpeningsClosingsSource(
//				openTagFullSource,
//				attributeSource,
//				textSource,
//				closeTagSource,
//				xpathExpression
//		)
//			.share();
//
//		this.outputs[xpathExpression] = saxSource
//			.windowToggle(openCloseSource.filter(x => x), function(x) {
//				return openCloseSource
//					.filter(x => !x)
//			})
//			.mergeMap(function(subO) {
//				let saxState = SaxState();
//				return subO
//					.reduce(function(subAcc, {type, value}) {
//						return saxState[type](value);
//					}, saxState.init());
//			});
//
//		//this.outputs[xpathExpression] = new XPathEvaluator(xpathExpression, contextNode, namespaceResolver, resultType, result);
//	}
//
//	/* TODO I need to connect or publish or something here to match Rx.Observable semantics (basically start observing)
//	connect() {
//		Observable.create(function(observer) {
//			outputSource.subscribe(observer);
//			inputSource.subscribe(function(x) {
//				saxStream.write(x);
//			}, function(err) {
//				saxStream.end();
//				throw err;
//			}, function() {
//				saxStream.end();
//			});
//		})
//			.observeOn(queue);
//	}
//	//*/
//}
//
//const xPathEvaluatorMultipleInstance = new XPathEvaluatorMultiple(Observable.of('wow'));
//const xPathResult = xPathEvaluatorMultipleInstance.evaluate('//Pathway', null, null, null, null);
