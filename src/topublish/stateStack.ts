/// <reference path="../../gpml2pvjson.d.ts" />

import {map, reduce} from 'lodash';
import {parse as parseXPath} from './xpath';
import {State} from './State';
import {StartState} from './StartState';
import {ChildState} from './ChildState';
import {SelfOrDescendantState} from './SelfOrDescendantState';
import {AttributeState} from './AttributeState';

export type GenericState = StartState | ChildState | SelfOrDescendantState | AttributeState;

export function create(
		selector: string
): GenericState[] {
	/*
	const stateStack = reduce(parseXPath(selector), function(stack: GenericState[], {axis, namespace, name, predicates, attribute}) {
		const previousState = stack[stack.length - 1];
		let state;

		if (!!attribute) {
			state = new AttributeState(axis, namespace, name, predicates, attribute);
		} else if (axis === '/') {
			state = new ChildState(axis, namespace, name, predicates, attribute);
		} else if (axis === '//') {
			state = new SelfOrDescendantState(axis, namespace, name, predicates, attribute);
		}

		// build links to previous/next state
		state.previous = previousState;
		previousState.next = state;

		stack.push(state);

		return stack;
	}, [new StartState()]);
	console.log('stateStacks');
	console.log(stateStacks);
	//*/

  //*
	const stateStack = parseXPath(selector)
		.reduce(function(stack: GenericState[], {axis, namespace, name, predicates, attribute}) {
			const previousState = stack[stack.length - 1];
			let state;
			//*
			if (!!attribute) {
				state = new AttributeState(axis, namespace, name, predicates, attribute);
			} else if (axis === '/') {
				state = new ChildState(axis, namespace, name, predicates, attribute);
			} else if (axis === '//') {
				state = new SelfOrDescendantState(axis, namespace, name, predicates, attribute);
			}

			// build links to previous/next state
			state.previous = previousState;
			previousState.next = state;

			stack.push(state);

			return stack;
		}, [new StartState()]);
	//*/

	return stateStack;
};
