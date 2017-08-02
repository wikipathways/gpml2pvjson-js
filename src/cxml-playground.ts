/// <reference path="./json.d.ts" />
import "source-map-support/register";
import { assignInWith, isArray, values } from "lodash";
import { defaultsDeepAll } from "lodash/fp";
import * as cxml from "@wikipathways/cxml";
import * as GPML2013a from "../xmlns/pathvisio.org/GPML/2013a";
import * as GPMLDefaults from "./GPMLDefaults.json";
import * as BIOPAX_TO_PVJSON from "./biopax-to-pvjson.json";
var fs = require("fs");
var path = require("path");

import { Observable } from "rxjs/Observable";
import "rxjs/add/observable/from";
import "rxjs/add/operator/mergeMap";

import { CXMLRx } from "./topublish/cxml-rx";
var cXMLRx = new CXMLRx(
  fs.createReadStream(path.resolve(__dirname, "../simple.gpml")),
  //fs.createReadStream(path.resolve(__dirname, "../test/input/WP554_77712.gpml")),
  //fs.createReadStream(path.resolve(__dirname, "../test/input/WP1_73346.gpml")),
  GPML2013a
);
const parsed = cXMLRx.parse([
  "/Pathway/Label/Comment"
  /*
	'/Pathway/Graphics',
	'/Pathway/Interaction/Graphics',
	'/Pathway/Comment',
	'/Pathway/Interaction/Graphics',
	'/Pathway/Interaction/Graphics/Point',
	'/Pathway/Label',
	'/Pathway/DataNode',
	'/Pathway/@Name',
	'/Pathway',
	'/Pathway/@*',
	'/Pathway/Label/Graphics',
	'/Pathway/Label/Graphics',
	//*/
]);

Observable.from(values(parsed) as Observable<any>[])
  .mergeMap(function(obs) {
    return obs;
  })
  .subscribe(
    function(x) {
      console.log("All23");
      console.log(JSON.stringify(x, null, "  "));
    },
    function(err) {
      throw err;
    },
    function() {
      console.log("complete All");
    }
  );

/*
parsed['/Pathway/DataNode']
	.subscribe(function(x) {
		console.log('DataNode23');
		console.log(x);
	}, function(err) {
		throw err;
	}, (x) => console.log('complete DataNode'));

parsed['/Pathway/Label']
	.subscribe(function(x) {
		console.log('Label33');
		console.log(x);
	}, function(err) {
		throw err;
	}, (x) => console.log('complete Label'));
//*/

//var parser = new cxml.Parser();
//
//function customizer(objValue, srcValue) {
//	if (typeof objValue !== 'object') {
//		return objValue;
//	} else {
//		if (isArray(objValue)) {
//			return objValue
//				.filter(x => typeof x !== 'object' || !x.hasOwnProperty('_exists'))
//				.map(function(x) {
//					return assignInWith(x, srcValue, customizer);
//				});
//		} else if (objValue.hasOwnProperty('_exists') && objValue['_exists'] === false) {
//			return srcValue;
//		} else {
//			return assignInWith(objValue, srcValue, customizer);
//		}
//	}
//}
//
//const FontAttributesDefaults = GPMLDefaults['FontAttributes'];
//const ShapeStyleAttributesDefaults = GPMLDefaults['ShapeStyleAttributes'];
//const DataNodeDefaults = defaultsDeepAll([
//	GPMLDefaults['DataNode'],
//	{
//		Graphics: defaultsDeepAll([FontAttributesDefaults, ShapeStyleAttributesDefaults])
//	}
//]);
//const StateDefaults = defaultsDeepAll([
//	GPMLDefaults['State'],
//	{
//		Graphics: defaultsDeepAll([ShapeStyleAttributesDefaults])
//	}
//]);
//const GraphicalLineDefaults = defaultsDeepAll([
//	GPMLDefaults['GraphicalLine'],
//	{
//		Graphics: defaultsDeepAll([ShapeStyleAttributesDefaults])
//	}
//]);
//const InteractionDefaults = defaultsDeepAll([
//	GPMLDefaults['Interaction'],
//	{
//		Graphics: defaultsDeepAll([ShapeStyleAttributesDefaults])
//	}
//]);
//const LabelDefaults = defaultsDeepAll([
//	GPMLDefaults['Label'],
//	{
//		Graphics: defaultsDeepAll([FontAttributesDefaults, ShapeStyleAttributesDefaults])
//	}
//]);
//const ShapeDefaults = defaultsDeepAll([
//	GPMLDefaults['Shape'],
//	{
//		Graphics: defaultsDeepAll([FontAttributesDefaults, ShapeStyleAttributesDefaults])
//	}
//]);
//const GroupDefaults = GPMLDefaults['Group'];
//
//parser.attach(
//  class DataNodeHandler extends GPML2013a.document.DataNode.constructor {
//		constructor() {
//			super();
//		}
//
//    _before() {
//    }
//
//    _after() {
//			assignInWith(this, DataNodeDefaults, customizer)
//    }
//	}
//);
//
//parser.attach(
//  class StateHandler extends GPML2013a.document.State.constructor {
//		constructor() {
//			super();
//		}
//
//    _before() {
//    }
//
//    _after() {
//			assignInWith(this, StateDefaults, customizer)
//    }
//	}
//);
//
//parser.attach(
//  class GraphicalLineHandler extends GPML2013a.document.GraphicalLine.constructor {
//		constructor() {
//			super();
//		}
//
//    _before() {
//    }
//
//    _after() {
//			assignInWith(this, GraphicalLineDefaults, customizer)
//    }
//	}
//);
//
//parser.attach(
//  class InteractionHandler extends GPML2013a.document.Interaction.constructor {
//		constructor() {
//			super();
//		}
//
//    _before() {
//    }
//
//    _after() {
//			assignInWith(this, InteractionDefaults, customizer)
//    }
//	}
//);
//
//parser.attach(
//  class LabelHandler extends GPML2013a.document.Label.constructor {
//		constructor() {
//			super();
//		}
//
//    _before() {
//    }
//
//    _after() {
//			assignInWith(this, LabelDefaults, customizer)
//    }
//	}
//);
//
//parser.attach(
//  class ShapeHandler extends GPML2013a.document.Shape.constructor {
//		constructor() {
//			super();
//		}
//
//    _before() {
//    }
//
//    _after() {
//			assignInWith(this, ShapeDefaults, customizer)
//    }
//	}
//);
//
//parser.attach(
//  class GroupHandler extends GPML2013a.document.Group.constructor {
//		constructor() {
//			super();
//		}
//
//    _before() {
//    }
//
//    _after() {
//			assignInWith(this, GroupDefaults, customizer)
//    }
//	}
//);
//
////var result = parser.parse(
////  //fs.createReadStream(path.resolve(__dirname, "../simple.gpml")),
////  fs.createReadStream(path.resolve(__dirname, "../test/input/WP554_77712.gpml")),
////  //fs.createReadStream(path.resolve(__dirname, "../test/input/WP1_73346.gpml")),
////  GPML2013a.document
////);
////
////result.then(doc => {
////  //console.log("\n=== Final Result ===\n");
////  //console.log(JSON.stringify(doc, null, 2));
////});
//
///*
//var CircularJSON = require('circular-json');
//var dataNodeGraphicsType = GPML2013a.document.DataNode.Graphics.constructor['type'];
//console.log('dataNodeGraphicsType');
//console.log(CircularJSON.stringify(dataNodeGraphicsType, null, '  '));
//
//var dataNodeType = GPML2013a.document.DataNode.constructor['type'];
//console.log('dataNodeType');
//console.log(CircularJSON.stringify(dataNodeType, null, '  '));
////*/
//
////parser.attach(
////  class PathwayHandler extends GPML2013a.document.Pathway.constructor {
////    _before() {
////      console.log("\nBefore " + this.Name + ": " + JSON.stringify(this));
////    }
////
////    _after() {
////      console.log("After  " + this.Name + ": " + JSON.stringify(this));
////    }
////  }
////);
////
////parser.attach(
////  class InfoBoxHandler extends GPML2013a.document.InfoBox.constructor {
////    _before() {
////      console.log("\nBefore " + this.CenterX + ": " + JSON.stringify(this));
////    }
////
////    _after() {
////      console.log("After  " + this.CenterX + ": " + JSON.stringify(this));
////    }
////  }
////);
////
////parser.attach(
////  class DataNodeHandler extends GPML2013a.document.DataNode.constructor {
////    /** Fires when the opening <DataNode> and attributes have been parsed. */
////
////    _before() {
////      console.log("\nBefore " + this.TextLabel + ": " + JSON.stringify(this));
////    }
////
////    /** Fires when the closing </DataNode> and children have been parsed. */
////
////    _after() {
////      console.log("After  " + this.TextLabel + ": " + JSON.stringify(this));
////    }
////  }
////);
//
//
///*
//var xsd = require('xsd');
//var json2 = xsd.fileToFlatJSON('./GPML2013a.xsd', function(errors, obj) {
//	console.log('obj');
//	console.log(JSON.stringify(obj, null, '  '));
//});
//
//
//var convert = require('xml-js');
//var GPML2013aSchema = fs.readFileSync(path.resolve(__dirname, "GPML2013a.xsd"));
//var result1 = convert.xml2json(GPML2013aSchema, {compact: true, spaces: 4});
//console.log('result1');
//console.log(result1);
////*/
//
////var sampleGPML = fs
////  .readFileSync(__dirname + "/simple.gpml", "utf8")
////  .replace('<?xml version="1.0" encoding="UTF-8"?>', "");
////console.log("sampleGPML");
////console.log(sampleGPML);
////var result = parser.parse(sampleGPML, GPML2013a.document);
//
////var parser = new cxml.Parser();
////
////parser.attach(class DirHandler extends (GPML2013a.document.dir.constructor) {
////
////	/** Fires when the opening <dir> and attributes have been parsed. */
////
////	_before() {
////		console.log('\nBefore ' + this.name + ': ' + JSON.stringify(this));
////	}
////
////	/** Fires when the closing </dir> and children have been parsed. */
////
////	_after() {
////		console.log('After  ' + this.name + ': ' + JSON.stringify(this));
////	}
////
////});
////
////var result = parser.parse('<dir name="empty"></dir>', GPML2013a.document);
////
////result.then((doc: GPML2013a.document) => {
////
////	console.log('\n=== empty ===\n');
////
////	console.log( JSON.stringify(doc) );  // {"dir":{"name":"empty"}}
////	var dir = doc.dir;
////
////	console.log( dir instanceof GPML2013a.document.dir.constructor );   // true
////	console.log( dir instanceof GPML2013a.document.file.constructor );  // false
////
////	console.log( dir instanceof GPML2013a.DirType );   // true
////	console.log( dir instanceof GPML2013a.FileType );  // false
////
////	console.log( dir._exists );          // true
////	console.log( dir.file[0]._exists );  // false (not an error!)
////
////});
////
////result = parser.parse(
////  fs.createReadStream(path.resolve(__dirname, 'xml/dir-example.xml')), example.document);
////
////result.then((doc: example.document) => {
////
////	console.log('\n=== 123 ===\n');
////
////	console.log(JSON.stringify(doc, null, 2));
////
////});
