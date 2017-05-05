import {defaults} from 'lodash';

export class XmlRecorder {
	path: string[];
	streams: any;
	constructor() {
		this.streams = {};
		this.path = [];
	}

	start(state) {
		this.streams[state.id] = {};
	}

	stop(state) {
		var stream = this.streams[state.id];

		delete this.streams[state.id];

		return stream;
	}

	onOpenTag(node) {
		console.log('onOpenTag');
		for (const id in this.streams) {
			if (this.streams.hasOwnProperty(id)) {
				const openTagName = node['name'];
				const formattedNode = {
					tagName: openTagName,
					attributes: node.attributes,
					textContent: '',
					children: [],
				};
				let path = this.path;
				path.push(openTagName);
				let acc = this.streams[id];
				if (path.length === 1) {
					acc = defaults(acc, formattedNode);
				} else if (path.length > 1) {
					const parentIndex = path.length - 2;
					let parentEl = path.slice(0, parentIndex).reduce(function(subAcc, pathX) {
						const children = subAcc.children;
						return children[children.length - 1];
					}, acc);
					let parentChildren = parentEl.children;
					parentChildren.push(formattedNode);
				}
			}
		}
	}

	onCloseTag(tag) {
		console.log('onCloseTag');
		let path = this.path;
		for (const id in this.streams) {
			if (this.streams.hasOwnProperty(id)) {
				path.pop();
			}
		}
	}

	onText(text) {
		console.log('onText');
		let path = this.path;
		for (const id in this.streams) {
			if (this.streams.hasOwnProperty(id)) {
				let acc = this.streams[id];
				if (path.length === 1) {
					acc.textContent += text;
				} else if (path.length > 1) {
					const parentIndex = path.length - 2;
					let parentEl = path.slice(0, parentIndex).reduce(function(subAcc, pathX) {
						const children = subAcc.children;
						return children[children.length - 1];
					}, acc);
					let parentChildren = parentEl.children;
					const el = parentChildren[parentChildren.length - 1];
					el.textContent += text;
				}
			}
		}
	}

	//*
	onOpenCDATA() {
		//this.onText("<![CDATA[");
	}

	onCDATA(cdata) {
		this.onText(cdata);
	}

	onCloseCDATA() {
		//this.onText("]]>");
	}
	//*/
}
