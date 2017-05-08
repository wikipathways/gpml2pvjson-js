import {State} from './state';


/**
 * State representing a child-axis
 */
export class ChildState extends State {
	id: string;
	abbrevAxis: string;
	axis: string;
	namespace: string;
	name: string;
	enteredDepth: number;
	//previous: State | ChildState;
	previous: ChildState;
	constructor(axis, namespace, name, predicates, attribute) {
		super(axis, namespace, name, predicates, attribute);
		this.abbrevAxis = "/";
		this.axis = "child";
	}

	/**
	 * Match this node?
	 */
	matches(node, depth) {
		var match = this._matchesName(node) &&
			this._matchesDepth(depth) &&
			this._matchesPredicate(node);

		//console.log(Array(4 * (depth - 1) + 1).join(' ') + '<' + node.name + '>');
		if (match) {
			this.enteredDepth = depth;
		}
		return match;
	};

	/**
	 * Unmatch this node?
	 */
	unmatches(tag, depth) {
		//console.log(Array(4 * (depth - 1) + 1).join(' ') + '</' + tag + '>');
		return !!this.attribute || depth <= this.enteredDepth;
	};


	_matchesDepth(depth) {
		var parentDepth = this.previous.enteredDepth;
		return depth === parentDepth + 1;
	};


	/*
	 * toString
	 */
	toString() {
		return '/' + this.name + this._predicatesToString();
	};
}
