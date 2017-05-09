/// <reference path="../../gpml2pvjson.d.ts" />

import {defaults, keys, map, merge, reduce} from 'lodash';
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/empty';
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/fromEventPattern';
import 'rxjs/add/observable/merge';
import 'rxjs/add/observable/zip';
import 'rxjs/add/operator/concat';
import 'rxjs/add/operator/delayWhen';
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
//export type GenericState = StartState | ChildState | SelfOrDescendantState;

export function create<ATTR_NAMES_AND_TYPES>(
		openTagSource: Observable<ATTR_NAMES_AND_TYPES>,
		attributeSource: Observable<any>,
		textSource: Observable<string>,
		closeTagSource: Observable<string>,
		selector: string
): Observable<boolean> {

	const stateStack = createStateStack(selector);

	const sharedOpenTagSource = openTagSource.share();
	const sharedAttributeSource = attributeSource.share();
	const sharedCloseTagSource = closeTagSource.share();

  let currentDepth = 0;
	sharedOpenTagSource.subscribe(function(node) {
		currentDepth += 1
	});
	sharedCloseTagSource.subscribe(function(tag) {
		currentDepth -= 1
	});

	function getOpenCloseSource(state, openCandidateSource, closeCandidateSource): Observable<boolean> {
		return Observable.merge(
				openCandidateSource.map(function(node) {
					//console.log(`currentDepth: ${currentDepth}`);
					return state.matches.call(state, node, currentDepth);
				})
					.filter(x => x)
					.mapTo(true),

				closeCandidateSource.map(function(tag) {
					// depth here is actually more like NEXT depth, because the first value from
					// tagDepthSource is '1', but the last is '0'.
					return state.unmatches.call(state, tag, currentDepth + 1);
				})
					.filter(x => x)
					.mapTo(false),

				queue
		)
			.share()
	}

  return Observable.from(stateStack, queue)
		.reduce(function(acc, state: GenericState) {
			let openCloseSource;
			if (state instanceof StartState) {
				openCloseSource = getOpenCloseSource(state, Observable.of(true), Observable.empty());
			} else if (state instanceof AttributeState) {
				openCloseSource = getOpenCloseSource(state, sharedAttributeSource.filter((x, i) => i % 2 === 0), sharedAttributeSource.filter((x, i) => i % 2 === 1))
			} else {
				openCloseSource = getOpenCloseSource(state, sharedOpenTagSource, sharedCloseTagSource);
			}

			return openCloseSource
				.withLatestFrom(acc, function(matchCurrent, matchParent) {
					return matchCurrent && matchParent;
				})
		}, Observable.of(true))
			.mergeAll()
};
