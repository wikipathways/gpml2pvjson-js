/// <reference path="../json.d.ts" />
import "source-map-support/register";
import { assignInWith, isArray, toPairs } from "lodash";
import { defaultsDeepAll } from "lodash/fp";
import * as cxml from "@wikipathways/cxml";
//import * as cxsd from "../../node_modules/cxsd/dist/schema/exporter/Exporter.d.ts";
//import {HandlerInstance} from "../../node_modules/cxml/dist/xml/P";
import * as GPML2013a from "../../xmlns/pathvisio.org/GPML/2013a";
//import { parse as parseXPath } from "./rx-sax/xpath";
import { parse as parseXPath } from "../../../cxml/lib/topublish/xpath";
//import { parse as parseXPath } from "@wikipathways/cxml/lib/topublish/xpath";
//import { Subject } from "rxjs/Subject";
//import { Observable, Subject } from "../../../rx-extra/main";
import { Observable, Subject } from "rx-extra/main";
import "rxjs/add/observable/from";
import "rxjs/add/operator/mergeMap";

function customizer(objValue, srcValue) {
  if (typeof objValue !== "object") {
    return objValue;
  } else {
    if (isArray(objValue)) {
      return objValue
        .filter(x => typeof x !== "object" || !x.hasOwnProperty("_exists"))
        .map(function(x) {
          return assignInWith(x, srcValue, customizer);
        });
    } else if (
      objValue.hasOwnProperty("_exists") &&
      objValue["_exists"] === false
    ) {
      return srcValue;
    } else {
      return assignInWith(objValue, srcValue, customizer);
    }
  }
}

export class CXMLRx<T> {
  //_parser: typeof cxml.Parser;
  _parser;
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

  parse(selectors: string[]): Map<string, Observable<any>> {
    const { _input, _parser, _schema } = this;

    //_parser.parse(_input, _schema.document, null, _schema.document.Pathway.Label[0])
    /*
		parse<Output extends HandlerInstance>(
			stream: string | stream.Readable | NodeJS.ReadableStream,
			output: Output,
			context?: Context
		)
		//*/
    var result = _parser.parse(_input, _schema.document);

    console.log("aretheyequal?");
    console.log(
      GPML2013a.document.Pathway.Comment[0] ===
        GPML2013a.document.Pathway.Label[0].Comment[0]
    );

    return toPairs(
      selectors.reduce(function(acc, selector) {
        // TODO we are ignoring predicates at present.
        // TODO TODO TODO this doesn't match what we have for the xpath-aware branch of @wikipathways/cxml
        const parsedXPathItems = parseXPath(selector);
        const attribute =
          parsedXPathItems[parsedXPathItems.length - 1].attribute;
        const names = parsedXPathItems.map(x => x.name).filter(x => x !== null);
        acc[names.join()] = acc[names.join()] || [];
        acc[names.join()].push({
          selector: selector,
          parsedXPathItems: parsedXPathItems,
          attribute: attribute,
          names: names
        });
        return acc;
      }, {})
    ).reduce(function(acc, [joinedNames, values]) {
      const names = joinedNames.split(",");
      //const Extendible = GPML2013a.document.Pathway.Comment[0];
      /*
				const nameCount = names.length;
				// TODO why do we need to remove it for '/Pathway/DataNode' but not for just '/Pathway'?
				// We apparently sometimes need to skip the first tagName, because it is equivalent to the document.
				const Extendible = names.slice(nameCount > 1 ? 1 : 0, nameCount)
					.reduce(function(subAcc: typeof GPML2013a.document.DataNode, name) {
						return subAcc[name];
					}, _schema.document);
				//*/
      //*
      const Extendible = names.reduce(function(
        //subAcc: typeof GPML2013a.document.Pathway.DataNode[0],
        subAcc,
        name
      ) {
        const child = subAcc[name];
        return isArray(child) ? child[0] : child;
      }, _schema.document) as typeof GPML2013a.document.Pathway.DataNode[0];
      //*/

      const protos = values.map(function({
        selector,
        parsedXPathItems,
        attribute,
        names
      }) {
        const subject = new Subject();
        acc[selector] = subject;

        // TODO is this needed? Is it correct?
        result.then(function(data) {
          subject.complete();
        });

        return {
          _before: function _before() {
            if (attribute === "*") {
              subject.next(this);
            } else if (attribute) {
              subject.next({
                [attribute]: this[attribute]
              });
            }
          },
          _after: function _after() {
            //assignInWith(this, DataNodeDefaults, customizer)
            if (!attribute) {
              subject.next(this);
            }
          }
        };
      });

      _parser.attach(
        class CustomHandler extends Extendible.constructor {
          _depthTrace: string;
          _exists: boolean;
          _namespace: string;
          constructor() {
            super();
            this._depthTrace = joinedNames;
          }

          _before() {
            protos.forEach(
              function(x) {
                x._before.call(this);
              }.bind(this)
            );
          }

          _after() {
            protos.forEach(
              function(x) {
                x._after.call(this);
              }.bind(this)
            );
          }
        }
      );

      return acc;
    }, {}) as Map<string, Observable<any>>;
  }
}
