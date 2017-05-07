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
import {StateMachine} from 'javascript-state-machine';
import {create as createOpeningsClosingsSource} from './openingsClosingsSource';


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

function getParent(elements, path) {
	const current = elements[elements.length - 1];
	const parentIndex = path.length - 2;
	return path.slice(0, parentIndex).reduce(function(elements, pathX) {
		const children = elements.children;
		return children[children.length - 1];
	}, current);
}

function getCurrent(elements) {
	return elements[elements.length - 1];
}

function Stater() {
	let path = [];
	let elements = [];
	return {
		init: function() {
			return elements;
		},
		open: function(value) {
			path.push(value['tagName']);
			let elementsOrChildren;
			if (path.length > 1) {
				let current = getCurrent(elements);
				let parentEl = getParent(elements, path);
				let parentChildren = parentEl.children;
				parentChildren.push(value);
			} else {
				elements.push(value);
			}
			return elements;
		},
		text: function(value) {
			let current = getCurrent(elements);
			if (path.length > 1) {
				let parentEl = getParent(elements, path);
				let parentChildren = parentEl.children;
				let child = parentChildren[parentChildren.length - 1];
				child.textContent = value;
			} else {
				current.textContent += value;
			}
			return elements;
		},
		close: function(value) {
			path.pop();
			return elements;
		},
	};
}

export function parse<ATTR_NAMES_AND_TYPES>(
		sourceStream: Observable<string>,
		selectors: string[]
) {
	// stream usage
	// takes the same options as the parser
	const saxStream = sax.createStream(true, {
		//xmlns: true,
		trim: true
	});

	function fromSAXEvent(eventName): Observable<any> {
		return Observable.fromEventPattern(function(handler: SaxEventHandler<ATTR_NAMES_AND_TYPES>) {
			saxStream.on(eventName, handler);
		}, function(handler) {
			saxStream._parser['on' + eventName] = undefined;
		});
	}

	const openTagStream = fromSAXEvent('opentag').share() as Observable<ATTR_NAMES_AND_TYPES>;
	//const attributeStream = fromSAXEvent('attribute').share() as Observable<string>;
	const textStream = fromSAXEvent('text').share() as Observable<string>;
	const closeTagStream = fromSAXEvent('closetag').share() as Observable<string>;

	const saxSource =  Observable.merge(
			openTagStream
				.map(function(openTag: any) {
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
			/* TODO this returns attributes before openTags, so we won't know which tag we're on
			attributeStream
				.map(function(attribute) {
					return {
						type: 'attribute',
						value: attribute
					};
				}),
			//*/
			textStream
				.map(function(text) {
					return {
						type: 'text',
						value: text
					};
				}),
			closeTagStream
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
		.reduce(function(acc: any, selector: string) {
			const startStopSource = createOpeningsClosingsSource(
					openTagStream,
					//attributeStream,
					textStream,
					closeTagStream,
					selector
			)
				.share();

			acc[selector] = saxSource.
				windowToggle(startStopSource.filter(x => x), function(x) {
					return startStopSource
						.filter(x => !x);
				})
				.mergeMap(function(subO) {
					let stater: any = Stater();
					return subO
						.reduce(function(subAcc, {type, value}) {
							return stater[type](value);
						}, stater.init());
				});

			return acc;
		}, {});

	return Observable.create(function(observer) {
		outputSource.subscribe(observer);
		sourceStream.subscribe(function(x) {
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
