/// <reference path="./XPathParser.d.ts" />

/*
this worked:
./node_modules/pegjs/bin/pegjs src/topublish/xpathParser.pegjs && tsc --allowJs src/topublish/xpath.ts --outDir ./ && node xpath.js 
//*/
var XPathParser = require('./XPathParser');
//import * as XPathParser from './XPathParser';
//import XPathParser = require('./XPathParser');
import {assign, fromPairs, map, zip} from 'lodash';

export type NullOrString = null | string;
export type PredicateRaw = null | [string[], string, string];
export type PredicateParsed = null | {
	left: string;
	op: string;
	right: string;
};
export interface ItemCommon {
	axis: string,
	namespace: NullOrString,
	name: NullOrString,
	attribute: NullOrString
};

export interface ItemParsedPredicateRaw extends ItemCommon {
	predicates: PredicateRaw[];
};

export interface ItemParsed extends ItemCommon {
	predicates: PredicateParsed[],
};

export function parse(xpath: string): ItemParsed[] {
	return map(
		map(
			XPathParser.parse(xpath, {}),
			(part: [string, string, string, PredicateRaw, string]) => fromPairs(
				zip(['axis', 'namespace', 'name', 'predicates', 'attribute'], part)
			) as ItemParsedPredicateRaw
		),
		function(x: ItemParsedPredicateRaw) {
			const predicates = x.predicates;
			let parsedPredicates;
			if (predicates !== null) {
				const strippedPredicates = predicates.slice(1).slice(0, -1);
				parsedPredicates = map(strippedPredicates, function(predicate) {

				 return {
					left: predicate[0][1],
					op: predicate[1],
					right: predicate[2],
				 };
				});
			}

			return {
				axis: x.axis,
				namespace: x.namespace,
				name: x.name,
				predicates: parsedPredicates,
				attribute: x.attribute,
			};
		}
	);
}

//console.log(parse('/Pathway'));
//console.log(parse('/Pathway/DataNode/@*'));
//console.log(parse('/Pathway/DataNode/@Height'));
//console.log(JSON.stringify(parse('/Pathway/DataNode[@Width=35]/@Height'), null, '  '));
