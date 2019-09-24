import "source-map-support/register";
// TODO should I get rid of source-map-support/register for production build for browser?

// TODO most or all of this should go into the xpath branch of @wikipathways/cxml.
// Decide on an API and then merge most or all this code into there.
//
// TODO why does TS require that we use the Pathway's "constructor.prototype"
// instead of just the Pathway?
// Why does Pathway.Graphics not need that?
// Why do many of the other require using the prototype?
//
//// TODO why do we get an error with this (/Pathway/@* before /Pathway):
//"/Pathway/@*": GPML2013a.document.Pathway.constructor.prototype,
//"/Pathway": GPML2013a.document.Pathway.constructor.prototype,
//// And with this, we don't get an error, but nothing comes out (/Pathway before /Pathway/@*):
//"/Pathway": GPML2013a.document.Pathway.constructor.prototype,
//"/Pathway/@*": GPML2013a.document.Pathway.constructor.prototype,

import { cloneDeep, curry, keys, partition, toPairs } from "lodash/fp";
import * as hl from "highland";

import * as cxml from "@wikipathways/cxml";

export interface GenericCXMLChildConstructor {
  new (): GenericCXMLChildConstructor;
}

export interface GenericCXMLChild {
  constructor: GenericCXMLChildConstructor;
}

export interface GenericCXMLConstructor {
  new (): GenericCXMLConstructor;
}

export interface GenericCXML {
  constructor: GenericCXMLConstructor;
  GenericCXMLChild: GenericCXMLChild;
  document: {
    _exists: boolean;
    _namespace: string;
  };
}

// TODO don't use this regex when we are already also using a nice
// xpath expression parser in the xpath branch of cxml
const ATTR_SELECTOR_REGEX = /\/@(\*|([:A-Za-z_][:\w\-\.]*))$/;

function getSelectorLevel(selector) {
  return selector.replace(ATTR_SELECTOR_REGEX, "").split("/").length - 1;
}

const nestedElementsToSelector = curry(function(commonLevel, nestedElements) {
  return nestedElements.slice(0, commonLevel).join("/");
});

function getSelectorNestedElements(selector) {
  return selector.replace(ATTR_SELECTOR_REGEX, "").split("/");
}

export class CXMLXPath<T extends GenericCXML, K extends keyof T> {
  // TODO define valid type for parser
  //_parser: cxml.Parser<T>;
  _parser;
  _schema: T;
  _inputStream: NodeJS.ReadableStream;
  constructor(
    inputStream,
    schema,
    xpathNamespaceTbl: Record<string, string> = { "": "" }
  ) {
    this._parser = new cxml.Parser(xpathNamespaceTbl);
    this._schema = schema;
    this._inputStream = inputStream;
  }

  parse<SelectorToCXMLType, Selector extends keyof SelectorToCXMLType>(
    selectorToCXML: SelectorToCXMLType & object
  ) {
    const inputStream = this._inputStream;
    const parser = this._parser;
    const schema = this._schema;

    type StreamMapBySelector = {
      [P in keyof SelectorToCXMLType]: Highland.Stream<SelectorToCXMLType[P]>;
    };

    const result = toPairs(selectorToCXML).reduce(
      function({ output, runningSelectors }, [selector, schemaElement]) {
        const outputStream: Highland.Stream<
          SelectorToCXMLType[Selector]
        > = hl();

        const useBefore = selector.match(ATTR_SELECTOR_REGEX);

        parser.attach(
          class CustomHandler extends schemaElement.constructor {
            _before(this: SelectorToCXMLType[Selector]) {
              if (useBefore) {
                outputStream.write(cloneDeep(this));
              }
            }

            _after(this: SelectorToCXMLType[Selector]) {
              if (!useBefore) {
                outputStream.write(cloneDeep(this));
              }
            }
          },
          selector
        );

        output[selector] = outputStream;
        const level = getSelectorLevel(selector);
        const selectorNestedElements = getSelectorNestedElements(selector);

        const [selectorsToEnd, stillRunningSelectors] = partition(function(
          runningSelector
        ) {
          const runningSelectorNestedElements = getSelectorNestedElements(
            runningSelector
          );
          const commonNestedElementsToSelector = nestedElementsToSelector(
            Math.min(
              selectorNestedElements.length,
              runningSelectorNestedElements.length
            )
          );
          return (
            commonNestedElementsToSelector(runningSelectorNestedElements) !==
            commonNestedElementsToSelector(selectorNestedElements)
          );
        },
        runningSelectors);

        selectorsToEnd.forEach(function(runningSelector) {
          const runningStream = output[runningSelector];
          outputStream
            .observe()
            .head()
            .each(function(x) {
              runningStream.end();
            });
        });
        // NOTE: redefining this variable
        runningSelectors = stillRunningSelectors.concat([selector]);

        return { output, runningSelectors };
      },
      { output: {}, runningSelectors: [] }
    );
    const streamMapBySelector = result.output as StreamMapBySelector;
    const finalRunningSelectors = result.runningSelectors;

    const selectors = keys(selectorToCXML);

    parser.parse(inputStream, schema.document).then(
      function(Pathway) {
        finalRunningSelectors.forEach(function(finalRunningSelector) {
          streamMapBySelector[finalRunningSelector].end();
        });

        selectors.forEach(function(selector) {
          const thisStream = streamMapBySelector[selector];
          if (!thisStream["ended"]) {
            //console.log(streamMapBySelector[selector]);
            //console.log(`Failed to end stream for ${selector}. See above.`);
            //throw new Error(`Failed to end stream for ${selector}. See above.`);
            thisStream.end();
            /*
							 (thisStream._observers.length === 0
								 ? thisStream
								 : thisStream.observe())
								 .debounce(17)
								 .each(function() {
								 thisStream.end();
								 });
						//*/
          }
        });
      },
      function(err) {
        throw err;
      }
    );

    /*
    streamMapBySelector.startCXML = function() {
      return hl(parser.parse(inputStream, schema.document)).map(function(
        Pathway
      ) {
        console.log("Pathway");
        console.log(Pathway);
        finalRunningSelectors.forEach(function(finalRunningSelector) {
          streamMapBySelector[finalRunningSelector].end();
        });

        selectors.forEach(function(selector) {
          const thisStream = streamMapBySelector[selector];
          if (!thisStream["ended"]) {
            //console.log(streamMapBySelector[selector]);
            console.log(`Failed to end stream for ${selector}. See above.`);
            //throw new Error(`Failed to end stream for ${selector}. See above.`);
            //thisStream.end();
          }
        });
      });
    };
		//*/

    return streamMapBySelector;
  }
}
