import {State} from './state';


/**
 * State representing a child-axis
 */
export class AttributeState extends State {
	id: string;
	abbrevAxis: string;
	axis: string;
	namespace: string;
	name: string;
	predicates: any;
	attribute: string;
	enteredDepth: number;
	//previous: State | AttributeState;
	previous: AttributeState;
	constructor(axis, namespace, name, predicates, attribute) {
		super(axis, namespace, name, predicates, attribute);
		this.abbrevAxis = "/";
		this.axis = "child";
		this.predicates = this._initPredicates(predicates);
	}

	/**
	 * Match this node?
	 */
	matches(node, depth) {
		console.log('AttributeState:29/node');
		console.log(node);
		console.log(`AttributeState:31/depth: ${depth}`)
		console.log(`AttributeState:32/this.enteredDepth: ${this.enteredDepth}`)
		var match = this._matchesName(node) &&
			this._matchesAttribute(node);
		if (match) {
			this.enteredDepth = depth;
		}
		/*
		var match = this._matchesDepth(depth) &&
			this._matchesAttribute(node);
		if (match) {
			this.enteredDepth = depth;
		}
		return match;
		//*/
	};

	/**
	 * Unmatch this node?
	 */
	unmatches(tag, depth) {
		var unmatch = depth <= this.enteredDepth;
		return unmatch;
	};


	_matchesDepth(depth) {
		var parentDepth = this.previous.enteredDepth;
		return depth === parentDepth + 1;
	};

	_matchesAttribute(node) {
		var attribute = this.attribute;
		const matchesAttribute = !attribute || attribute === "*" || !!node.attributes[attribute];
		console.log(`matchesAttribute: ${matchesAttribute}`)
		console.log('AttributeState:57/node');
		console.log(node);
		return matchesAttribute;
	};


	/*
	 * toString
	 */
	toString() {
		return '/' + this.name + this._predicatesToString() + this._attributeToString();
	};
}
