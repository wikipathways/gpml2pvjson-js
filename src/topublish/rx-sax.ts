/// <reference path="../../gpml2pvjson.d.ts" />

import {defaults, forEach, keys, map, merge, reduce} from 'lodash';
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

	/*
	queue.schedule(function(state) {
		const that = this;
		forEach(selectors, function(selector) {
			that.schedule(
				state[selector] = createOpeningsClosingsSource(
						openTagStream,
						attributeStream,
						textStream,
						closeTagStream,
						selector
				)
			);
		});
	}, 0, {});
	//*/

	const outputSource =  Observable.merge(
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
	)
		.let(function(o) {
			return Observable.from(selectors)
				.reduce(function(acc: any, selector) {
					const startStopSource = createOpeningsClosingsSource(
							openTagStream,
							//attributeStream,
							textStream,
							closeTagStream,
							selector
					);
//						.mergeMap(function(openingsClosingsSource) {
//							/*
//							console.log('openingsClosingsSource');
//							console.log(openingsClosingsSource);
//							openingsClosingsSource.subscribe(function(x) {
//								console.log('openingsClosingsSource');
//								console.log(x);
//							}, console.error);
//							//console.log(`typeof startStopSource1: ${typeof startStopSource1}`)
//							//*/
//							/*
//							const startStopSource = Observable.merge(
//									openTagStream.filter(n => n['name'] === 'DataNode').mapTo(true),
//									closeTagStream.filter(t => t === 'DataNode').mapTo(false)//,
//									//queue
//							);
//							return o.windowToggle(startStopSource.filter(x => x).do(x => console.log('|> start')), function(x) {
//								//return closeTagStream.filter(t => t === 'DataNode');
//								return startStopSource.filter(x => !x).do(x => console.log('|| stop'));
//							})
//							//*/
//							//*
//							return o
//								//.do(console.log)
//								.windowToggle(openingsClosingsSource.filter(x => x), function(x) {
//									return openingsClosingsSource.filter(x => !x);
//								})
//							//*/
//						})
							//console.log(`startStopSource`)
							//console.log(startStopSource)
							const startSource = startStopSource
								.filter(x => x)
								.do(x => console.log('|> start'))
								.reduce(function(acc: Observable<boolean>, s: boolean): Observable<boolean> {
									//return Observable.merge(acc, Observable.of(s))
									return Observable.merge(acc, Observable.of(s))
								}, Observable.of(true));

							const stopSource = startStopSource
								.filter(x => !x)
								.do(x => console.log('|| stop'))
								.reduce(function(acc: Observable<boolean>, s: boolean): Observable<boolean> {
									return Observable.merge(acc, Observable.of(s));
								}, Observable.of(true));
							let path = [];

							acc[selector] = o.windowToggle(startSource, function(x) {
									return stopSource;
								})
								/*
								return o.withLatestFrom(startStopSource, function(x, record) {
									return record ? x : false;
								})
								//.timeoutWith(400, Observable.of(false))
								.filter(x => !!x)
								//*/
								.reduce(function(acc, x: any) {
								//.scan(function(acc, x: any) {...})
									console.log('acc166');
									console.log(acc);
									const type = x.type;
									const value = x.value;

									//console.log('x178');
									//console.log(x);

									if (type === 'open') {
										const openTagName = value['tagName'];
										path.push(openTagName);
									} else if (type === 'close') {
										path.pop();
									}

									let current;
									if (path.length === 1) {
										if (type === 'open') {
											const openTagName = value['tagName'];
											current = Array(4 * (path.length - 1) + 1).join(' ') + openTagName;
											//console.log();
											/*
											current = value;
											current.textContent = '';
											current.children = [];
											//*/
											acc.push(current);
										} else if (type === 'text') {
											/*
											current = acc[acc.length - 1];
											current.textContent += value;
											//*/
										}
									} else if (path.length > 1) {
										/*
										current = acc[acc.length - 1];
										const parentIndex = path.length - 2;
										let parentEl = path.slice(0, parentIndex).reduce(function(subAcc, pathX) {
											const children = subAcc.children;
											return children[children.length - 1];
										}, current);
										let parentChildren = parentEl.children;
										if (type === 'open') {
											parentChildren.push(value);
										} else if (type === 'text') {
											const el = parentChildren[parentChildren.length - 1];
											el.textContent = value;
										}
										//*/
									} else {
										//current = {textContent: '', children: []};
									}

									//console.log('acc226');
									//console.log(acc);
									return acc;
								}, [])
								/*
								return o
									.windowToggle(startStopSource.filter(x => x).do(x => console.log('|> start')), function(x) {
										//return startStopSource.filter(x => !x).do(x => console.log('|| stop'));
										return startStopSource.do(x => console.log('|| stop'));
									})
								//*/
									/*
									.do(function(x) {
										console.log('x184');
										console.log(x);
									})
									.do(function(x) {
										x.subscribe(function(y) {
											console.log('y184');
											console.log(y);
										})
									})
									//*/
//									.map(function(o) {
//										//console.log('o182');
//										//console.log(o);
//										let path = [];
//										return o
//											.reduce(function(acc, x: any) {
//											//.scan(function(acc, x: any) {})
//												const type = x.type;
//												const value = x.value;
//
//												//console.log('x178');
//												//console.log(x);
//
//												if (type === 'open') {
//													const openTagName = value['tagName'];
//													path.push(openTagName);
//												} else if (type === 'close') {
//													path.pop();
//												}
//
//												let current;
//												if (path.length === 1) {
//													if (type === 'open') {
//														const openTagName = value['tagName'];
//														current = Array(4 * (path.length - 1) + 1).join(' ') + openTagName;
//														//console.log();
//														/*
//														current = value;
//														current.textContent = '';
//														current.children = [];
//														//*/
//														acc.push(current);
//													} else if (type === 'text') {
//														/*
//														current = acc[acc.length - 1];
//														current.textContent += value;
//														//*/
//													}
//												} else if (path.length > 1) {
//													/*
//													current = acc[acc.length - 1];
//													const parentIndex = path.length - 2;
//													let parentEl = path.slice(0, parentIndex).reduce(function(subAcc, pathX) {
//														const children = subAcc.children;
//														return children[children.length - 1];
//													}, current);
//													let parentChildren = parentEl.children;
//													if (type === 'open') {
//														parentChildren.push(value);
//													} else if (type === 'text') {
//														const el = parentChildren[parentChildren.length - 1];
//														el.textContent = value;
//													}
//													//*/
//												} else {
//													//current = {textContent: '', children: []};
//												}
//
//												//console.log('acc226');
//												//console.log(acc);
//												return acc;
//											}, [])
//									});

					return acc;
				}, {})
		})
















//	const outputSource = Observable.from(selectors, queue)
//		.reduce(function(acc: any, selector) {
//			console.log(`selector: ${selector}`)
//		  acc[selector] = createOpeningsClosingsSource(
//					openTagStream,
//					attributeStream,
//					textStream,
//					closeTagStream,
//					selector
//			)
//				.mergeMap(function(startStopSource) {
//					console.log(`startStopSource`)
//					console.log(startStopSource)
//					return Observable.merge(
//							openTagStream
//								.map(function(openTag: any) {
//									return {
//										type: 'open',
//										value: {
//											tagName: openTag.name,
//											textContent: '',
//											attributes: openTag.attributes,
//											children: [],
//										} 
//									};
//								}),
//							attributeStream
//								.map(function(attribute) {
//									return {
//										type: 'attribute',
//										value: attribute
//									};
//								}),
//							textStream
//								.map(function(text) {
//									return {
//										type: 'text',
//										value: text
//									};
//								}),
//							closeTagStream
//								.map(function(closeTag) {
//									return {
//										type: 'close',
//										value: closeTag
//									};
//								}),
//
//							queue
//					)
//						/*
//						.windowToggle(Observable.of(true, async), function(x) {
//							//return Observable.of(false, queue).delay(0);
//							return startStopSource.filter(x => !x);
//						})
//						//*/
//						//*
//						.windowToggle(startStopSource.filter(x => x).do(x => console.log('|> start')), function(x) {
//							console.log('inside windowToggle');
//							//startStopSource.filter(x => x === 'close').subscribe(function(x) {})
//							startStopSource.subscribe(function(x) {
//								console.log('|||||||||||||| windowStatus: ' + x)
//							});
//							//console.log('inside windowToggle');
//							return startStopSource.filter(x => !x);
//							//return startStopSource.filter(x => !x).do(x => console.log('|| stop')).map(x => x);
//							//return Observable.of('close').do(x => console.log('|| stop'));
//							//return Observable.of('close', queue).do(x => console.log('close before delay')).do(x => console.log('close after delay'));
//							//return Observable.of('close').delay(0);
//							//return startStopSource.filter(x => !x).do(x => console.log('|| stop'));
//						})
//						//*/
//
//						/*
//						.reduce(function(accSource, xSource) {
//							return accSource.mergeMap(function({path, output}) {
//								return xSource.map(function({type, value}) {
//
//									if (type === 'open') {
//										const openTagName = value['tagName'];
//										path.push(openTagName);
//									} else if (type === 'close') {
//										path.pop();
//									}
//
//									if (path.length === 1) {
//										if (type === 'open') {
//											output = defaults(output, value);
//										} else if (type === 'text') {
//											output.textContent += value;
//										}
//									} else if (path.length > 1) {
//										const parentIndex = path.length - 2;
//										let parentEl = path.slice(0, parentIndex).reduce(function(subAcc, pathX) {
//											const children = subAcc.children;
//											return children[children.length - 1];
//										}, output);
//										let parentChildren = parentEl.children;
//										if (type === 'open') {
//											parentChildren.push(value);
//										} else if (type === 'text') {
//											const el = parentChildren[parentChildren.length - 1];
//											el.textContent = value;
//										}
//									}
//
//									return {
//										path: path,
//										output: output
//									};
//								})
//							})
//						}, Observable.of({path: [], output: {textContent: '', children: []}}))
//						//.mergeMap(x => x)
//						.mergeAll()
//						//.do(console.log, console.error)
//						.map(acc => acc.output);
//						//*/
//
//						//*
//						.do(function(x) {
//							console.log('x184');
//							console.log(x);
//						})
//						.do(function(x) {
//							x.subscribe(function(y) {
//								console.log('y184');
//								console.log(y);
//							})
//						})
//						.mergeMap(function(o) {
//							console.log('o182');
//							console.log(o);
//							let path = [];
//							return o
//								.reduce(function(acc, x: any) {
//								//.scan(function(acc, x: any) {})
//									const type = x.type;
//									const value = x.value;
//
//									console.log('x178');
//									console.log(x);
//
//									if (type === 'open') {
//										const openTagName = value['tagName'];
//										path.push(openTagName);
//									} else if (type === 'close') {
//										path.pop();
//									}
//
//									let current;
//									if (path.length === 1) {
//										if (type === 'open') {
//											const openTagName = value['tagName'];
//											current = Array(4 * (path.length - 1) + 1).join(' ') + openTagName;
//											//console.log();
//											/*
//											current = value;
//											current.textContent = '';
//											current.children = [];
//											//*/
//											acc.push(current);
//										} else if (type === 'text') {
//											/*
//											current = acc[acc.length - 1];
//											current.textContent += value;
//											//*/
//										}
//									} else if (path.length > 1) {
//										/*
//										current = acc[acc.length - 1];
//										const parentIndex = path.length - 2;
//										let parentEl = path.slice(0, parentIndex).reduce(function(subAcc, pathX) {
//											const children = subAcc.children;
//											return children[children.length - 1];
//										}, current);
//										let parentChildren = parentEl.children;
//										if (type === 'open') {
//											parentChildren.push(value);
//										} else if (type === 'text') {
//											const el = parentChildren[parentChildren.length - 1];
//											el.textContent = value;
//										}
//										//*/
//									} else {
//										//current = {textContent: '', children: []};
//									}
//
//									console.log('acc226');
//									console.log(acc);
//									return acc;
//								}, [])
//						});
//						//*/
//
//						/*
//						.concatMap(function(o) {
//							let path = [];
//							return o
//								.reduce(function(acc, x: any) {
//								//.scan(function(acc, x: any) {})
//									const type = x.type;
//									const value = x.value;
//
//									if (type === 'open') {
//										const openTagName = value['tagName'];
//										path.push(openTagName);
//									} else if (type === 'close') {
//										path.pop();
//									}
//
//									if (path.length === 1) {
//										if (type === 'open') {
//											acc = defaults(acc, value);
//										} else if (type === 'text') {
//											acc.textContent += value;
//										}
//									} else if (path.length > 1) {
//										const parentIndex = path.length - 2;
//										let parentEl = path.slice(0, parentIndex).reduce(function(subAcc, pathX) {
//											const children = subAcc.children;
//											return children[children.length - 1];
//										}, acc);
//										let parentChildren = parentEl.children;
//										if (type === 'open') {
//											parentChildren.push(value);
//										} else if (type === 'text') {
//											const el = parentChildren[parentChildren.length - 1];
//											el.textContent = value;
//										}
//									} else {
//										acc = {textContent: '', children: []};
//									}
//
//									return acc;
//								}, {textContent: '', children: []})
//						});
//						//*/
//				});
//
//			console.log('acc315');
//			console.log(acc);
//			return acc;
//		}, {});

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
