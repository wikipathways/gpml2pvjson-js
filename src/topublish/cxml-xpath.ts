import "source-map-support/register";
// TODO should I get rid of source-map-support/register for production build for browser?

// TODO most or all of this should go into the xpath branch of @wikipathways/cxml.
// Decide on an API and then merge most or all this code into there.

import { cloneDeep, toPairs } from "lodash/fp";
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
    selectorToCXML: SelectorToCXMLType
  ) {
    const inputStream = this._inputStream;
    const parser = this._parser;
    const schema = this._schema;

    let outputStreams: Highland.Stream<SelectorToCXMLType[Selector]>[] = [];

    type ResultType = {
      [P in keyof SelectorToCXMLType]: Highland.Stream<SelectorToCXMLType[P]>
    };

    const result = toPairs(selectorToCXML).reduce(function(
      acc,
      [selector, schemaElement]
    ) {
      const outputStream: Highland.Stream<SelectorToCXMLType[Selector]> = hl();

      // TODO don't use this regex when we are already also using a nice
      // xpath expression parser in the xpath branch of cxml
      const useBefore = selector.match(/\/@(\*|([:A-Za-z_][:\w\-\.]*))$/);

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

      acc[selector] = outputStream;

      // NOTE: side effect
      outputStreams.push(outputStream);

      return acc;
    }, {}) as ResultType;

    parser.parse(inputStream, schema.document).then(function() {
      outputStreams.forEach(function(outputStream) {
        outputStream.end();
      });
    });

    return result;
  }
}
