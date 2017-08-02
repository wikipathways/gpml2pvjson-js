gpml2pvjson
===========

Convert GPML, WikiPathways XML format, to JSON-LD.

Note there are two branches:

1. 1x
  * DOM-based.
  * current converter in use for pvjs at WikiPathways.
2. master (2x)
  * streaming
  * RxJS-based.
  * Used as part of the conversion process from GPML to BioPAX for PathwayCommons.
  * Has an architecture that is more easily updated and less prone to bugs and should replace the DOM-based converter for pvjs.

Before pvjs is switched from the DOM-based to the streaming converter, the streaming converter needs to be fully tested in context of pvjs to ensure it does not break pvjs rendering. The pvjson produced by the two converters needs to be carefully compared (there are several, possibly broken, comparison scripts in `./test/compare/` of the 1x branch). The code for the DOM-based converter needs to be studied so as to ensure any bug fixes or improvements are merged into the streaming converter, especially in regard to interactions/edges and BridgeDb-related interfaces.

# Testing

The only test that sort-of works for the cxml branch is:

```
npm run compile:es5 && node cxml-playground.js
```

The other tests are currently broken.
