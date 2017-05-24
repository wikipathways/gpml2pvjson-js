import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/empty';
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/merge';
import 'rxjs/add/operator/concat';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mapTo';
import 'rxjs/add/operator/mergeAll';
import 'rxjs/add/operator/reduce';
import 'rxjs/add/operator/share';
import 'rxjs/add/operator/skipUntil';
import 'rxjs/add/operator/withLatestFrom';
import {queue} from 'rxjs/scheduler/queue';
import {parse as parseXPath} from './xpath';
import {StartState} from './StartState';
import {ChildState} from './ChildState';
import {SelfOrDescendantState} from './SelfOrDescendantState';
import {AttributeState} from './AttributeState';
import {AttributeSetState} from './AttributeSetState';
import {create as createStateStack} from './stateStack';

export type GenericState = StartState | ChildState | SelfOrDescendantState | AttributeState | AttributeSetState;

export function create<ATTR_NAMES_AND_TYPES>(
		openTagStartSource: Observable<string>,
		openTagFullSource: Observable<ATTR_NAMES_AND_TYPES>,
		attributeSource: Observable<any>,
		attributeSetSource: Observable<any>,
		textSource: Observable<string>,
		closeTagSource: Observable<string>,
		selector: string
): Observable<boolean> {

	const stateStack = createStateStack(selector);

	const sharedOpenTagFullSource = openTagFullSource.share();
	const sharedAttributeSource = attributeSource
		.share();

	const sharedAttributeSetSource = attributeSetSource
		.share();

	const sharedCloseTagSource = closeTagSource.share();

  let currentDepth = 0;
	sharedOpenTagFullSource.subscribe(function(node) {
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
			} else if (state instanceof AttributeSetState) {
				openCloseSource = getOpenCloseSource(state, sharedAttributeSetSource.filter((x, i) => i % 2 === 0), sharedAttributeSetSource.filter((x, i) => i % 2 === 1))
				//openCloseSource = getOpenCloseSource(state, sharedAttributeSetSource, sharedAttributeSetSource.mapTo(true))
				//openCloseSource = getOpenCloseSource(state, sharedOpenTagFullSource.delayWhen(x => sharedAttributeSetSource), sharedAttributeSetSource.mapTo(true))
				//openCloseSource = getOpenCloseSource(state, sharedAttributeSetSource, sharedAttributeSetSource.mapTo(true))
				/*
				const openCloseSourceNoStop = getOpenCloseSource(state, sharedAttributeSource.filter((x, i) => i % 2 === 0), sharedAttributeSource.filter((x, i) => i % 2 === 1))
				const openSource = openCloseSourceNoStop.filter(x => x);
				openCloseSource = openCloseSourceNoStop.takeUntil(sharedOpenTagFullSource.skipUntil(openSource));
				//*/
			} else {
				openCloseSource = getOpenCloseSource(state, sharedOpenTagFullSource, sharedCloseTagSource);
			}

			return openCloseSource
				.withLatestFrom(acc, function(matchCurrent, matchParent) {
					return matchCurrent && matchParent;
				})
		}, Observable.of(true))
			.mergeAll()
};