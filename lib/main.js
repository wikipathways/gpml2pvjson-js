//#!/usr/bin/env node

var converters = {};
var _ = require('lodash');
var Async = require('async');
var Biopax = require('biopax2json');
var BridgeDb = require('bridgedb');
//var Anchor = require('./anchor.js');
//var BiopaxRef = require('./biopax-ref.js');
//var Comment = require('./comment.js');
var DataNode = converters.DataNode = require('./data-node.js');
//var Element = require('./element.js');
var fs = require('fs');
var GpmlUtilities = require('./gpml-utilities.js');
var GraphicalLine = converters.GraphicalLine = require('./graphical-line.js');
//var Graphics = require('./graphics.js');
var Group = converters.Group = require('./group.js');
var Interaction = converters.Interaction = require('./interaction.js');
var Label = converters.Label = require('./label.js');
//var Point = require('./point.js');
var Rx = require('rx');
var Shape = converters.Shape = require('./shape.js');
var State = converters.State = require('./state.js');
//var Text = require('./text.js');

var isBrowser = false;

// detect environment: browser vs. Node.js
// I would prefer to use the code from underscore.js or lodash.js,
// but it doesn't appear to work for me,
// possibly because I'm using browserify.js and want to detect browser vs. Node.js, whereas
// the other libraries are just trying to detect whether we're in CommonJS or not.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  isBrowser = true;
}

var Gpml2Json = function() {
  var instance = this;
  this.toPvjson = function(gpmlPathwaySelection, pathwayMetadata, outerCallback) {
    var xmlns = gpmlPathwaySelection.attr('xmlns');
    gpmlPathwaySelection = instance.fixBiopax(
        instance.addIsPartOfAttribute(
          instance.makeExplicit(gpmlPathwaySelection)));
    var pvjson = {};

    var pathwayIri;
    if (!!pathwayMetadata['@id']) {
      pathwayIri = pathwayMetadata['@id'];
    } else if (!!pathwayMetadata.identifier && pathwayMetadata.identifier.match(/WP\d+/)) {
      pathwayIri = 'http://identifiers.org/wikipathways/' + pathwayMetadata.identifier;
    } else if (typeof document !== 'undefined') {
      pathwayIri = document.baseURI;
    } else {
      pathwayIri = 'http://example.org/unknown';
    }

    var globalContext = [];
    // TODO update this to remove test2.
    //globalContext.push('http://test2.wikipathways.org/v2/contexts/pathway.jsonld');
    globalContext.push('https://wikipathwayscontexts.firebaseio.com/biopax/.json');
    globalContext.push('https://wikipathwayscontexts.firebaseio.com/organism/.json');
    globalContext.push('https://wikipathwayscontexts.firebaseio.com/cellularLocation/.json');
    globalContext.push('https://wikipathwayscontexts.firebaseio.com/display/.json');
    globalContext.push('https://wikipathwayscontexts.firebaseio.com/bridgedb/.json');
    //globalContext.push('http://test2.wikipathways.org/v2/contexts/interaction-type.jsonld');
    pvjson['@context'] = globalContext;
    /*
    var localContext = {};
    localContext = {};
    // Disabling the @base, because it will make any identifiers.org IRIs relative to it, e.g.,
    // a @base of http://identifiers.org/wikipathways/WP4 will result in
    // http://identifiers.org/cas/1234 displaying as ../../cas/1234 when compacted
    //localContext['@base'] = pathwayIri + '/';
    pvjson['@context'].push(localContext);
    pvjson.type = 'biopax:Pathway';
    //*/
    // using full IRI, because otherwise I would have to
    // indicate the id as something like "/", which is ugly.
    pvjson.id = pathwayIri;

    if (!!pathwayMetadata.identifier) {
      pvjson.identifier = pathwayMetadata.identifier;
    } else if (!!pathwayMetadata['@id']) {
      var identifierMatch =
          pathwayMetadata['@id'].match(/http:\/\/identifiers.org\/wikipathways\/(WP\d+)/);
      pathwayMetadata.identifier = identifierMatch ? identifierMatch[1] : null;
    }

    pvjson.version = pathwayMetadata.version;

    /* Dev only
    var pd = require('pretty-data').pd;
    var rawGpmlAsString = gpmlPathwaySelection.html();
    var rawGpmlAsPrettyString = pd.xml(rawGpmlAsString);
    //console.log('rawGpmlAsPrettyString');
    //console.log(rawGpmlAsPrettyString);
    var updatedGpmlAsString = gpmlPathwaySelection.html();
    var processedGpmlAsPrettyString = pd.xml(updatedGpmlAsString);
    console.log('*********************************************************************');
    console.log('*********************************************************************');
    console.log('processedGpmlAsPrettyString');
    console.log('*********************************************************************');
    console.log('*********************************************************************');
    console.log(processedGpmlAsPrettyString);
    //*/

    // test for whether file is GPML
    if (GpmlUtilities.supportedNamespaces.indexOf(xmlns) === -1) {
      return outerCallback('Pvjs does not support the data format provided. ' +
                      'Please convert to GPML and retry.', {});
    }

    // test for whether the GPML file version matches the latest version
    // (only the latest version will be supported by pvjs).
    if (GpmlUtilities.supportedNamespaces.indexOf(xmlns) !== 0) {
      // TODO call the Java RPC updater or in some other way call for the file to be updated.
      return outerCallback('Pvjs may not fully support the version of GPML provided (xmlns: ' +
            xmlns + '). Please convert to the supported version of GPML (xmlns: ' +
              GpmlUtilities.supportedNamespaces[0] + ').', {});
    }

    var dataSource = gpmlPathwaySelection.attr('Data-Source');
    if (!!dataSource) {
      pvjson.dataSource = dataSource;
    }

    var version = gpmlPathwaySelection.attr('Version');
    if (!!version) {
      pvjson.version = version;
    }

    var author = gpmlPathwaySelection.attr('Author');
    if (!!author) {
      pvjson.author = author;
    }

    var maintainer = gpmlPathwaySelection.attr('Maintainer');
    if (!!maintainer) {
      pvjson.maintainer = maintainer;
    }

    var email = gpmlPathwaySelection.attr('Email');
    if (!!email) {
      pvjson.email = email;
    }

    var lastModified = gpmlPathwaySelection.attr('Last-Modified');
    if (!!lastModified) {
      pvjson.lastModified = lastModified;
    }

    var license = gpmlPathwaySelection.attr('License');
    if (!!license) {
      pvjson.license = license;
    }

    var name = gpmlPathwaySelection.attr('Name');
    if (!!name) {
      var splitName = name.split(' (');
      if (!!splitName && splitName.length === 2 && !!name.match(/\(/g) &&
          name.match(/\(/g).length === 1 && !!name.match(/\)/g) &&
          name.match(/\)/g).length === 1) {
        pvjson.standardName = splitName[0];
        pvjson.displayName = splitName[1].replace(')', '');
      } else {
        pvjson.standardName = name;
        pvjson.displayName = name;
      }
    }

    var bridgeDbOptions = {};
    var organism = gpmlPathwaySelection.attr('Organism');
    if (!!organism) {
      pvjson.organism = bridgeDbOptions.organism = organism;
    }

    // This is ugly. It doesn't belong on the pvjson.
    // We should pass in a parent object into each
    // of the converters onto which we could put this.
    pvjson.bridgeDb = new BridgeDb(bridgeDbOptions);

    pvjson.image = {
      '@context': {
        '@vocab': 'http://sch1ema.org/'
      },
      'width': parseFloat(gpmlPathwaySelection.find('Pathway Graphics')
          .attr('BoardWidth')),
      'height': parseFloat(gpmlPathwaySelection.find('Pathway Graphics')
          .attr('BoardHeight'))
    };

    /**
     * createSelectorObservable
     *
     * @param {String} selector
     * @param {object} [parentSelection=gpmlPathwaySelection] jQuery selection
     * @return {Object} Rx Observable that has jQuery one or more selections
     */
    function createSelectorObservable(selector, parentSelection) {
      parentSelection = parentSelection || gpmlPathwaySelection;
      var selectionList = parentSelection.find(selector);
      return Rx.Observable.from(selectionList)
        .filter(function(element) {
          return element;
        })
        .map($);
    }

    function createConverterObservable(elementName) {
      return createSelectorObservable(elementName)
        .flatMap(function(selection) {
          return Rx.Observable.fromCallback(converters[elementName].toPvjson)(
            pvjson, gpmlPathwaySelection, selection);
        });
    }

    var createNodeConverterObservable = createConverterObservable;

    function createEdgeConverterObservable(elementName) {
      return createConverterObservable(elementName)
        .flatMap(function(pvjsonData) {
          var pvjsonElements = _.isArray(pvjsonData) ? pvjsonData : [pvjsonData];
          return Rx.Observable.from(pvjsonElements);
        });

    }

    var xmlBiopaxSelection = gpmlPathwaySelection.find('Biopax').eq(0);
    var jsonBiopaxEntitySource = Rx.Observable.from(xmlBiopaxSelection)
      .map(function(xmlBiopaxSelection) {
        // TODO don't repeat this environment detection.
        // another version is already defined at the bottom of this file.
        if (isBrowser) { // isBrowser
          var serializer = new XMLSerializer();
          return serializer.serializeToString(xmlBiopaxSelection);
        } else { // isNode
          return xmlBiopaxSelection.html();
        }
      })
      .map(function(biopaxString) {
        // Fix errors with how GPML currently represents BioPAX
        return biopaxString.replace(/bp:ID/g, 'bp:id')
          .replace(/bp:DB/g, 'bp:db')
          .replace(/bp:TITLE/g, 'bp:title')
          .replace(/bp:SOURCE/g, 'bp:source')
          .replace(/bp:YEAR/g, 'bp:year')
          .replace(/bp:AUTHORS/g, 'bp:author')
          .replace(/rdf:id/g, 'rdf:ID')
          .replace(/Biopax xmlns="http:\/\/pathvisio.org\/GPML\/2013a"/,
          'Biopax xmlns="http://pathvisio.org/GPML/2013a" xmlns:xsd="http://www.w3.org/2001/XMLSchema#" xmlns:owl="http://www.w3.org/2002/07/owl#" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:bp="http://www.biopax.org/release/biopax-level3.owl#"')
          // Internet Explorer adds these, because the namespaces weren't defined in the GPML
          .replace(/xmlns:NS\d+=""/g, '')
          .replace(/NS\d+:/g, '');
      })
      .flatMap(function(biopaxString) {
        return Rx.Observable.fromNodeCallback(Biopax.toJson)(biopaxString, pathwayMetadata)
          .filter(function(jsonBiopax) {
            console.log('jsonBiopax');
            console.log(jsonBiopax);
            return jsonBiopax;
          })
          .map(function(jsonBiopax) {
            return jsonBiopax.entities;
          });
      })
      .filter(function(jsonBiopaxEntities) {
        return jsonBiopaxEntities && jsonBiopaxEntities.length > 0;
      })
      .flatMap(function(jsonBiopaxEntities) {
        return Rx.Observable.from(jsonBiopaxEntities);
      });

    // Get the IDs for any PublicationXrefs that are applicable to the entire pathway
    var pvjsonXrefSource = jsonBiopaxEntitySource.toArray()
      .flatMap(function(jsonBiopaxEntities) {
        return createSelectorObservable('Pathway > BiopaxRef')
          .map(function(biopaxRefSelection) {
            var biopaxRefIdUsed = biopaxRefSelection.text();
            var biopaxRef = jsonBiopaxEntities.filter(function(entity) {
              var elementId = entity.deprecatedId || entity.id;
              return elementId === biopaxRefIdUsed;
            })[0];
          })
          .filter(function(biopaxRef) {
            return biopaxRef && typeof biopaxRef.id !== 'undefined';
          })
          .map(function(biopaxRef) {
            return biopaxRef.id;
          });
      });

    // This returns an array containing all the pvjsonElements for this pathway
    var pvjsonElementsSource = jsonBiopaxEntitySource.toArray()
      .flatMap(function(jsonBiopaxEntities) {
        pvjson.elements = jsonBiopaxEntities;

        var pvjsonDataNodeSource = createNodeConverterObservable('DataNode');
        var pvjsonLabelSource = createNodeConverterObservable('Label');
        var pvjsonShapeSource = createNodeConverterObservable('Shape');
        var pvjsonStateSource = createNodeConverterObservable('State');

        // A GPML edge currently returns an array, while a node returns a plain object.
        // TODO look at whether edges need to return an array.
        var pvjsonGraphicalLineSource = createEdgeConverterObservable('GraphicalLine');
        var pvjsonInteractionSource = createEdgeConverterObservable('Interaction');

        return Rx.Observable.merge(
            Rx.Observable.from(jsonBiopaxEntities),
            pvjsonDataNodeSource,
            pvjsonLabelSource,
            pvjsonShapeSource,
            pvjsonStateSource,
            pvjsonGraphicalLineSource,
            pvjsonInteractionSource
        )
          /*
          .map(function(elements) {
            console.log('elements305');
            console.log(elements);
            return elements;
          })
          //*/
          .toArray()
          .flatMap(function(elements) {
            var groupSource = createSelectorObservable('Group')
              .flatMap(function(groupSelection) {
                return Rx.Observable.fromCallback(Group.toPvjson)(
                  pvjson, elements, gpmlPathwaySelection, groupSelection)
                  .flatMap(function(pvjsonData) {
                    return Rx.Observable.from(pvjsonData);
                  });
              });
            return Rx.Observable.from(elements).concat(groupSource);
          })
          /*
          .map(function(elements) {
            console.log('elements317');
            console.log(elements);
            return elements;
          })
          //*/
          .toArray();
      })
      .map(function(elements) {
        elements.filter(function(element) {
          return element.type === 'PublicationXref';
        }).forEach(function(publicationXref) {
          delete publicationXref.deprecatedId;
        });

        elements.sort(function(a, b) {
          // NOTE: Keep this. It makes no sense, but
          // undefined alone behaves differently from
          // undefined as a property value for sorting.
          if (typeof a.zIndex === 'undefined') {
            return 1;
          } else if (typeof b.zIndex === 'undefined') {
            return -1;
          }

          return a.zIndex - b.zIndex;
        });

        return elements;
      });

    Rx.Observable.zipArray(
        pvjsonElementsSource,
        pvjsonXrefSource.toArray()
    )
      .subscribe(function(elementsAndXrefs) {
        var elements = elementsAndXrefs[0];
        var xrefs = elementsAndXrefs[1];
        pvjson.elements = pvjson.elements.concat(elements);
        if (xrefs && xrefs.length > 0) {
          // NOTE intentionally singular to match biopax
          pvjson.xref = xrefs;
        }

        // TODO see note above regarding this
        delete pvjson.bridgeDb;

        return outerCallback(null, pvjson);
      }, function(err) {
        console.error('Error in converting GPML to pvjson.');
        console.error(err);
      }, function() {
        // onComplete
      });

    /*
    Async.waterfall([
      function(callbackWaterfall) {
        var jsonBiopax;
        var xmlBiopaxSelection = gpmlPathwaySelection.find('Biopax').eq(0);
        if (!!xmlBiopaxSelection && xmlBiopaxSelection.length > 0) {
          // TODO check whether this will always be completed by the time it is needed
          // look at http://www.biopax.org/owldoc/Level3/ for correct terms
          // TODO look at whether ontology terms or other items need to be updated
          var biopaxStringUnedited;
          // TODO don't repeat this environment detection.
          // another version is already defined at the bottom of this file.
          if (isBrowser) { // isBrowser
            var serializer = new XMLSerializer();
            biopaxStringUnedited = serializer.serializeToString(xmlBiopaxSelection[0]);
          } else { // isNode
            biopaxStringUnedited = xmlBiopaxSelection.html();
          }

          var biopaxString = '<Biopax>' + biopaxStringUnedited.replace(/bp:ID/g, 'bp:id')
            .replace(/bp:DB/g, 'bp:db')
            .replace(/bp:TITLE/g, 'bp:title')
            .replace(/bp:SOURCE/g, 'bp:source')
            .replace(/bp:YEAR/g, 'bp:year')
            .replace(/bp:AUTHORS/g, 'bp:author')
            .replace(/rdf:id/g, 'rdf:ID') + '</Biopax>';
          Biopax.toJson(biopaxString, pathwayMetadata, function(err, thisJsonBiopax) {
            jsonBiopax = thisJsonBiopax;
            if (!!jsonBiopax && !!jsonBiopax.entities && jsonBiopax.entities.length > 0) {
              pvjson.elements = pvjson.elements.concat(jsonBiopax.entities);
              callbackWaterfall(null, jsonBiopax);
            } else {
              callbackWaterfall(null, null);
            }
          });
        } else {
          callbackWaterfall(null, null);
        }
      },
      function(jsonBiopax, callbackWaterfall) {
        Async.parallel({
          BiopaxRef: function(callback) {
            var biopaxRefsSelection = gpmlPathwaySelection.find('Pathway > BiopaxRef');
            // TODO don't repeat this code with the same code in element.js
            if (biopaxRefsSelection.length > 0 && !!jsonBiopax && !!jsonBiopax.entities) {
              pvjson.xref = pvjson.xref || [];
              biopaxRefsSelection.each(function() {
                var biopaxRefSelection = $(this);
                var biopaxRefIdUsed = biopaxRefSelection.text();
                var biopaxRef = jsonBiopax.entities.filter(function(entity) {
                  var elementId = entity.deprecatedId || entity.id;
                  return elementId === biopaxRefIdUsed;
                })[0];
                if (!!biopaxRef && typeof(biopaxRef.id) !== 'undefined') {
                  pvjson.xref.push(biopaxRef.id);
                }
              });
              callback(null, 'biopaxRefs are all converted.');
            } else {
              callback(null, 'No biopaxRefs to convert.');
            }
          },
          dataSource: function(callback) {
            var jsonDataSource = gpmlPathwaySelection.attr('Data-Source');
            if (!!jsonDataSource) {
              pvjson.dataSource = jsonDataSource;
              callback(null, 'DataSource converted.');
            } else {
              callback(null, 'No DataSource to convert.');
            }
          },
          version: function(callback) {
            var jsonVersion = gpmlPathwaySelection.attr('Version');
            if (!!jsonVersion) {
              pvjson.version = jsonVersion;
              callback(null, 'Version converted.');
            } else {
              callback(null, 'No Version to convert.');
            }
          },
          author: function(callback) {
            var jsonAuthor = gpmlPathwaySelection.attr('Author');
            if (!!jsonAuthor) {
              pvjson.author = jsonAuthor;
              callback(null, 'Author converted.');
            } else {
              callback(null, 'No Author to convert.');
            }
          },
          maintainer: function(callback) {
            var jsonMaintainer = gpmlPathwaySelection.attr('Maintainer');
            if (!!jsonMaintainer) {
              pvjson.maintainer = jsonMaintainer;
              callback(null, 'Maintainer converted.');
            } else {
              callback(null, 'No Maintainer to convert.');
            }
          },
          email: function(callback) {
            var jsonEmail = gpmlPathwaySelection.attr('Email');
            if (!!jsonEmail) {
              pvjson.email = jsonEmail;
              callback(null, 'Email converted.');
            } else {
              callback(null, 'No Email to convert.');
            }
          },
          lastModified: function(callback) {
            var jsonLastModified = gpmlPathwaySelection.attr('Last-Modified');
            if (!!jsonLastModified) {
              pvjson.lastModified = jsonLastModified;
              callback(null, 'LastModified converted.');
            } else {
              callback(null, 'No LastModified to convert.');
            }
          },
          license: function(callback) {
            var jsonLicense = gpmlPathwaySelection.attr('License');
            if (!!jsonLicense) {
              pvjson.license = jsonLicense;
              callback(null, 'License converted.');
            } else {
              callback(null, 'No License to convert.');
            }
          },
          name: function(callback) {
            var jsonName = gpmlPathwaySelection.attr('Name');
            if (!!jsonName) {
              var splitName = jsonName.split(' (');
              if (!!splitName && splitName.length === 2 && !!jsonName.match(/\(/g) &&
                  jsonName.match(/\(/g).length === 1 && !!jsonName.match(/\)/g) &&
                  jsonName.match(/\)/g).length === 1) {
                pvjson.standardName = splitName[0];
                pvjson.displayName = splitName[1].replace(')', '');
              } else {
                pvjson.standardName = jsonName;
                pvjson.displayName = jsonName;
              }
              callback(null, 'Name converted.');
            } else {
              callback(null, 'No Name to convert.');
            }
          },
          organism: function(callback) {
            var jsonOrganism = gpmlPathwaySelection.attr('Organism');
            if (!!jsonOrganism) {
              pvjson.organism = jsonOrganism;
              callback(null, 'Organism converted.');
            } else {
              callback(null, 'No Organism to convert.');
            }
          },
          image: function(callback) {
            pvjson.image = {
              '@context': {
                '@vocab': 'http://schema.org/'
              },
              'width':parseFloat(gpmlPathwaySelection.find('Pathway Graphics')
                  .attr('BoardWidth')),
              'height':parseFloat(gpmlPathwaySelection.find('Pathway Graphics')
                  .attr('BoardHeight'))
            };
            callback(null, pvjson.image);
          },
          dataNode: function(callback) {
            gpmlPathwaySelection.find('DataNode').each(function() {
              var dataNodeSelection = $(this);
              //var dataNodeSelection = this;
              DataNode.toPvjson(pvjson, gpmlPathwaySelection, dataNodeSelection,
                function(pvjsonElements) {
                  pvjson.elements = pvjson.elements.concat(pvjsonElements);
                  return callback(null, 'DataNodes are all converted.');
                });
            });
          },
          label: function(callback) {
            gpmlPathwaySelection.find('Label').each(function() {
              var labelSelection = $(this);
              //var dataNodeSelection = this;
              Label.toPvjson(pvjson, gpmlPathwaySelection, labelSelection,
                function(pvjsonElements) {
                  pvjson.elements = pvjson.elements.concat(pvjsonElements);
                });
            });
            callback(null, 'Labels are all converted.');
          },
          shape: function(callback) {
            var shapeSelection;
            var shapesSelection = gpmlPathwaySelection.find('Shape');
            if (shapesSelection.length > 0) {
              gpmlPathwaySelection.find('Shape').each(function() {
                shapeSelection = $(this);
                Shape.toPvjson(pvjson, gpmlPathwaySelection, shapeSelection,
                  function(pvjsonElements) {
                    pvjson.elements = pvjson.elements.concat(pvjsonElements);
                  });
              });
              callback(null, 'Shapes are all converted.');
            } else {
              callback(null, 'No shapes to convert.');
            }
          },
          state: function(callback) {
            var stateSelection;
            var statesSelection = gpmlPathwaySelection.find('State');
            if (statesSelection.length > 0) {
              statesSelection.each(function() {
                stateSelection = $(this);
                State.toPvjson(pvjson, gpmlPathwaySelection, stateSelection,
                  function(pvjsonElements) {
                    pvjson.elements = pvjson.elements.concat(pvjsonElements);
                  });
              });
              callback(null, 'States are all converted.');
            } else {
              callback(null, 'No states to convert.');
            }
          },
          graphicalLine: function(callback) {
            var graphicalLineSelection;
            var graphicalLinesSelection = gpmlPathwaySelection.find('GraphicalLine');
            if (graphicalLinesSelection.length > 0) {
              gpmlPathwaySelection.find('GraphicalLine').each(function() {
                graphicalLineSelection = $(this);
                GraphicalLine.toPvjson(pvjson, gpmlPathwaySelection, graphicalLineSelection,
                  function(pvjsonElements) {
                    pvjson.elements = pvjson.elements.concat(pvjsonElements);
                  });
              });
              callback(null, 'GraphicalLines are all converted.');
            } else {
              callback(null, 'No graphicalLines to convert.');
            }
          },
          interaction: function(callback) {
            var interactionSelection;
            var interactionsSelection = gpmlPathwaySelection.find('Interaction');
            if (interactionsSelection.length > 0) {
              gpmlPathwaySelection.find('Interaction').each(function() {
                interactionSelection = $(this);
                Interaction.toPvjson(pvjson, gpmlPathwaySelection, interactionSelection,
                    function(pvjsonElements) {
                      pvjson.elements = pvjson.elements.concat(pvjsonElements);
                    });
              });
              callback(null, 'Interactions are all converted.');
            } else {
              callback(null, 'No interactions to convert.');
            }
          }
        },
        function(err, results) {
          var contents;
          var index;
          var elementsBefore;
          var elementsAfter;
          var textElementsDescribingGroup;
          var text;

          // Note: this calculates all the data for each group-node, except for its dimensions.
          // The dimenensions can only be calculated once all the rest of the elements have been
          // converted from GPML to JSON.
          var groupSelection;
          var groupCollectionSelection = gpmlPathwaySelection.find('Group');
          if (groupCollectionSelection.length > 0) {
            var groups = [];
            groupCollectionSelection.each(function() {
              var groupSelection = $(this);
              Group.toPvjson(pvjson, pvjson.elements, gpmlPathwaySelection, groupSelection,
                  function(pvjsonElements) {
                    pvjson.elements = pvjson.elements.concat(pvjsonElements);
                  });
            });
          }

          pvjson.elements.filter(function(element) {
            return element.type === 'PublicationXref';
          }).forEach(function(publicationXref) {
            delete publicationXref.deprecatedId;
          });

          pvjson.elements = pvjson.elements.sort(function(a, b) {
            // NOTE: Keep this. It makes no sense, but
            // undefined alone behaves differently from
            // undefined as a property value for sorting.
            if (typeof a.zIndex === 'undefined') {
              return 1;
            } else if (typeof b.zIndex === 'undefined') {
              return -1;
            }

            return a.zIndex - b.zIndex;
          });

          return outerCallback(null, pvjson);
        });
      }
    ]);
    //*/
  };

  // Corrects some errors in current Biopax embedded in GPML
  this.fixBiopax = function(gpmlPathwaySelection) {
    var xmlBiopaxSelection = gpmlPathwaySelection.find('Biopax');
    xmlBiopaxSelection.find('bp\\:PublicationXref').each(function() {
      var xmlPublicationXrefSelection = $(this);
      var publicationXrefId = xmlPublicationXrefSelection.attr('rdf:id');
      xmlPublicationXrefSelection.attr('rdf:id', null);
      xmlPublicationXrefSelection.attr('rdf:about', publicationXrefId);
      // still need to lowercase Biopax element names, e.g., bp:ID and bp:DB to bp:id and bp:db
      // will do it with a simple string regex before passing it into the Biopax library
    });
    return gpmlPathwaySelection;
  };

  // Removes confusion of GroupId vs. GraphId by just using GraphId to identify containing elements
  this.addIsPartOfAttribute = function(gpmlPathwaySelection) {
    gpmlPathwaySelection.find('Group').each(function() {
      var groupSelection = $(this);
      var groupId = groupSelection.attr('GroupId');
      groupSelection.attr('GroupId', null);
      var graphId = groupSelection.attr('GraphId');
      var groupedElementsSelection = gpmlPathwaySelection.find('[GroupRef=' + groupId + ']')
        .each(function(groupedElementSelection) {
          groupedElementSelection = $(this);
          groupedElementSelection.attr('IsPartOf', graphId);
          groupedElementSelection.attr('GroupRef', null);
        });
    });
    return gpmlPathwaySelection;
  };

  this.selectByMultipleTagNames = function(args) {
    var gpmlPathwaySelection = args.gpmlPathwaySelection;
    var elementTags = args.elementTags;
    var elementsSelection;
    var newElementsSelection;
    elementTags.forEach(function(elementTag) {
      newElementsSelection = gpmlPathwaySelection.find(elementTag);
      if (!!newElementsSelection[0][0]) {
        if (!!elementsSelection) {
          elementsSelection[0] = elementsSelection[0].concat(newElementsSelection[0]);
        } else {
          elementsSelection = newElementsSelection;
        }
      }
    });
    return elementsSelection;
  };

  // Fills in implicit values
  this.makeExplicit = function(gpmlPathwaySelection) {
    var groupGroupSelection;
    var groupNoneSelection;
    var groupPathwaySelection;
    var groupComplexSelection;
    var cellularComponentValue;
    var groupGroupGraphicsSelection;
    var groupNoneGraphicsSelection;
    var groupPathwayGraphicsSelection;
    var groupComplexGraphicsSelection;
    var graphId;
    var graphIdStub;
    var graphIdStubs = [];

    var selectAllGraphicalElementsArgs = {};
    selectAllGraphicalElementsArgs.gpmlPathwaySelection = gpmlPathwaySelection;
    selectAllGraphicalElementsArgs.elementTags = [
      'DataNode',
      'Label',
      'Shape',
      'State',
      'Anchor',
      'Interaction',
      'GraphicalLine',
      'Group'
    ];
    var selector = selectAllGraphicalElementsArgs.elementTags.join(', ');
    var graphicalElementsSelection = gpmlPathwaySelection.find(selector);
    // graphIdStub is whatever follows 'id' at the beginning of the GraphId string
    if (graphicalElementsSelection.length > 0) {
      graphicalElementsSelection.filter(function() {
        var graphicalElementSelection = $(this);
        return (!!graphicalElementSelection.attr('GraphId'));
      }).each(function() {
        var filteredResult = $(this);
        graphId = filteredResult.attr('GraphId');
        if (graphId.slice(0, 2) === 'id') {
          graphIdStub = graphId.slice(2, graphId.length);
          graphIdStubs.push(graphIdStub);
        }
      });
      graphIdStubs.sort(function(a, b) {
        return parseInt(a, 32) - parseInt(b, 32);
      });
      var largestGraphIdStub = graphIdStubs[graphIdStubs.length - 1] || 0;

      // Add a GraphId to every element missing a GraphId by
      // converting the largest graphIdStub to int, incrementing,
      // converting back to base32 and appending it to the string 'id'.
      graphicalElementsSelection.filter(function() {
        var graphicalElementSelection = $(this);
        return (!graphicalElementSelection.attr('GraphId'));
      }).each(function() {
        var filteredResult = $(this);
        largestGraphIdStub = (parseInt(largestGraphIdStub, 32) + 1).toString(32);
        filteredResult.attr('GraphId', 'id' + largestGraphIdStub);
      });

      /********************************************
       * Groups
       ********************************************/

      var createGraphicsElementForGroup = function(attributes) {
        var defaultAttributes = {
          Align: 'Center',
          Valign: 'Middle',
          FontWeight: 'Bold',
          LineThickness: 1,
          FillOpacity: 0.1
        };

        _.defaults(attributes, defaultAttributes);
        // TODO use one node vs. browser detection function throughout code!
        //if (isBrowser) {
        // is Browser
        if (typeof(document) !== 'undefined' && !!document && !!document.createElementNS) {
          var graphicsElement = document.createElementNS(
              'http://pathvisio.org/GPML/2013a', 'Graphics');

          _.forIn(attributes, function(value, name) {
            graphicsElement.setAttribute(name, value);
          });

          return graphicsElement.cloneNode();
        } else { // is Node
          var graphicsString = '<Graphics';
          _.forIn(attributes, function(value, name) {
            graphicsString += ' ' + name + '="' + value + '"';
          });
          graphicsString += '></Graphics>';
          return graphicsString;
        }
      };

      var appendGraphicsElementToGroup = function(groupSelection, graphicsElementOrString) {
        // TODO use one node vs. browser detection function throughout code!
        //if (isBrowser) {
        // is Browser
        if (typeof(document) !== 'undefined' && !!document && !!document.createElementNS) {
          var groupElement = $(groupSelection)[0];
          // it's an element here
          var graphicsElementInstance = graphicsElementOrString.cloneNode();
          groupElement.appendChild(graphicsElementInstance);
        } else { // is Node
          // it's a string here
          groupSelection.append(graphicsElementOrString);
        }
      };

      var groupGraphicsElements = {};

      var groupTypeNoneGraphicsElementAttributes = {
        FontSize: 1,
        Padding: 8,
        ShapeType: 'Rectangle',
        LineStyle: 'Broken',
        Color: '808080',
        FillColor: 'B4B464'
      };
      groupGraphicsElements.None = createGraphicsElementForGroup(
          groupTypeNoneGraphicsElementAttributes);

      var groupTypeGroupGraphicsElementAttributes = {
        FontSize: 1,
        Padding: 8,
        ShapeType: 'None',
        LineStyle: 'Broken',
        Color: '808080',
        FillColor: 'Transparent'
      };
      groupGraphicsElements.Group = createGraphicsElementForGroup(
          groupTypeGroupGraphicsElementAttributes);

      var groupTypeComplexGraphicsElementAttributes = {
        FontSize: 1,
        Padding: 11,
        ShapeType: 'Complex',
        LineStyle: 'Solid',
        Color: '808080',
        FillColor: 'B4B464'
      };
      groupGraphicsElements.Complex = createGraphicsElementForGroup(
          groupTypeComplexGraphicsElementAttributes);

      var groupTypePathwayGraphicsElementAttributes = {
        FontSize: 1,
        Padding: 8,
        ShapeType: 'Rectangle',
        LineStyle: 'Broken',
        Color: '808080',
        FillColor: '00FF00'
      };
      groupGraphicsElements.Pathway = createGraphicsElementForGroup(
          groupTypePathwayGraphicsElementAttributes);

      var groupCollectionSelection = gpmlPathwaySelection.find('Group')
        .each(function() {
          var groupSelection = $(this);

          // TODO in GPML now, groups of type "None" appear to always lack the Style attribute,
          // unlike all other group types. Check to make this is a safe assumption.
          // Right now, we're just setting all groups to have the default
          // Graphics element for Groups,
          // then we're going through the groups of a specific type and
          // resetting the Graphics element.

          var groupStyle = groupSelection.attr('Style') || 'None';
          appendGraphicsElementToGroup(groupSelection, groupGraphicsElements[groupStyle]);
        });

      // nodesSelection does not include Groups
      var selectAllNodesArgs = {};
      selectAllNodesArgs.gpmlPathwaySelection = gpmlPathwaySelection;
      selectAllNodesArgs.elementTags = [
        'DataNode',
        'Label',
        'Shape',
        'State'
      ];
      var nodesSelector = selectAllNodesArgs.elementTags.join(', ');
      var nodesSelection = gpmlPathwaySelection.find(nodesSelector);
      if (nodesSelection.length > 0) {
        var labelsSelection = gpmlPathwaySelection.find('Label');
        if (labelsSelection.length > 0) {
          labelsSelection.filter(function() {
            var labelSelection = $(this);
            var graphicsSelection = labelSelection.find('Graphics');
            return (!graphicsSelection.attr('ShapeType'));
          }).each(function() {
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('ShapeType', 'None');
          });
          labelsSelection.filter(function() {
            var graphicsSelection = $(this).find('Graphics');
            return (!graphicsSelection.attr('FillColor'));
          }).each(function() {
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('FillColor', 'Transparent');
          });
        }

        var statesSelection = gpmlPathwaySelection.find('State');
        if (statesSelection.length > 0) {
          statesSelection.filter(function() {
            var graphicsSelection = $(this).find('Graphics');
            return (!graphicsSelection.attr('FillColor'));
          }).each(function() {
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('FillColor', 'ffffff');
          });

          statesSelection.filter(function() {
            var graphicsSelection = $(this).find('Graphics');
            return (!graphicsSelection.attr('FontSize'));
          }).each(function() {
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('FontSize', 10);
          });

          statesSelection.filter(function() {
            var graphicsSelection = $(this).find('Graphics');
            return (!graphicsSelection.attr('Valign'));
          }).each(function() {
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('Valign', 'Middle');
          });
        }

        var shapesSelection = gpmlPathwaySelection.find('Shape');
        if (shapesSelection.length > 0) {
          shapesSelection.filter(function() {
            var graphicsSelection = $(this).find('Graphics');
            return (!graphicsSelection.attr('FillColor'));
          }).each(function() {
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('FillColor', 'Transparent');
          });

          shapesSelection.filter(function() {
            var graphicsSelection = $(this).find('Graphics');
            return (graphicsSelection.attr('Rotation') === '0.0');
          }).each(function() {
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('Rotation', null);
          });

          var cellularComponentsSelection = shapesSelection.find(
              '[Key="org.pathvisio.CellularComponentProperty"]')
            .each(function() {
              var cellularComponentSelection = $(this);
              cellularComponentValue = cellularComponentSelection.attr('Value');
              cellularComponentSelection.parent().attr('CellularComponent', cellularComponentValue);
            });
        }

        // "Ellipse" is the word that other graphics libraries seem to have standardized on.
        nodesSelection.filter(function() {
          var graphicsSelection = $(this).find('Graphics');
          return (graphicsSelection.attr('ShapeType') === 'Oval');
        }).each(function() {
          var graphicsSelection = $(this).find('Graphics');
          graphicsSelection.attr('ShapeType', 'Ellipse');
        });

        nodesSelection.filter(function() {
          var graphicsSelection = $(this).find('Graphics');
          return (!graphicsSelection.attr('Padding'));
        }).each(function() {
          var graphicsSelection = $(this).find('Graphics');
          graphicsSelection.attr('Padding', '0.5em');
        });

        nodesSelection.filter(function() {
          var graphicsSelection = $(this).find('Graphics');
          return (!graphicsSelection.attr('ShapeType'));
        }).each(function() {
          var graphicsSelection = $(this).find('Graphics');
          graphicsSelection.attr('ShapeType', 'Rectangle');
        });

        nodesSelection.filter(function() {
          var graphicsSelection = $(this).find('Graphics');
          return (!graphicsSelection.attr('Color'));
        }).each(function() {
          var graphicsSelection = $(this).find('Graphics');
          graphicsSelection.attr('Color', '000000');
        });

        nodesSelection.filter(function() {
          var graphicsSelection = $(this).find('Graphics');
          return (!graphicsSelection.attr('LineThickness'));
        }).each(function() {
          var graphicsSelection = $(this).find('Graphics');
          graphicsSelection.attr('LineThickness', 1);
        });

        nodesSelection.filter(function() {
          var graphicsSelection = $(this).find('Graphics');
          return (!graphicsSelection.attr('ZOrder'));
        }).each(function() {
          var graphicsSelection = $(this).find('Graphics');
          graphicsSelection.attr('ZOrder', 0);
        });

        nodesSelection.filter(function() {
          var graphicsSelection = $(this).find('Graphics');
          return (!graphicsSelection.attr('Align'));
        }).each(function() {
          var graphicsSelection = $(this).find('Graphics');
          graphicsSelection.attr('Align', 'Center');
        });

        nodesSelection.filter(function() {
          var graphicsSelection = $(this).find('Graphics');
          return (!graphicsSelection.attr('Valign'));
        }).each(function() {
          var graphicsSelection = $(this).find('Graphics');
          graphicsSelection.attr('Valign', 'Top');
        });

        // some shapes have GPML values that do not match what is visually
        // displayed in PathVisio-Java.
        // Below we correct the GPML so that the display in pvjs will
        // match the display in PathVisio-Java.
        var gpmlWidth;
        var correctedGpmlWidth;
        var gpmlHeight;
        var gpmlCenterX;
        var gpmlCenterY;
        var xScaleFactor;
        var triangleSelection;
        var triangleXCorrectionFactor = 0.311;
        var triangleYCorrectionFactor = 0.07;
        var triangleWidthCorrectionFactor = 0.938;
        var triangleHeightCorrectionFactor = 0.868;
        var trianglesSelection = shapesSelection.find('[ShapeType="Triangle"]');
        trianglesSelection.each(function() {
          triangleSelection = $(this);

          // TODO check whetherthisshould be .attr or .find('graphics').attr
          gpmlCenterX = parseFloat(triangleSelection.attr('CenterX'));
          gpmlCenterY = parseFloat(triangleSelection.attr('CenterY'));
          gpmlWidth = parseFloat(triangleSelection.attr('Width'));
          gpmlHeight = parseFloat(triangleSelection.attr('Height'));

          var correctedWidth = gpmlWidth * triangleWidthCorrectionFactor;
          var uncorrectedX = gpmlCenterX - gpmlWidth / 2;

          var uncorrectedY = gpmlCenterY - gpmlHeight / 2;
          var correctedHeight = gpmlHeight * triangleHeightCorrectionFactor;

          var gpmlRotation = triangleSelection.attr('Rotation') || 0;
          // Remember that GPML saves rotation in radians, even though
          // PathVisio-Java displays rotation in degrees.
          // This conversion changes the rotation to reflect the angle between
          // the green rotation control dot in PathVisio-Java and the X-axis.
          var angleToControlPoint = 2 * Math.PI - gpmlRotation;
          var triangleXCorrectionAccountingForRotation = triangleXCorrectionFactor *
            Math.cos(angleToControlPoint) * gpmlWidth +
            triangleYCorrectionFactor *
            Math.sin(angleToControlPoint) * gpmlHeight;

          var distanceTriangleTipExtendsBeyondBBox = ((gpmlCenterX +
                triangleXCorrectionFactor * gpmlWidth - gpmlWidth / 2) + correctedWidth) -
            (gpmlCenterX + gpmlWidth / 2);

          var triangleYCorrection = (-1) * distanceTriangleTipExtendsBeyondBBox *
            Math.sin(angleToControlPoint) +
            triangleYCorrectionFactor * Math.cos(angleToControlPoint) * gpmlHeight;

          var correctedX = uncorrectedX + triangleXCorrectionAccountingForRotation;
          var correctedY = uncorrectedY + triangleYCorrection;

          triangleSelection.attr('CenterX', correctedX + correctedWidth / 2)
          .attr('CenterY', correctedY + correctedHeight / 2)
          .attr('Height', correctedHeight)
          .attr('Width', correctedWidth);
        });
        var arcSelection;
        var arcsSelection = shapesSelection.find('[ShapeType="Arc"]').each(function() {
          arcSelection = $(this);

          var gpmlHeight = parseFloat(arcSelection.attr('Height'));
          var gpmlWidth = parseFloat(arcSelection.attr('Width'));
          var correctedHeight = gpmlHeight / 2;

          // TODO refactor this code to be DRY (repeated above)
          var gpmlRotation = arcSelection.attr('Rotation') || 0;
          // Remember that GPML saves rotation in radians,
          // even though PathVisio-Java displays rotation in degrees.
          // This conversion changes the rotation to reflect the angle between
          // the green rotation control dot in PathVisio-Java and the X-axis.
          var angleToControlPoint = 2 * Math.PI - gpmlRotation;

          gpmlCenterX = parseFloat(arcSelection.attr('CenterX'));
          gpmlCenterY = parseFloat(arcSelection.attr('CenterY'));
          var x = gpmlCenterX - gpmlWidth / 2;
          var y = gpmlCenterY - gpmlHeight / 2;

          var correctedX = x + correctedHeight * Math.sin(angleToControlPoint);
          var correctedY = y + correctedHeight * Math.cos(angleToControlPoint);

          var correctedCenterX = correctedX + gpmlWidth / 2;
          var correctedCenterY = correctedY + correctedHeight;
          arcSelection.attr('CenterX', correctedCenterX)
          .attr('CenterY', correctedCenterY);
        });
        var pentagonSelection;
        var pentagonXScaleFactor = 0.904;
        var pentagonYScaleFactor = 0.95;
        var pentagonsSelection = shapesSelection.find('[ShapeType="Pentagon"]').each(function() {
          pentagonSelection = $(this);
          gpmlWidth = parseFloat(pentagonSelection.attr('Width'));
          gpmlHeight = parseFloat(pentagonSelection.attr('Height'));
          gpmlCenterX = parseFloat(pentagonSelection.attr('CenterX'));
          pentagonSelection.attr('CenterX', gpmlCenterX +
              gpmlWidth * (1 - pentagonXScaleFactor) / 2)
          .attr('Width', gpmlWidth * pentagonXScaleFactor)
          .attr('Height', gpmlHeight * pentagonYScaleFactor);
        });
        var hexagonSelection;
        var hexagonYScaleFactor = 0.88;
        var hexagonsSelection = shapesSelection.find('[ShapeType="Hexagon"]').each(function() {
          hexagonSelection = $(this);
          gpmlHeight = parseFloat(hexagonSelection.attr('Height'));
          hexagonSelection.attr('Height', gpmlHeight * hexagonYScaleFactor);
        });

        var dataNodeSelection;
        var dataNodeType;
        var dataNodesSelection = gpmlPathwaySelection.find('DataNode');
        if (dataNodesSelection.length > 0) {
          dataNodesSelection.filter(function() {
            return (!$(this).find('Graphics').attr('FillColor'));
          }).each(function() {
            $(this).find('Graphics').attr('FillColor', 'ffffff');
          });
        }

      }

      // This applies to both nodes and edges
      var doubleLinesSelection = gpmlPathwaySelection.find(
          '[Key="org.pathvisio.DoubleLineProperty"]')
        .each(function() {
          $(this).parent().find('Graphics').attr('LineStyle', 'Double');
        });

      var selectAllEdgesArgs = {};
      selectAllEdgesArgs.gpmlPathwaySelection = gpmlPathwaySelection;
      selectAllEdgesArgs.elementTags = [
        'Interaction',
        'GraphicalLine'
      ];
      var edgesSelector = selectAllEdgesArgs.elementTags.join(', ');
      var edgesSelection = gpmlPathwaySelection.find(edgesSelector);

      if (edgesSelection.length > 0) {
        edgesSelection.each(function() {
          $(this).find('Graphics').attr('FillColor', 'Transparent');
        });
        edgesSelection.filter(function() {
          var graphicsSelection = $(this).find('Graphics');
          return (!graphicsSelection.attr('ConnectorType'));
        }).each(function(d, i) {
          $(this).find('Graphics').attr('ConnectorType', 'Straight');
        });
        edgesSelection.filter(function() {
          return (!$(this).find('Graphics').attr('Color'));
        }).each(function(d, i) {
          $(this).find('Graphics').attr('Color', '000000');
        });

        var anchorsSelection = gpmlPathwaySelection.find('Anchor');
        if (anchorsSelection.length > 0) {
          anchorsSelection.each(function() {
            var anchorSelection = $(this);
            var parentGraphicsSelection = anchorSelection.parent();
            var shapeTypeValue = anchorSelection.attr('Shape') || 'None';
            var positionValue = anchorSelection.attr('Position');

            // TODO use one node vs. browser detection function throughout code!
            if (typeof(document) !== 'undefined' && !!document && !!document.createElementNS) {
              var graphicsElement = document.createElementNS(
                'http://pathvisio.org/GPML/2013a', 'Graphics');
              graphicsElement.setAttribute('Position', positionValue);
              graphicsElement.setAttribute('ShapeType', shapeTypeValue);
              graphicsElement.setAttribute('LineThickness', 0);
              graphicsElement.setAttribute('FillColor', parentGraphicsSelection.attr('Color'));
              var anchorElement = anchorSelection[0];
              anchorElement.appendChild(graphicsElement);
            } else {
              anchorSelection.append('<Graphics Position="' + positionValue + '" ShapeType="' +
                shapeTypeValue + '" LineThickness="' + 0 + '" FillColor="' +
                parentGraphicsSelection.attr('Color') + '"></Graphics>');
            }

            anchorSelection.attr('Position', null);
            anchorSelection.attr('Shape', null);
            // In a future version of GPML, we could improve rendering speed
            // if we included the cached X and Y
            // values for Anchors, just like we currently do for Points.
          });
          anchorsSelection.filter(function() {
            var graphicsSelection = $(this).find('Graphics');
            var result = false;
            if (graphicsSelection.length > 0) {
              result = graphicsSelection.attr('ShapeType') === 'Circle';
            }
            return result;
          }).each(function(d, i) {
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('ShapeType', 'Ellipse');
            graphicsSelection.attr('Width', 8);
            graphicsSelection.attr('Height', 8);
          });
          anchorsSelection.filter(function() {
            var graphicsSelection = $(this).find('Graphics');
            var result = false;
            if (graphicsSelection.length > 0) {
              result = graphicsSelection.attr('ShapeType') === 'None';
            }
            return result;
          }).each(function(d, i) {
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('Width', 4);
            graphicsSelection.attr('Height', 4);
          });
        }
      }
    }

    return gpmlPathwaySelection;
  };

  this.toBiopaxjson = function(gpmlPathwaySelection, pathwayMetadata, callback) {
    // TODO convert Metabolite to SmallMolecule
    this.toPvjson(gpmlPathwaySelection, pathwayMetadata, function(err, pvjson) {
      var biopaxjson = {};
      biopaxjson['@context'] = pvjson['@context'];
      biopaxjson['@graph'] = [];

      var pathway = {};
      pathway.id = pvjson.id;
      pathway.version = pvjson.version;
      pathway.type = pvjson.type;
      if (!!pvjson.xref) {
        pathway.xref = pvjson.xref;
      }
      if (!!pvjson.standardName) {
        pathway.standardName = pvjson.standardName;
      }
      if (!!pvjson.displayName) {
        pathway.displayName = pvjson.displayName;
      }
      if (!!pvjson.organism) {
        pathway.organism = pvjson.organism;
      }

      var biopaxElements = [
        'PublicationXref',
        'UnificationXref',
        'RelationshipXref',
        'ProteinReference',
        'ProteinReference',
        'Dna',
        'DnaReference',
        'Rna',
        'SmallMolecule',
        'SmallMoleculeReference',
        'Gene',
        'GeneReference',
        'PhysicalEntity',
        'Interaction',
        'Control',
        'TemplateReactionRegulation',
        'Catalysis',
        'Modulation',
        'Conversion',
        'BiochemicalReaction',
        'TransportWithBiochemicalReaction',
        'ComplexAssembly',
        'Degradation',
        'Transport',
        'TransportWithBiochemicalReaction',
        'GeneticInteraction',
        'MolecularInteraction',
        'TemplateReaction'
      ];

      var biopaxEdgeTypes = [
        'Interaction',
        'Control',
        'TemplateReactionRegulation',
        'Catalysis',
        'Modulation',
        'Conversion',
        'BiochemicalReaction',
        'TransportWithBiochemicalReaction',
        'ComplexAssembly',
        'Degradation',
        'Transport',
        'TransportWithBiochemicalReaction',
        'GeneticInteraction',
        'MolecularInteraction',
        'TemplateReaction'
      ];

      var pathwayComponent = [];
      pvjson.elements.forEach(function(entity) {
        if (!!entity.type) {
          var type = entity.type;
          if (!_.isArray(type)) {
            type = [type];
          }
          var intersectionBetweenTypesAndBiopaxElements = _.intersection(type, biopaxElements);
          if (intersectionBetweenTypesAndBiopaxElements.length > 0) {
            entity.type = intersectionBetweenTypesAndBiopaxElements[0];
            delete entity.backgroundColor;
            delete entity.borderWidth;
            delete entity.color;
            delete entity.displayId;
            delete entity.fontSize;
            delete entity.fontWeight;
            delete entity['gpml:element'];
            delete entity['gpml:Type'];
            delete entity.height;
            delete entity.isPartOf;
            delete entity.padding;
            delete entity.rotation;
            delete entity.shape;
            delete entity.textAlign;
            delete entity.verticalAlign;
            delete entity.width;
            delete entity.x;
            delete entity.y;
            delete entity.zIndex;
            delete entity.points;
            delete entity.markerStart;
            delete entity.markerEnd;
            biopaxjson['@graph'].push(entity);
          }
          var intersectionBetweenTypesAndBiopaxEdgeTypes = _.intersection(type, biopaxEdgeTypes);
          if (intersectionBetweenTypesAndBiopaxEdgeTypes.length > 0) {
            pathwayComponent.push(entity.id);
          }
        }
      });
      pathway.pathwayComponent = pathwayComponent;
      biopaxjson['@graph'].push(pathway);
      callback(null, biopaxjson);
    });
  };
};

/* TODO finish this. it's currently non-functional and only part-way done.
function enableCommandLine(Wikipathways) {
  function list(val) {
    return val.split(',');
  }

  var program = require('commander');
  var npmPackage = JSON.parse(fs.readFileSync('./package.json', {encoding: 'utf8'}));
  program
    .version(npmPackage.version);

   program
     .command('convert-to-json <wikpathways-id>')
     .description('Convert GPML to JSON.')
     .action(function(gpml) {

       // haven't figured out how to go from command line to input args
        var gpmlPathwaySelection = gpml
        var pathwayMetadata = 'something';

        Gpml2Json.toPvjson(gpmlPathwaySelection, pathwayMetadata,
        function(err, pathway) {
          if (err) {
            console.log(err);
            process.exit(1);
          }
          console.log(JSON.stringify(pathway, null, '\t'));
          process.exit(0);
        });
     });

   program
     .command('*')
     .description('deploy the given env')
     .action(function(env) {
       console.log('deploying "%s"', env);
     });

    program.parse(process.argv);

  if (program.listPathways) {
    console.log('List of pathways of type %s', program.listPathways);
  }
}
//*/

(function() {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    //in browser environment
    window.Gpml2Json = Gpml2Json;
  }

  if (!!module && !!module.exports) {
    //in node and/or CommonJS environment
    module.exports = Gpml2Json;
  }
})();
