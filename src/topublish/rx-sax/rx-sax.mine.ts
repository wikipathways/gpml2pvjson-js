/// <reference path="../../gpml2pvjson.d.ts" />

import {defaults, keys, merge} from 'lodash';
import * as sax from 'sax';
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/fromEventPattern';
import 'rxjs/add/observable/merge';
import 'rxjs/add/observable/zip';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/find';
import 'rxjs/add/operator/last';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeAll';
import 'rxjs/add/operator/reduce';
import 'rxjs/add/operator/scan';
import 'rxjs/add/operator/share';
import 'rxjs/add/operator/window';
import 'rxjs/add/operator/windowToggle';
import 'rxjs/add/operator/windowWhen';
import 'rx-extra/add/operator/throughNodeStream';

declare interface BoundaryAcc {
	closeCount: number;
	closeOn?: string;
}

export function parse<ATTR_NAMES_AND_TYPES>(
		sourceStream: Observable<string>,
		header: string = '/*',
		split?: string[]
) {
	const parsedHeader = header.split('/');
	// stream usage
	// takes the same options as the parser
	const saxStream = sax.createStream(true, {
		xmlns: true,
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
	const textStream = fromSAXEvent('text').share() as Observable<string>;
	const closeTagStream = fromSAXEvent('closetag').share() as Observable<string>;

	const openTagStreamFiltered = openTagStream.filter(function(openTag) {
		return split.indexOf(openTag['name']) > -1;
	}).share() as Observable<ATTR_NAMES_AND_TYPES>;

	const closeTagStreamFiltered = closeTagStream.filter(function(closeTagName) {
		return split.indexOf(closeTagName) > -1;
	}).share();

	const boundaryStreamFiltered = Observable.zip(openTagStreamFiltered, closeTagStreamFiltered)
		.scan(function(acc: BoundaryAcc, [openTag, closeTagName]): BoundaryAcc {
			const openTagName = openTag['name'];
			const closeOn = acc.closeOn = acc.closeOn || openTagName;
			if (openTagName === closeOn) {
				acc.closeCount += 1;
			}
			if (closeTagName === closeOn) {
				acc.closeCount -= 1;
				if (acc.closeCount === 0) {
					acc.closeOn = null;
				}
			}
			return acc;
		}, {closeCount: 0})
		.filter(x => x.closeCount === 0);

	const headerSource = openTagStream
		.find(function(openTag) {
			const openTagName = openTag['name'];
			return openTagName === parsedHeader[1];
		})
		.map(function(openTag) {
			const attrQuery = parsedHeader[2].split('@');
			const attributes = openTag['attributes'];
			if (attrQuery[1] === '*') {
				return attributes;
			} else if (attrQuery.length > 1) {
				return attributes[attrQuery[1]];
			} else {
				return openTag;
			}
		});

	const splitSource = Observable.merge(
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
				})
	)
		.windowToggle(openTagStreamFiltered, function(openTag) {
			return boundaryStreamFiltered;
		})
		.concatMap(function(o) {
			let path = [];
			return o
				.reduce(function(acc, x: any) {
					const type = x.type;
					const value = x.value;
					const openTagName = value['name'];

					if (type === 'open') {
						path.push(openTagName);
					} else if (type === 'close') {
						path.pop();
					}

					if (path.length === 1) {
						if (type === 'open') {
							acc = defaults(acc, value);
						} else if (type === 'text') {
							acc.textContent += value;
						}
					} else if (path.length > 1) {
						const parentIndex = path.length - 2;
						let parentEl = path.slice(0, parentIndex).reduce(function(subAcc, pathX) {
							const children = subAcc.children;
							return children[children.length - 1];
						}, acc);
						let parentChildren = parentEl.children;
						if (type === 'open') {
							parentChildren.push(value);
						} else if (type === 'text') {
							const el = parentChildren[parentChildren.length - 1];
							el.textContent = value;
						}
					}

					return acc;
				}, {textContent: '', children: []});
		});

	return Observable.create(function(observer) {
		Observable.merge(headerSource, splitSource).subscribe(observer);
		sourceStream.subscribe(function(x) {
			saxStream.write(x);
		}, function(err) {
			saxStream.end();
			throw err;
		}, function() {
			saxStream.end();
		});
	});

};
