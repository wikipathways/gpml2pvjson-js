/// <reference path="../../gpml2pvjson.d.ts" />

import {defaults, keys, map, merge, reduce} from 'lodash';
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/empty';
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/fromEventPattern';
import 'rxjs/add/observable/merge';
import 'rxjs/add/observable/zip';
import 'rxjs/add/operator/concat';
import 'rxjs/add/operator/distinctUntilChanged';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/find';
import 'rxjs/add/operator/let';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mapTo';
import 'rxjs/add/operator/mergeAll';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/pairwise';
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
import {asap} from 'rxjs/scheduler/asap';
import {async} from 'rxjs/scheduler/async';
import {queue} from 'rxjs/scheduler/queue';
import {parse as parseXPath} from './xpath';
import {State} from './State';
import {StartState} from './StartState';
import {ChildState} from './ChildState';
import {SelfOrDescendantState} from './SelfOrDescendantState';
import {AttributeState} from './AttributeState';
import {create as createStateStack} from './stateStack';

export type GenericState = StartState | ChildState | SelfOrDescendantState | AttributeState;

export function create<ATTR_NAMES_AND_TYPES>(
		openTagSource: Observable<ATTR_NAMES_AND_TYPES>,
		//attributeSource: Observable<string>,
		textSource: Observable<string>,
		closeTagSource: Observable<string>,
		selector: string
): Observable<boolean> {

	//const nonAttributeSource = Observable.merge(openTagSource, textSource, closeTagSource, queue).share();

	const stateStack = createStateStack(selector);

	const sharedOpenTagSource = openTagSource.share().do(function(x) {`openTag: ${x['tagName']}`});
	const sharedCloseTagSource = closeTagSource.share();

	/*
	const tagDepthSource = Observable.merge(
			sharedOpenTagSource.mapTo(1),
			sharedCloseTagSource.mapTo(-1),
			//asap
			//async
			queue
	)
		.scan(function(acc, x) {
			return acc + x;
		}, 0)
		.share();
	//*/

	/*
	const tagDepthSource = Observable.merge(
			Observable.of(true).concat(sharedOpenTagSource).mapTo(1),
			sharedCloseTagSource.mapTo(-1),
			queue
	)
		.pairwise()
		.scan(function(acc, [previous, current]) {
			return acc + current;
		}, 0)
		.share();
	//*/

  let currentDepth = 0;
	sharedOpenTagSource/*.do(console.log)*/.subscribe(function(node) {
		currentDepth += 1
		//console.log(Array(4 * (currentDepth - 1) + 1).join(' ') + '<' + node['name'] + '>');
		//console.log(`currentDepth: ${currentDepth} (<${node['name']}>)`);
	});
	sharedCloseTagSource/*.do(console.log)*/.subscribe(function(tag) {
		//console.log(Array(4 * (currentDepth - 1) + 1).join(' ') + '</' + tag + '>');
		currentDepth -= 1
	});

	// TODO add type to the return of this. Using
	// : Observable<boolean>
	// was causing some conflicts between the types in here and in rx-sax.ts
	function getOpenCloseSource(state, openCandidateSource, closeCandidateSource): Observable<boolean> {
		return Observable.merge(
				openCandidateSource.map(function(node) {
					/*
					console.log(`|>? name: ${node.name} depth: ${depth} enteredDepth: ${state.enteredDepth}`)
					if (!node.name) {
						console.log(node);
					}
					//*/
					return state.matches.call(state, node, currentDepth);
				})
					//.do(x => console.log(`matches: ${x}`))
					.filter(x => x)
					.mapTo(true),
					//.do(x => console.log(`match`)),

				closeCandidateSource.map(function(tag) {
					//console.log(`||? name: ${tag} depth: ${depth} enteredDepth: ${state.enteredDepth}`)
					// depth here is actually more like NEXT depth, because the first value from
					// tagDepthSource is '1', but the last is '0'.
					return state.unmatches.call(state, tag, currentDepth + 1);
				})
					//.do(x => console.log(`unmatches: ${x}`))
					.filter(x => x)
					.mapTo(false),
					//.do(x => console.log(`unmatch`)),

				queue
		)
			//.mergeAll()
			.share()
	}

  return Observable.from(stateStack, queue)
		.reduce(function(acc, state: GenericState) {
			let openCloseSource;
			if (state instanceof StartState) {
				openCloseSource = getOpenCloseSource(state, Observable.of(true), Observable.empty());
			} else if (state instanceof AttributeState) {
				//openCloseSource = getOpenCloseSource(state, tagDepthSource, attributeSource, nonAttributeSource);
			} else {
				openCloseSource = getOpenCloseSource(state, sharedOpenTagSource, sharedCloseTagSource);

				/*
				openCloseSource = Observable.merge(
						sharedOpenTagSource.filter(n => n['name'] === 'DataNode').mapTo(true),
						sharedCloseTagSource.filter(t => t === 'DataNode').mapTo(false),
						queue
				);
				//*/
			}

			return openCloseSource
				//*
				.withLatestFrom(acc, function(matchCurrent, matchParent) {
					//console.log(`currentDepth: ${currentDepth}`);
					return matchCurrent && matchParent;
				})
				//.mergeAll()
				//*/
				/*
				.withLatestFrom(tagDepthSource, function(match, depth) {
					console.log(`depth: ${depth}`);
					return match;
				});
				//*/
		}, Observable.of(true))
			.mergeAll()
		//.timeoutWith(400, Observable.of(false))

//  return Observable.from(stateStack, queue)
//		.reduce(function(acc: Observable<boolean>, state: GenericState): Observable<boolean> {
//			let openCloseSource;
//			if (state instanceof StartState) {
//				openCloseSource = getOpenCloseSource(state, Observable.of(0), Observable.of(true), Observable.empty());
//			} else if (state instanceof AttributeState) {
//				//openCloseSource = getOpenCloseSource(state, tagDepthSource, attributeSource, nonAttributeSource);
//			} else {
//				//const openCloseSource1 = getOpenCloseSource(state, tagDepthSource, sharedOpenTagSource, sharedCloseTagSource);
//				//openCloseSource1.subscribe(x => `typeof x106: ${typeof x}`);
//
//				sharedOpenTagSource.subscribe(function(x) {
//					console.log('tagName: ' + x['name']);
//				}, console.error);
//				tagDepthSource.subscribe(function(x) {
//					console.log('depth: ' + x);
//				}, console.error);
//
//				openCloseSource = Observable.merge(
//						sharedOpenTagSource.filter(n => n['name'] === 'DataNode').mapTo(true),
//						sharedCloseTagSource.filter(t => t === 'DataNode').mapTo(false),
//						queue
//				);
//			}
//
//			return openCloseSource.withLatestFrom(acc, function(matchCurrent, matchParent) {
//				return matchCurrent && matchParent;
//			});
//		}, Observable.of(true));

//  return Observable.from(stateStack, queue)
//		.reduce(function(acc: Observable<boolean>, state: GenericState): Observable<boolean> {
//			console.log('typeof state: ' + typeof state);
//			let openCloseSource;
//			if (state instanceof StartState) {
//				//openCloseSource = getOpenCloseSource(state, Observable.of(0), Observable.of(true), Observable.of(false).repeat().takeUntil(closeTagSource.last()));
//				//openCloseSource = getOpenCloseSource(state, Observable.of(0), Observable.of(true), Observable.of(false).repeat());
//				openCloseSource = getOpenCloseSource(state, Observable.of(0), Observable.of(true), Observable.empty());
//			} else if (state instanceof AttributeState) {
//				//openCloseSource = getOpenCloseSource(state, tagDepthSource, attributeSource, nonAttributeSource);
//			} else {
//				openCloseSource = getOpenCloseSource(state, tagDepthSource, openTagSource, closeTagSource);
//			}
//			//console.log('openCloseSource');
//			//console.log(openCloseSource);
//			const newAcc = openCloseSource.withLatestFrom(acc, function(matchCurrent, matchParent) {
//				/*
//				if (matchCurrent && matchParent) {
//					console.log('------------------------------------------');
//				} else if (matchParent) {
//					console.log('--------------');
//				}
//				//*/
//				return matchParent && matchCurrent;
//			})
//			.distinctUntilChanged();
//
//			//console.log('newAcc');
//			//console.log(newAcc);
//
//			return newAcc;
//		}, Observable.of(true))
//			//*
//			.do(function(o) {
//				o.subscribe(x => console.log('windowActive: ' + x));
//			})
//			//*/
//		/*
//			.mergeMap(function(o) {
//				return o
//					.distinctUntilChanged()
//					.do(x => console.log(`window active? ${x}`))
//					.map(x => Observable.of(x))
//			})
//		//*/
};
