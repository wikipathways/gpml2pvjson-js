export class State {
	id: string;
	abbrevAxis: string;
	axis: string;
	namespace: string;
	name: string;
	predicates: any;
	attribute: string;
	previous?: State;
	next?: State;
	constructor(axis, namespace, name, predicates, attribute) {
		this.id = this._generateId();
		this.namespace = namespace;
		this.name = name;
		this.predicates = this._initPredicates(predicates);
		this.attribute = attribute;
	};

	_generateId() {
		return new Date().getTime() + '-' + Math.round(Math.random() * 65535);
	};


	_initPredicates(predicates) {
		if (predicates) {
			// strip '[' and ']'
			return predicates.slice(1).slice(0, -1);
		}

		return [];
	};


	_matchesName(node) {
		// should we match a namespace?
		if (this.namespace) {
			var nodeNamespace = node.name.indexOf(':') !== -1 && node.name.split(':')[0] || '';
			var nodeName = node.name.indexOf(':') !== -1 && node.name.split(':')[1] || node.name;

			if (this.namespace !== nodeNamespace) {
				return false;
			}

			return this.name === '*' || this.name === nodeName;
		}

		// no namespace
		return this.name === '*' || this.name === node.name;
	};

	_matchesPredicate(node) {
		// XXX: hardcoded to test @attr = literal
		var i;
		for (i = 0; i < this.predicates.length; ++i) {
			var predicate = this.predicates[i];

			var left = predicate[0];
			var op = predicate[1];
			var right = predicate[2];

			var lValue = node.attributes[left[1]];
			var rValue = right;
			if (op === '=') {
				if (lValue !== rValue) {
					return false;
				}
			}
		}

		return true;
	};


	_predicatesToString() {
		var pred = '';
		if (this.predicates.length > 0) {
			pred += '[';

			var i;
			for (i = 0; i < this.predicates.length; ++i) {
				var predicate = this.predicates[i];

				var left = predicate[0];
				var op = predicate[1];
				var right = predicate[2];

				pred += left[0] + left[1] + op + '"' + right + '"';
			}

			pred += ']';
		}

		return pred;
	};

	_attributeToString() {
		var attribute = this.attribute;
		return !!attribute ? "/@" + attribute : "";
	};

	/*
	 * toString
	 */
	toString(): string {
		var namespace = this.namespace && this.namespace + ':' || '';
		return this.abbrevAxis + namespace + this.name + this._predicatesToString() + this._attributeToString();
	};
}
