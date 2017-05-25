/**
 * Test public APIs
 */

require("pretty-error").start(); // to make errors more readable
var _ = require("lodash");
var Rx = require("rx-extra");
var expect = require("chai").expect;
var fs = require("fs");
var path = require("path");
var sinon = require("sinon");
var VError = require("verror");
//var sologger = require("../sologger.js");

var pd = require("pretty-data").pd;

process.env.NODE_ENV = "development";

// Run tests
describe("Public API", function() {
  var RxSax;

  before(function() {
    RxSax = require("../../../../../lib/topublish/rx-sax/rx-sax").RxSax;
  });

  it("should create instance", function() {
    var rxSax = new RxSax();
    expect(rxSax).to.be.instanceof(RxSax);
    expect(rxSax).to.respondTo("parse");
  });

  it("should parse w/ top-level attribute selector", function(cb) {
    const selectors = ["/Pathway/@Name"];

    const rxSax = new RxSax(
      Rx.Observable
        .fromNodeReadableStream(
          fs.createReadStream(path.join(__dirname, "/../input/simple.gpml"))
        )
        .do(null, function(err) {
          var err2 = new VError(err, "error reading in chunk");
          console.error(err2.stack);
        })
    );

    rxSax
      .parse(selectors)
      .mergeMap(function(x) {
        return Rx.Observable.merge([x["/Pathway/@Name"]]);
      })
      .mergeAll()
      .toArray()
      .subscribe(
        function(x) {
          expect(x.length).to.equal(1);
          expect(x[0].Name).to.equal("New Pathway");
        },
        err => cb(err),
        cb
      );
  });

  it("should parse w/ lower-level attribute selector", function(cb) {
    const selectors = ["/Pathway/DataNode/@GraphId"];

    const rxSax = new RxSax(
      Rx.Observable
        .fromNodeReadableStream(
          fs.createReadStream(path.join(__dirname, "/../input/simple.gpml"))
        )
        .do(null, function(err) {
          var err2 = new VError(err, "error reading in chunk");
          console.error(err2.stack);
        })
    );

    rxSax
      .parse(selectors)
      .mergeMap(function(x) {
        return Rx.Observable.merge([x["/Pathway/DataNode/@GraphId"]]);
      })
      .mergeAll()
      .toArray()
      .subscribe(
        function(x) {
          expect(x.length).to.equal(2);
          expect(x[0].GraphId).to.equal("ea3e5");
          expect(x[1].GraphId).to.equal("fe3b1");
        },
        err => cb(err),
        cb
      );
  });

  it("should parse w/ top-level attributeSet selector", function(cb) {
    const selectors = ["/Pathway/@*"];

    const rxSax = new RxSax(
      Rx.Observable
        .fromNodeReadableStream(
          fs.createReadStream(path.join(__dirname, "/../input/simple.gpml"))
        )
        .do(null, function(err) {
          var err2 = new VError(err, "error reading in chunk");
          console.error(err2.stack);
        })
    );

    rxSax
      .parse(selectors)
      .mergeMap(function(x) {
        return Rx.Observable.merge([x["/Pathway/@*"]]);
      })
      .mergeAll()
      .toArray()
      .subscribe(
        function(x) {
          expect(x.length).to.equal(1);
          expect(_.values(x[0]).join("")).to.equal(
            "http://pathvisio.org/GPML/2013aNew Pathway20170502"
          );
        },
        err => cb(err),
        cb
      );
  });

  it("should parse w/ lower-level attributeSet selector", function(cb) {
    const selectors = ["/Pathway/DataNode/@*"];

    const rxSax = new RxSax(
      Rx.Observable
        .fromNodeReadableStream(
          fs.createReadStream(path.join(__dirname, "/../input/simple.gpml"))
        )
        .do(null, function(err) {
          var err2 = new VError(err, "error reading in chunk");
          console.error(err2.stack);
        })
    );

    rxSax
      .parse(selectors)
      .mergeMap(function(x) {
        return Rx.Observable.merge([x["/Pathway/DataNode/@*"]]);
      })
      .mergeAll()
      .toArray()
      .subscribe(
        function(x) {
          expect(x.length).to.equal(2);
          expect(_.map(x, y => _.values(y).join("")).join("")).to.equal(
            "GeneProductea3e5GeneProductMetabolitefe3b1Metabolite"
          );
        },
        err => cb(err),
        cb
      );
  });

  it("should parse w/ many selectors", function(cb) {
    const selectors = [
      "/Pathway/@Name",
      "/Pathway/@*",
      "/Pathway/DataNode",
      "/Pathway/DataNode/@*",
      "/Pathway/DataNode/@GraphId",
      "/Pathway/Label",
      "/Pathway/Label/@*"
    ];

    const rxSax = new RxSax(
      Rx.Observable
        .fromNodeReadableStream(
          fs.createReadStream(path.join(__dirname, "/../input/simple.gpml"))
        )
        .do(null, function(err) {
          var err2 = new VError(err, "error reading in chunk");
          console.error(err2.stack);
        })
    );
    return rxSax
      .parse(selectors)
      .mergeMap(function(x) {
        return Rx.Observable.merge([
          x["/Pathway/@Name"],
          x["/Pathway/@*"],
          x["/Pathway/DataNode"],
          x["/Pathway/DataNode/@*"],
          x["/Pathway/DataNode/@GraphId"],
          x["/Pathway/Label"],
          x["/Pathway/Label/@*"]
        ]);
      })
      .mergeAll()
      .toArray()
      .subscribe(
        function(x) {
          /*
          fs.writeFileSync(
            path.join(__dirname, "/parse-multiple.json"),
            JSON.stringify(x, null, "  ")
          );
          //*/
          expect(JSON.stringify(x, null, "  ")).to.equal(
            fs.readFileSync(
              path.join(__dirname, "/parse-multiple.json"),
              "utf8"
            )
          );
        },
        err => cb(err),
        cb
      );
  });

  it("should parse entire XML file", function(cb) {
    const selectors = ["/Pathway"];

    const rxSax = new RxSax(
      Rx.Observable
        .fromNodeReadableStream(
          fs.createReadStream(path.join(__dirname, "/../input/simple.gpml"))
        )
        .do(null, function(err) {
          var err2 = new VError(err, "error reading in chunk");
          console.error(err2.stack);
        })
    );
    return rxSax
      .parse(selectors)
      .mergeMap(function(x) {
        return Rx.Observable.merge([x["/Pathway"]]);
      })
      .mergeAll()
      .toArray()
      .subscribe(
        function(x) {
          /*
          fs.writeFileSync(
            path.join(__dirname, "/parse-all.json"),
            JSON.stringify(x, null, "  ")
          );
          //*/
          expect(JSON.stringify(x, null, "  ")).to.equal(
            fs.readFileSync(path.join(__dirname, "/parse-all.json"), "utf8")
          );
        },
        err => cb(err),
        cb
      );
  });
});
