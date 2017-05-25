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
import 'rxjs/add/operator/windowToggle';
import {queue} from 'rxjs/scheduler/queue';
import {create as createOpeningsClosingsSource} from './openingsClosingsSource';

export interface SAXAttribute {
	name: string;
	value: string;
}

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
		return element;
	}

	attributeSet(value) {
		let {element, path} = this;
		defaults(element, value)
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

		const attributeSource = rxSax.fromSAXEvent('attribute')
			// NOTE openingsClosingsSource needs openTagFull before attribute
			.delayWhen(x => openTagFullSource)
			.mergeMap(function(subO) {
				return Observable.merge([subO, subO], queue)
			})
			.share() as Observable<SAXAttribute>;

		const attributeSetSource = openTagFullSource
			.map(x => x.attributes)
			.mergeMap(function(subO) {
				return Observable.merge([subO, subO], queue)
			})
			.share();

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
					.map(function({name, value}) {
						return {
							type: 'attribute',
							value: {
								[name]: value
							}
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
					.windowToggle(openCloseSource.filter(x => x), function(x) {
						return openCloseSource
							.filter(x => !x)
					})
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
								return saxState[type](value);
							}, saxState.init());
					})

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

