import {State} from './state';


/**
 * State representing a self-or-descendant-axis
 */
export class SelfOrDescendantState extends State {
	doFork: boolean;
	abbrevAxis: string;
	axis: string;
	enteredDepth: number;

	constructor(axis, namespace, name, predicates, attribute) {
		super(axis, namespace, name, predicates, attribute);
		this.doFork = true;
		this.abbrevAxis = '//';
		this.axis = 'self-or-descendant';
	}

	/**
	 * Match this node?
	 */
	matches(node, depth) {
		var match = this._matchesName(node) && this._matchesPredicate(node);
		if (match) {
			this.enteredDepth = depth;
		}
		return match;
	};

	/**
	 * Unmatch this node?
	 */
	unmatches(tag, depth) {
		var unmatch = depth <= this.enteredDepth;
		return unmatch;
	};
}
