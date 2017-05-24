import {State} from './state';


/**
 * State representing a child-axis
 */
export class AttributeSetState extends State {
	id: string;
	abbrevAxis: string;
	axis: string;
	namespace: string;
	name: string;
	predicates: any;
	attribute: string;
	enteredDepth: number;
	//previous: State | AttributeSetState;
	previous: AttributeSetState;
	constructor(axis, namespace, name, predicates, attribute) {
		super(axis, namespace, name, predicates, attribute);
		this.abbrevAxis = "/";
		this.axis = "child";
		this.predicates = this._initPredicates(predicates);
	}

	/**
	 * Match this attribute?
	 */
	matches(attribute, depth) {
		//console.log(`depth: ${depth}`);
		//console.log(Array(4 * (depth - 1) + 1).join(' ') + attribute.name + '="' + attribute.value);
		//console.log(`AttributeSetState:30/depth: ${depth}`)
		//console.log(`AttributeSetState:31/this.enteredDepth: ${this.enteredDepth}`)
		var match = this._matchesDepth(depth) && this._matchesAttribute(attribute);
		if (typeof this.enteredDepth === 'undefined' && match) {
			this.enteredDepth = depth;
		}
		return match;
	};

	/**
	 * Unmatch this attribute?
	 */
	unmatches(attribute, depth) {
		var unmatch = true;
		//console.log(Array(4 * (depth - 1) + 1).join(' ') + '"');
		return unmatch;
	};

	_matchesAttribute(attribute) {
		return this.attribute === '*';
	};

	_matchesDepth(depth) {
		var parentDepth = this.previous.enteredDepth;
		return depth === parentDepth;
	};

	/*
	 * toString
	 */
	toString() {
		return '/' + this.name + this._predicatesToString() + this._attributeToString();
	};
}
