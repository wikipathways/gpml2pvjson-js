var GpmlUtilities = require('./gpml-utilities.js')
  , Async = require('async')
  , Biopax = require('biopax2json')
  // , Anchor = require('./anchor.js')
  , BiopaxRef = require('./biopax-ref.js')
  // , Comment = require('./comment.js')
  , DataNode = require('./data-node.js')
  // , Element = require('./element.js')
  , fs = require('fs')
  , GraphicalLine = require('./graphical-line.js')
  // , Graphics = require('./graphics.js')
  , Group = require('./group.js')
  , Interaction = require('./interaction.js')
  , Label = require('./label.js')
  // , Point = require('./point.js')
  , Shape = require('./shape.js')
  , State = require('./state.js')
  , _ = require('lodash')
  // , Text = require('./text.js')
  ;

module.exports = {
  toPvjson: function(gpmlPathwaySelection, pathwayMetadata, callbackOutside){

    var xmlns = gpmlPathwaySelection.attr('xmlns');
    gpmlPathwaySelection = this.fixBiopax(this.addIsPartOfAttribute(this.makeExplicit(gpmlPathwaySelection)));
    var pvjson = {};

    var pathwayIri = 'http://identifiers.org/wikipathways/' + pathwayMetadata.dbId;

    var globalContext = [];
    // TODO update this to remove test2.
    //globalContext.push('http://test2.wikipathways.org/v2/contexts/pathway.jsonld');
    globalContext.push('http://test2.wikipathways.org/v2/contexts/biopax.jsonld');
    globalContext.push('http://test2.wikipathways.org/v2/contexts/organism.jsonld');
    globalContext.push('http://test2.wikipathways.org/v2/contexts/display.jsonld');
    //globalContext.push('http://test2.wikipathways.org/v2/contexts/interaction-type.jsonld');
    pvjson['@context'] = globalContext;
    var localContext = {};
    localContext = {};
    localContext['@base'] = pathwayIri + '/';
    pvjson['@context'].push(localContext);
    pvjson.type = 'Pathway';
    // using full IRI, because otherwise I would have to indicate the id as something like "/", which is ugly.
    pvjson.id = pathwayIri;
    pvjson.idVersion = pathwayMetadata.idVersion;
    pvjson.xrefs = [];

    pvjson.elements = [];

    /* Dev only
    var pd = require('pretty-data').pd;
    var rawGpmlAsString = gpmlPathwaySelection.find('*').html();
    var rawGpmlAsPrettyString = pd.xml(rawGpmlAsString);
    //console.log('rawGpmlAsPrettyString');
    //console.log(rawGpmlAsPrettyString);
    var updatedGpmlAsString = gpmlPathwaySelection.find('*').html();
    var processedGpmlAsPrettyString = pd.xml(updatedGpmlAsString);
    console.log('processedGpmlAsPrettyString');
    console.log(processedGpmlAsPrettyString);
    //*/

    // test for whether file is GPML
    if (GpmlUtilities.supportedNamespaces.indexOf(xmlns) === -1) {
      callbackOutside('Pathvisiojs does not support the data format provided. Please convert to GPML and retry.', {});
    } else {
      // test for whether the GPML file version matches the latest version (only the latest version will be supported by pathvisiojs).
      if (GpmlUtilities.supportedNamespaces.indexOf(xmlns) !== 0) {
        // TODO call the Java RPC updater or in some other way call for the file to be updated.
        callbackOutside('Pathvisiojs may not fully support the version of GPML provided (xmlns: ' + xmlns + '). Please convert to the supported version of GPML (xmlns: ' + GpmlUtilities.supportedNamespaces[0] + ').', {});
      } else {
        Async.waterfall([
          function(callbackWaterfall) {
            var jsonBiopax;
            var xmlBiopaxSelection = gpmlPathwaySelection.find('Biopax');
            if (!!xmlBiopaxSelection && xmlBiopaxSelection.length > 0) {
              // TODO check whether this will always be completed by the time it is needed
              // look at http://www.biopax.org/owldoc/Level3/ for correct terms
              // TODO look at whether ontology terms or other items need to be updated
              var biopaxString = xmlBiopaxSelection.toString().replace(/bp:ID/g, 'bp:id').replace(/bp:DB/g, 'bp:db').replace(/bp:TITLE/g, 'bp:title').replace(/bp:SOURCE/g, 'bp:source').replace(/bp:YEAR/g, 'bp:year').replace(/bp:AUTHORS/g, 'bp:author');
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
              BiopaxRef: function(callback){
                var biopaxRefsSelection = gpmlPathwaySelection.find('Pathway > BiopaxRef');
                // TODO don't repeat this code with the same code in element.js
                if (biopaxRefsSelection.length > 0 && !!jsonBiopax && !!jsonBiopax.entities) {
                  pvjson.xrefs = pvjson.xrefs || [];
                  biopaxRefsSelection.each(function() {
                    var biopaxRefSelection = $( this );
                    var biopaxRefIdUsed = biopaxRefSelection.text();
                    var biopaxRef = jsonBiopax.entities.filter(function(entity) {
                      var elementId = entity.deprecatedId || entity.id;
                      return elementId === biopaxRefIdUsed;
                    })[0];
                    if (!!biopaxRef && typeof(biopaxRef.id) !== 'undefined') {
                      pvjson.xrefs.push(biopaxRef.id);
                    }
                  });
                  callback(null, 'biopaxRefs are all converted.');
                }
                else {
                  callback(null, 'No biopaxRefs to convert.');
                }
              },
              dataSource: function(callback){
                var jsonDataSource = gpmlPathwaySelection.attr('Data-Source');
                if (!!jsonDataSource) {
                  pvjson.dataSource = jsonDataSource;
                  callback(null, 'DataSource converted.');
                }
                else {
                  callback(null, 'No DataSource to convert.');
                }
              },
              version: function(callback){
                var jsonVersion = gpmlPathwaySelection.attr('Version');
                if (!!jsonVersion) {
                  pvjson.idVersion = jsonVersion;
                  callback(null, 'Version converted.');
                }
                else {
                  callback(null, 'No Version to convert.');
                }
              },
              author: function(callback){
                var jsonAuthor = gpmlPathwaySelection.attr('Author');
                if (!!jsonAuthor) {
                  pvjson.author = jsonAuthor;
                  callback(null, 'Author converted.');
                }
                else {
                  callback(null, 'No Author to convert.');
                }
              },
              maintainer: function(callback){
                var jsonMaintainer = gpmlPathwaySelection.attr('Maintainer');
                if (!!jsonMaintainer) {
                  pvjson.maintainer = jsonMaintainer;
                  callback(null, 'Maintainer converted.');
                }
                else {
                  callback(null, 'No Maintainer to convert.');
                }
              },
              email: function(callback){
                var jsonEmail = gpmlPathwaySelection.attr('Email');
                if (!!jsonEmail) {
                  pvjson.email = jsonEmail;
                  callback(null, 'Email converted.');
                }
                else {
                  callback(null, 'No Email to convert.');
                }
              },
              lastModified: function(callback){
                var jsonLastModified = gpmlPathwaySelection.attr('Last-Modified');
                if (!!jsonLastModified) {
                  pvjson.lastModified = jsonLastModified;
                  callback(null, 'LastModified converted.');
                }
                else {
                  callback(null, 'No LastModified to convert.');
                }
              },
              license: function(callback){
                var jsonLicense = gpmlPathwaySelection.attr('License');
                if (!!jsonLicense) {
                  pvjson.license = jsonLicense;
                  callback(null, 'License converted.');
                }
                else {
                  callback(null, 'No License to convert.');
                }
              },
              name: function(callback){
                var jsonName = gpmlPathwaySelection.attr('Name');
                if (!!jsonName) {
                  var splitName = jsonName.split(' (');
                  if (!!splitName && splitName.length === 2 && !!jsonName.match(/\(/g) && jsonName.match(/\(/g).length === 1 && !!jsonName.match(/\)/g) && jsonName.match(/\)/g).length === 1) {
                    pvjson.standardName = splitName[0];
                    pvjson.displayName = splitName[1].replace(')', '');
                  } else {
                    pvjson.standardName = jsonName;
                    pvjson.displayName = jsonName;
                  }
                  callback(null, 'Name converted.');
                }
                else {
                  callback(null, 'No Name to convert.');
                }
              },
              organism: function(callback){
                var jsonOrganism = gpmlPathwaySelection.attr('Organism');
                if (!!jsonOrganism) {
                  pvjson.organism = jsonOrganism;
                  callback(null, 'Organism converted.');
                }
                else {
                  callback(null, 'No Organism to convert.');
                }
              },
              image: function(callback){
                pvjson.image = {
                  '@context': {
                    '@vocab': 'http://schema.org/'
                  },
                  'width':parseFloat(gpmlPathwaySelection.find('Pathway Graphics').attr('BoardWidth')),
                  'height':parseFloat(gpmlPathwaySelection.find('Pathway Graphics').attr('BoardHeight'))
                };
                callback(null, pvjson.image);
              },
              dataNode: function(callback){
                var dataNodeSelection, dataNodesSelection = gpmlPathwaySelection.find('DataNode');
                if (dataNodesSelection.length > 0) {


                  dataNodesSelection.each(function() {
                    var dataNodeSelection = $( this );
                    DataNode.toPvjson(pvjson, gpmlPathwaySelection, dataNodeSelection, function(pvjsonElements) {
                      pvjson.elements = pvjson.elements.concat(pvjsonElements);
                      //callbackEach(null);
                    });
                  });
                  callback(null, 'DataNodes are all converted.');


                        /*
                  Async.each(dataNodesSelection, 
                    function(dataNodeSelection, callbackEach) {
                    //function(d, callbackEach) {
                      //dataNodeSelection = $( d );
                        //callbackEach(null);
                      DataNode.toPvjson(pvjson, gpmlPathwaySelection, dataNodeSelection, function(pvjsonElements) {
                        pvjson.elements = pvjson.elements.concat(pvjsonElements);
                        callbackEach(null);
                      });
                    },
                    function(err) {
                      callback(null, 'DataNodes are all converted.');
                  });
                      //*/
                }
                else {
                  callback(null, 'No dataNodes to convert.');
                }
              },
              label: function(callback){
                var labelSelection, labelsSelection = gpmlPathwaySelection.find('Label');
                if (labelsSelection.length > 0) {
                  gpmlPathwaySelection.find('Label').each(function() {
                    labelSelection = $( this );
                    Label.toPvjson(pvjson, gpmlPathwaySelection, labelSelection, function(pvjsonElements) {
                      pvjson.elements = pvjson.elements.concat(pvjsonElements);
                    });
                  });
                  callback(null, 'Labels are all converted.');
                }
                else {
                  callback(null, 'No labels to convert.');
                }
              },
              shape: function(callback){
                var shapeSelection, shapesSelection = gpmlPathwaySelection.find('Shape');
                if (shapesSelection.length > 0) {
                  gpmlPathwaySelection.find('Shape').each(function() {
                    shapeSelection = $( this );
                    Shape.toPvjson(pvjson, gpmlPathwaySelection, shapeSelection, function(pvjsonElements) {
                      pvjson.elements = pvjson.elements.concat(pvjsonElements);
                    });
                  });
                  callback(null, 'Shapes are all converted.');
                }
                else {
                  callback(null, 'No shapes to convert.');
                }
              },
              /*
              Anchor: function(callback){
                var anchorSelection, anchorsSelection = gpmlPathwaySelection.selectAll('Anchor');
                if (anchorsSelection[0].length > 0) {
                  pvjson.anchors = [];
                  anchorsSelection.each(function() {
                    anchorSelection = d3.select(this);
                    pathvisiojs.formatConverter.gpml.anchor.toPvjson(gpmlPathwaySelection, anchorSelection, function(pvjsonElements) {
                      pvjson.anchors = pvjsonElements;
                      pvjson.selectedPathway = pvjson.selectedPathway.concat(pvjsonElements);
                    });
                  });
                  callback(null, 'Anchors are all converted.');
                }
                else {
                  callback(null, 'No anchors to convert.');
                }
              },
              //*/
              state: function(callback){
                var stateSelection, statesSelection = gpmlPathwaySelection.find('State');
                if (statesSelection.length > 0) {
                  statesSelection.each(function() {
                    stateSelection = $( this );
                    State.toPvjson(pvjson, gpmlPathwaySelection, stateSelection, function(pvjsonElements) {
                      pvjson.elements = pvjson.elements.concat(pvjsonElements);
                    });
                  });
                  callback(null, 'States are all converted.');
                }
                else {
                  callback(null, 'No states to convert.');
                }
              },
              graphicalLine: function(callback){
                var graphicalLineSelection, graphicalLinesSelection = gpmlPathwaySelection.find('GraphicalLine');
                if (graphicalLinesSelection.length > 0) {
                  gpmlPathwaySelection.find('GraphicalLine').each(function() {
                    graphicalLineSelection = $( this );
                    GraphicalLine.toPvjson(pvjson, gpmlPathwaySelection, graphicalLineSelection, function(pvjsonElements) {
                      pvjson.elements = pvjson.elements.concat(pvjsonElements);
                    });
                  });
                  callback(null, 'GraphicalLines are all converted.');
                }
                else {
                  callback(null, 'No graphicalLines to convert.');
                }
              },
              interaction: function(callback){
                var interactionSelection, interactionsSelection = gpmlPathwaySelection.find('Interaction');
                if (interactionsSelection.length > 0) {
                  gpmlPathwaySelection.find('Interaction').each(function() {
                    interactionSelection = $( this );
                    Interaction.toPvjson(pvjson, gpmlPathwaySelection, interactionSelection, function(pvjsonElements) {
                      pvjson.elements = pvjson.elements.concat(pvjsonElements);
                    });
                  });
                  callback(null, 'Interactions are all converted.');
                }
                else {
                  callback(null, 'No interactions to convert.');
                }
              }
            },
            function(err, results) {
              var contents,
                index,
                elementsBefore,
                elementsAfter,
                textElementsDescribingGroup,
                text;

              // Note: this calculates all the data for each group-node, except for its dimensions.
              // The dimenensions can only be calculated once all the rest of the elements have been
              // converted from GPML to JSON.
              var groupSelection, groupsSelection = gpmlPathwaySelection.find('Group');
              if (groupsSelection.length > 0) {
                var groups = [];
                gpmlPathwaySelection.find('Group').each(function() {
                  var groupSelection = $( this );
                  Group.toPvjson(pvjson, pvjson.elements, gpmlPathwaySelection, groupSelection, function(pvjsonElements) {
                    pvjson.elements = pvjson.elements.concat(pvjsonElements);
                  });
                });
              }

              /*
              pvjson.elements.filter(function(element) {
                return (element.type === 'undefined' || element.type === undefined) && element['gpml:element'] === 'gpml:Interaction';
              }).forEach(function(undefinedElement) {
                console.log('undefinedElement');
                console.log(undefinedElement);
              });
              //*/

              pvjson.elements.filter(function(element) {
                return element.type === 'PublicationXref';
              }).forEach(function(publicationXref) {
                delete publicationXref.deprecatedId;
              });
              
              pvjson.elements.sort(function(a, b) {
                return a.zIndex - b.zIndex;
              });

              callbackOutside(null, pvjson);
            });
          }
        ]);
      }
    }
  },

  // Corrects some errors in current Biopax embedded in GPML
  fixBiopax: function(gpmlPathwaySelection) {
    var xmlBiopaxSelection = gpmlPathwaySelection.find('Biopax');
    xmlBiopaxSelection.find('bp\\:PublicationXref').each(function() {
      var xmlPublicationXrefSelection = $( this );
      var publicationXrefId = xmlPublicationXrefSelection.attr('rdf:id');
      xmlPublicationXrefSelection.attr('rdf:id', null);
      xmlPublicationXrefSelection.attr('rdf:about', publicationXrefId);
      // still need to lowercaes Biopax element names, e.g., bp:ID and bp:DB to bp:id and bp:db
      // will do it with a simple string regex before passing it into the Biopax library
    });
    return gpmlPathwaySelection;
  },

  // Removes confusion of GroupId vs. GraphId by just using GraphId to identify containing elements
  addIsPartOfAttribute: function(gpmlPathwaySelection) {
    gpmlPathwaySelection.find('Group').each(function() {
      var groupSelection = $(this);
      var groupId = groupSelection.attr('GroupId');
      groupSelection.attr('GroupId', null);
      var graphId = groupSelection.attr('GraphId');
      var groupedElementsSelection = gpmlPathwaySelection.find('[GroupRef=' + groupId + ']').each(function(groupedElementSelection){
        groupedElementSelection = $( this );
        groupedElementSelection.attr('IsPartOf', graphId);
        groupedElementSelection.attr('GroupRef', null);
      });
    });
    return gpmlPathwaySelection;
  },

  selectByMultipleTagNames: function(args){
    var gpmlPathwaySelection = args.gpmlPathwaySelection;
    var elementTags = args.elementTags;
    var elementsSelection;
    var newElementsSelection;
    elementTags.forEach(function(elementTag){
      newElementsSelection = gpmlPathwaySelection.find(elementTag);
      if (!!newElementsSelection[0][0]) {
        if (!!elementsSelection) {
          elementsSelection[0] = elementsSelection[0].concat(newElementsSelection[0]);
        }
        else {
          elementsSelection = newElementsSelection;
        }
      }
    });
    return elementsSelection;
  },

  // Fills in implicit values
  makeExplicit: function(gpmlPathwaySelection) {
    var groupGroupSelection, groupNoneSelection, groupPathwaySelection, groupComplexSelection, cellularComponentValue,
      groupGraphicsSelection, groupGroupGraphicsSelection, groupNoneGraphicsSelection, groupPathwayGraphicsSelection, groupComplexGraphicsSelection,
      graphId, graphIdStub, graphIdStubs = [];

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
      graphicalElementsSelection.filter(function(){
        var graphicalElementSelection = $( this );
        return (!!graphicalElementSelection.attr('GraphId'));
      }).each(function(){
        var filteredResult = $( this );
        graphId = filteredResult.attr('GraphId');
        if (graphId.slice(0,2) === 'id') {
          graphIdStub = graphId.slice(2, graphId.length);
          graphIdStubs.push(graphIdStub);
        }
      });
      graphIdStubs.sort(function(a,b){
        return parseInt(a, 32) - parseInt(b, 32);
      });
      var largestGraphIdStub = graphIdStubs[graphIdStubs.length - 1] || 0;

      // Add a GraphId to every element missing a GraphId by converting the largest graphIdStub to int, incrementing,
      // converting back to base32 and appending it to the string 'id'.
      graphicalElementsSelection.filter(function(){
        var graphicalElementSelection = $( this );
        return (!graphicalElementSelection.attr('GraphId'));
      }).each(function(){
        var filteredResult = $( this );
        largestGraphIdStub = (parseInt(largestGraphIdStub, 32) + 1).toString(32);
        filteredResult.attr('GraphId', 'id' + largestGraphIdStub);
      });

      var groupsSelection = gpmlPathwaySelection.find('Group');
      groupsSelection.each(function(){
        var groupSelection = $( this );
        var groupGraphicsSelection = groupSelection.append('<Graphics Align="Center" Valign="Middle" FontWeight="Bold" LineThickness="1" FillOpacity="0.1"></Graphics>');
        /*
        groupGraphicsSelection.attr('Align', 'Center')
        .attr('Valign', 'Middle')
        .attr('FontWeight', 'Bold')
        .attr('LineThickness', 1)
        .attr('FillOpacity', 0.1);
        //*/
      });
      var groupGroupsSelection = gpmlPathwaySelection.find('Group[Style=Group]').each(function(){
        var groupGroupSelection = $( this );
        var groupGroupGraphicsSelection = groupGroupSelection.find('Graphics')
        .attr('FontSize', '1')
        .attr('Padding', '8')
        .attr('ShapeType', 'None')
        .attr('LineStyle', 'Broken')
        .attr('Color', '808080')
        .attr('FillColor', 'Transparent');
      });
      var groupNonesSelection = gpmlPathwaySelection.find('Group[Style=None]').each(function(){
        var groupNoneSelection = $( this );
        var groupNoneGraphicsSelection = groupNoneSelection.find('Graphics')
        .attr('FontSize', '1')
        .attr('Padding', '8')
        .attr('ShapeType', 'Rectangle')
        .attr('LineStyle', 'Broken')
        .attr('Color', '808080')
        .attr('FillColor', 'B4B464');
      });

      if (groupsSelection.length > 0) {
        groupsSelection.filter(function(){
          var groupSelection = $( this );
          var graphicsSelection = groupSelection.find('Graphics');
          return (!graphicsSelection.attr('ShapeType'));
        }).each(function(){
          var groupNoneSelectionGraphicsSelection = $( this ).find('Graphics');

          groupNoneSelectionGraphicsSelection.attr('ShapeType', 'None')
          .attr('FontSize', '1')
          .attr('Padding', '8')
          .attr('ShapeType', 'Rectangle')
          .attr('LineStyle', 'Broken')
          .attr('Color', '808080')
          .attr('FillColor', 'B4B464');
          //*/
        });
      }

      var groupComplexesSelection = gpmlPathwaySelection.find('Group[Style=Complex]').each(function(){
        groupComplexSelection = $(this);
        groupComplexGraphicsSelection = groupComplexSelection.find('Graphics')
        .attr('FontSize', '1')
        .attr('Padding', '11')
        .attr('ShapeType', 'Complex')
        .attr('Color', '808080')
        .attr('FillColor', 'B4B464')
        .attr('LineStyle', 'Solid');
      });
      var groupPathwaysSelection = gpmlPathwaySelection.find('Group[Style=Pathway]').each(function(){
        groupPathwaySelection = $(this);
        groupPathwayGraphicsSelection = groupPathwaySelection.find('Graphics')
        .attr('FontSize', '1')
        //.attr('FontSize', '32')
        .attr('Padding', '8')
        .attr('ShapeType', 'Rectangle')
        .attr('LineStyle', 'Broken')
        .attr('Color', '808080')
        .attr('FillColor', '00FF00');
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
          labelsSelection.filter(function(){
            var labelSelection = $( this );
            var graphicsSelection = labelSelection.find('Graphics');
            return (!graphicsSelection.attr('ShapeType'));
          }).each(function(){
            var graphicsSelection = $( this ).find('Graphics');
            graphicsSelection.attr('ShapeType', 'None');
          });
          labelsSelection.filter(function(){
            var graphicsSelection = $( this ).find('Graphics');
            return (!graphicsSelection.attr('FillColor'));
          }).each(function(){
            var graphicsSelection = $( this ).find('Graphics');
            graphicsSelection.attr('FillColor', 'Transparent');
          });
        }

        var statesSelection = gpmlPathwaySelection.find('State');
        if (statesSelection.length > 0) {
          statesSelection.filter(function(){
            var graphicsSelection = $( this ).find('Graphics');
            return (!graphicsSelection.attr('FillColor'));
          }).each(function(){
            var graphicsSelection = $( this ).find('Graphics');
            graphicsSelection.attr('FillColor', 'ffffff');
          });

          statesSelection.filter(function(){
            var graphicsSelection = $( this ).find('Graphics');
            return (!graphicsSelection.attr('FontSize'));
          }).each(function(){
            var graphicsSelection = $( this ).find('Graphics');
            graphicsSelection.attr('FontSize', 10);
          });

          statesSelection.filter(function(){
            var graphicsSelection = $( this ).find('Graphics');
            return (!graphicsSelection.attr('Valign'));
          }).each(function(){
            var graphicsSelection = $( this ).find('Graphics');
            graphicsSelection.attr('Valign', 'Middle');
          });
        }

        var shapesSelection = gpmlPathwaySelection.find('Shape');
        if (shapesSelection.length > 0) {
          shapesSelection.filter(function(){
            var graphicsSelection = $( this ).find('Graphics');
            return (!graphicsSelection.attr('FillColor'));
          }).each(function(){
            var graphicsSelection = $( this ).find('Graphics');
            graphicsSelection.attr('FillColor', 'Transparent');
          });

          shapesSelection.filter(function(){
            var graphicsSelection = $( this ).find('Graphics');
            return (graphicsSelection.attr('Rotation') === '0.0');
          }).each(function(){
            var graphicsSelection = $( this ).find('Graphics');
            graphicsSelection.attr('Rotation', null);
          });

          var cellularComponentsSelection = shapesSelection.find('[Key="org.pathvisio.CellularComponentProperty"]').each(function(){
            var cellularComponentSelection = $(this);
            cellularComponentValue = cellularComponentSelection.attr('Value');
            cellularComponentSelection.parent().attr('CellularComponent', cellularComponentValue);
          });
        }

        // "Ellipse" is the word that other graphics libraries seem to have standardized on.
        nodesSelection.filter(function(){
          var graphicsSelection = $( this ).find('Graphics');
          return (graphicsSelection.attr('ShapeType') === 'Oval');
        }).each(function(){
          var graphicsSelection = $( this ).find('Graphics');
          graphicsSelection.attr('ShapeType', 'Ellipse');
        });

        nodesSelection.filter(function(){
          var graphicsSelection = $( this ).find('Graphics');
          return (!graphicsSelection.attr('Padding'));
        }).each(function(){
          var graphicsSelection = $( this ).find('Graphics');
          graphicsSelection.attr('Padding', '0.5em');
        });

        nodesSelection.filter(function(){
          var graphicsSelection = $( this ).find('Graphics');
          return (!graphicsSelection.attr('ShapeType'));
        }).each(function(){
          var graphicsSelection = $( this ).find('Graphics');
          graphicsSelection.attr('ShapeType', 'Rectangle');
        });

        nodesSelection.filter(function(){
          var graphicsSelection = $( this ).find('Graphics');
          return (!graphicsSelection.attr('Color'));
        }).each(function(){
          var graphicsSelection = $( this ).find('Graphics');
          graphicsSelection.attr('Color', '000000');
        });

        nodesSelection.filter(function(){
          var graphicsSelection = $( this ).find('Graphics');
          return (!graphicsSelection.attr('LineThickness'));
        }).each(function(){
          var graphicsSelection = $( this ).find('Graphics');
          graphicsSelection.attr('LineThickness', 1);
        });

        nodesSelection.filter(function(){
          var graphicsSelection = $( this ).find('Graphics');
          return (!graphicsSelection.attr('ZOrder'));
        }).each(function(){
          var graphicsSelection = $( this ).find('Graphics');
          graphicsSelection.attr('ZOrder', 0);
        });

        nodesSelection.filter(function(){
          var graphicsSelection = $( this ).find('Graphics');
          return (!graphicsSelection.attr('Align'));
        }).each(function(){
          var graphicsSelection = $( this ).find('Graphics');
          graphicsSelection.attr('Align', 'Center');
        });

        nodesSelection.filter(function(){
          var graphicsSelection = $( this ).find('Graphics');
          return (!graphicsSelection.attr('Valign'));
        }).each(function(){
          var graphicsSelection = $( this ).find('Graphics');
          graphicsSelection.attr('Valign', 'Top');
        });

        // some shapes have GPML values that do not match what is visually displayed in PathVisio-Java.
        // Below we correct the GPML so that the display in pathvisiojs will match the display in PathVisio-Java.
        var gpmlWidth, correctedGpmlWidth, gpmlHeight, gpmlCenterX, gpmlCenterY, xScaleFactor;
        var triangleSelection,
          triangleXCorrectionFactor = 0.311,
          triangleYCorrectionFactor = 0.07,
          triangleWidthCorrectionFactor = 0.938,
          triangleHeightCorrectionFactor = 0.868;
        var trianglesSelection = shapesSelection.find('[ShapeType="Triangle"]');
        trianglesSelection.each(function(){
          triangleSelection = $(this);

          // TODO check whether this should be .attr or .find('graphics').attr
          gpmlCenterX = parseFloat(triangleSelection.attr('CenterX'));
          gpmlCenterY = parseFloat(triangleSelection.attr('CenterY'));
          gpmlWidth = parseFloat(triangleSelection.attr('Width'));
          gpmlHeight = parseFloat(triangleSelection.attr('Height'));

          var correctedWidth = gpmlWidth * triangleWidthCorrectionFactor;
          var uncorrectedX = gpmlCenterX - gpmlWidth/2;

          var uncorrectedY = gpmlCenterY - gpmlHeight/2;
          var correctedHeight = gpmlHeight * triangleHeightCorrectionFactor;

          var gpmlRotation = triangleSelection.attr('Rotation') || 0;
          // Remember that GPML saves rotation in radians, even though PathVisio-Java displays rotation in degrees.
          // This conversion changes the rotation to reflect the angle between the green rotation control dot in PathVisio-Java and the X-axis.
          var angleToControlPoint = 2 * Math.PI - gpmlRotation;
          var triangleXCorrectionAccountingForRotation = triangleXCorrectionFactor * Math.cos(angleToControlPoint) * gpmlWidth + triangleYCorrectionFactor * Math.sin(angleToControlPoint) * gpmlHeight;

          var distanceTriangleTipExtendsBeyondBBox = ((gpmlCenterX + triangleXCorrectionFactor * gpmlWidth - gpmlWidth/2) + correctedWidth) - (gpmlCenterX + gpmlWidth/2);
          var triangleYCorrection = (-1) * distanceTriangleTipExtendsBeyondBBox * Math.sin(angleToControlPoint) + triangleYCorrectionFactor * Math.cos(angleToControlPoint) * gpmlHeight;

          var correctedX = uncorrectedX + triangleXCorrectionAccountingForRotation;
          var correctedY = uncorrectedY + triangleYCorrection;

          triangleSelection.attr('CenterX', correctedX + correctedWidth / 2)
          .attr('CenterY', correctedY + correctedHeight / 2)
          .attr('Height', correctedHeight)
          .attr('Width', correctedWidth);
        });
        var arcSelection;
        var arcsSelection = shapesSelection.find('[ShapeType="Arc"]').each(function(){
          arcSelection = $( this );

          var gpmlHeight = parseFloat(arcSelection.attr('Height'));
          var gpmlWidth = parseFloat(arcSelection.attr('Width'));
          var correctedHeight = gpmlHeight / 2;

          // TODO refactor this code to be DRY (repeated above)
          var gpmlRotation = arcSelection.attr('Rotation') || 0;
          // Remember that GPML saves rotation in radians, even though PathVisio-Java displays rotation in degrees.
          // This conversion changes the rotation to reflect the angle between the green rotation control dot in PathVisio-Java and the X-axis.
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
        var pentagonSelection,
          pentagonXScaleFactor = 0.904,
          pentagonYScaleFactor = 0.95;
        var pentagonsSelection = shapesSelection.find('[ShapeType="Pentagon"]').each(function(){
          pentagonSelection = $(this);
          gpmlWidth = parseFloat(pentagonSelection.attr('Width'));
          gpmlHeight = parseFloat(pentagonSelection.attr('Height'));
          gpmlCenterX = parseFloat(pentagonSelection.attr('CenterX'));
          pentagonSelection.attr('CenterX', gpmlCenterX + gpmlWidth * (1 - pentagonXScaleFactor) / 2)
          .attr('Width', gpmlWidth * pentagonXScaleFactor)
          .attr('Height', gpmlHeight * pentagonYScaleFactor);
        });
        var hexagonSelection,
          hexagonYScaleFactor = 0.88;
        var hexagonsSelection = shapesSelection.find('[ShapeType="Hexagon"]').each(function(){
          hexagonSelection = $(this);
          gpmlHeight = parseFloat(hexagonSelection.attr('Height'));
          hexagonSelection.attr('Height', gpmlHeight * hexagonYScaleFactor);
        });

        var dataNodeSelection, dataNodeType;
        var dataNodesSelection = gpmlPathwaySelection.find('DataNode');
        if (dataNodesSelection.length > 0) {
          /*
          dataNodesSelection.each(function(){
            dataNodeSelection = d3.select(this);
            dataNodeType = dataNodeSelection.attr('Type');
            dataNodeSelection.attr('BiologicalType', dataNodeType)
            .attr('Type', null);
          });
          //*/

          dataNodesSelection.filter(function(){
            return (!$(this).find('Graphics').attr('FillColor'));
          }).each(function(){
            $(this).find('Graphics').attr('FillColor', 'ffffff');
          });
        }

      }

      // This applies to both nodes and edges
      var doubleLinesSelection = gpmlPathwaySelection.find('[Key="org.pathvisio.DoubleLineProperty"]').each(function(){
        $( this ).parent().find('Graphics').attr('LineStyle', 'Double');
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
        edgesSelection.each(function(){
          $(this).find('Graphics').attr('FillColor', 'Transparent');
        });
        edgesSelection.filter(function(){
          var graphicsSelection = $(this).find('Graphics');
          return (!graphicsSelection.attr('ConnectorType'));
        }).each(function(d, i){
          $(this).find('Graphics').attr('ConnectorType', 'Straight');
        });
        edgesSelection.filter(function(){
          return (!$(this).find('Graphics').attr('Color'));
        }).each(function(d, i){
          $(this).find('Graphics').attr('Color', '000000');
        });

        var anchorsSelection = gpmlPathwaySelection.find('Anchor');
        if (anchorsSelection.length > 0) {
          anchorsSelection.each(function(){
            var anchorSelection = $(this);
            var parentGraphicsSelection = anchorSelection.parent();
            var shapeTypeValue = anchorSelection.attr('Shape') || 'None';
            var positionValue = anchorSelection.attr('Position');

            var graphics = anchorSelection.append('<Graphics Position="' + positionValue + '" ShapeType="' + shapeTypeValue + '" LineThickness="' + 0 + '" FillColor="' + parentGraphicsSelection.attr('Color') + '"></Graphics>');
            anchorSelection.attr('Position', null);
            anchorSelection.attr('Shape', null);
            // In a future version of GPML, we could improve rendering speed if we included the cached X and Y values for Anchors, just like we currently do for Points.
          });
          anchorsSelection.filter(function(){
            var graphicsSelection = $(this).find('Graphics');
            var result = false;
            if (graphicsSelection.length > 0) {
              result = graphicsSelection.attr('ShapeType') === 'Circle';
            }
            return result;
          }).each(function(d, i){
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('ShapeType', 'Ellipse');
            graphicsSelection.attr('Width', 8);
            graphicsSelection.attr('Height', 8);
          });
          anchorsSelection.filter(function(){
            var graphicsSelection = $(this).find('Graphics');
            var result = false;
            if (graphicsSelection.length > 0) {
              result = graphicsSelection.attr('ShapeType') === 'None';
            }
            return result;
          }).each(function(d, i){
            var graphicsSelection = $(this).find('Graphics');
            graphicsSelection.attr('Width', 4);
            graphicsSelection.attr('Height', 4);
          });
        }
      }
    }

    return gpmlPathwaySelection;
  },


  toBiopaxjson: function(gpmlPathwaySelection, pathwayMetadata, callback){
    this.toPvjson(gpmlPathwaySelection, pathwayMetadata, function(err, pvjson) {
      var biopaxjson = {};
      biopaxjson['@context'] = pvjson['@context'];
      biopaxjson['@graph'] = [];


      var pathway = {};
      pathway.id = pvjson.id;
      pathway.idVersion = pvjson.idVersion;
      pathway.type = pvjson.type;
      if (!!pvjson.xrefs) {
        pathway.xrefs = pvjson.xrefs;
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
  }
};
