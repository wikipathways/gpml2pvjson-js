/// <reference path="../json.d.ts" />

import {assignInWith, isArray} from 'lodash';
import {defaultsDeepAll} from 'lodash/fp';
import * as cxml from "cxml";
//import * as cxsd from "../../node_modules/cxsd/dist/schema/exporter/Exporter.d.ts";
//import {HandlerInstance} from "../../node_modules/cxml/dist/xml/P";
import * as GPML2013a from "../../xmlns/pathvisio.org/GPML/2013a";
import {parse as parseXPath} from './rx-sax/xpath';
import {Subject} from 'rxjs/Subject';
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/from';
import 'rxjs/add/operator/mergeMap';

function customizer(objValue, srcValue) {
	if (typeof objValue !== 'object') {
		return objValue;
	} else {
		if (isArray(objValue)) {
			return objValue
				.filter(x => typeof x !== 'object' || !x.hasOwnProperty('_exists'))
				.map(function(x) {
					return assignInWith(x, srcValue, customizer);
				});
		} else if (objValue.hasOwnProperty('_exists') && objValue['_exists'] === false) {
			return srcValue;
		} else {
			return assignInWith(objValue, srcValue, customizer);
		}
	}
}

export class CXMLRx {
	_parser: cxml.Parser;
	/*
	_schema: {
		document: {
			_exists: boolean;
			_namespace: string;
		}
	};
	//*/
	_schema: typeof GPML2013a;
	_input: any;
	constructor(input, schema) {
		this._parser = new cxml.Parser();
		this._schema = schema;
		this._input = input;
	}

	parse(selectors) {
		const {_input, _parser, _schema} = this;
		const outputSource = selectors
			.reduce(function(acc, selector) {
				console.log('ln55');
				const subject = new Subject();
				const parsedXPathItems = parseXPath(selector);
				parsedXPathItems.shift();
				const Extendible = parsedXPathItems
					.map(x => x.name)
					.reduce(function(subAcc: typeof GPML2013a.document.DataNode, name) {
						return subAcc[name];
					}, _schema.document) as typeof GPML2013a.document.DataNode;

				const attribute = parsedXPathItems[parsedXPathItems.length - 1].attribute;
				_parser.attach(class CustomHandler extends Extendible.constructor {
					constructor() {
						super();
						console.log('ln66');
					}

					_before() {
						console.log('before');
						if (attribute) {
							subject.next(this);
						}
					}

					_after() {
						console.log('after');
						//assignInWith(this, DataNodeDefaults, customizer)
						if (!attribute) {
							subject.next(this);
						}
					}
				});

				acc[selector] = subject;
					//.observeOn(queue)
					//.takeUntil(result);

				return acc;
			}, {
				init: function() {
					console.log('ln97');
					var result = _parser.parse(
						_input,
						_schema.document
					);
					//*
					result.then(function(data) {
						 console.log('data');
						 console.log(data);
						 //subject.complete();
					});
					//*/
				}
			});

		//result.then(console.log);
		return outputSource;
	}
}
