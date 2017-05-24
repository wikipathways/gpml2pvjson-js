import {State} from './state';


/**
 * Start state for the state-stack
 *
 * Always matches, never unmatches
 */
export class StartState extends State {
	enteredDepth: number;
	abbrevAxis: string;
	axis: string;
	predicates: any;
	constructor() {
		super('0', null, null, null, null);
	}

	/**
	 * Match this node? (always true)
	 */
	matches(node, depth) {
		this.enteredDepth = depth;
		return true;
	};

	/**
	 * Unmatch this node? (always false)
	 */
	unmatches(tag, depth) {
		return this.enteredDepth >= depth;
	};


	/**
	 * toString
	 * overrides State.toString
	 */
	toString() {
		return this.abbrevAxis;
	};
}
