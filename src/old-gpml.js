
  Gpml2Json.toPvjson = function(gpmlPathwaySelection, pathwayMetadata, callbackOutside){
    var xmlns = gpmlPathwaySelection.attr('xmlns');
    gpmlPathwaySelection = this.fixBiopax(this.addIsPartOfAttribute(this.makeExplicit(gpmlPathwaySelection)));
    var pvjson = {};

    var pathwayIri = 'http://identifiers.org/wikipathways/' + pathwayMetadata.dbId;

    var globalContext = [];
    // TODO update this to remove test2.
    //globalContext.push('http://test2.wikipathways.org/v2/contexts/pathway.jsonld');
    globalContext.push('http://test2.wikipathways.org/v2/contexts/biopax.jsonld');
    globalContext.push('http://test2.wikipathways.org/v2/contexts/organism.jsonld');
    globalContext.push('http://test2.wikipathways.org/v2/contexts/cellular-location.jsonld');
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
    var rawGpmlAsString = gpmlPathwaySelection.html();
    var rawGpmlAsPrettyString = pd.xml(rawGpmlAsString);
    //console.log('rawGpmlAsPrettyString');
    //console.log(rawGpmlAsPrettyString);
    var updatedGpmlAsString = gpmlPathwaySelection.html();
    var processedGpmlAsPrettyString = pd.xml(updatedGpmlAsString);
    console.log('*******************************************************************************************************');
    console.log('*******************************************************************************************************');
    console.log('processedGpmlAsPrettyString');
    console.log('*******************************************************************************************************');
    console.log('*******************************************************************************************************');
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
            var xmlBiopaxSelection = gpmlPathwaySelection.find('Biopax').eq(0);
            if (!!xmlBiopaxSelection && xmlBiopaxSelection.length > 0) {
              // TODO check whether this will always be completed by the time it is needed
              // look at http://www.biopax.org/owldoc/Level3/ for correct terms
              // TODO look at whether ontology terms or other items need to be updated
              var biopaxStringUnedited;
              // TODO don't repeat this environment detection. another version is already defined at the bottom of this file.
              if (isBrowser) { // isBrowser
                var serializer = new XMLSerializer();
                biopaxStringUnedited = serializer.serializeToString(xmlBiopaxSelection[0]);
              } else { // isNode
                biopaxStringUnedited = xmlBiopaxSelection.html();
              }

              var biopaxString = '<Biopax>' + biopaxStringUnedited.replace(/bp:ID/g, 'bp:id').replace(/bp:DB/g, 'bp:db').replace(/bp:TITLE/g, 'bp:title').replace(/bp:SOURCE/g, 'bp:source').replace(/bp:YEAR/g, 'bp:year').replace(/bp:AUTHORS/g, 'bp:author').replace(/rdf:id/g, 'rdf:ID') + '</Biopax>';
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
              var groupSelection, groupCollectionSelection = gpmlPathwaySelection.find('Group');
              if (groupCollectionSelection.length > 0) {
                var groups = [];
                groupCollectionSelection.each(function() {
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
  };

  // TODO will handle this in biopax2json
  // Corrects some errors in current Biopax embedded in GPML
  Gpml2Json.fixBiopax = function(gpmlPathwaySelection) {
    var xmlBiopaxSelection = gpmlPathwaySelection.find('Biopax');
    xmlBiopaxSelection.find('bp\\:PublicationXref').each(function() {
      var xmlPublicationXrefSelection = $( this );
      var publicationXrefId = xmlPublicationXrefSelection.attr('rdf:id');
      xmlPublicationXrefSelection.attr('rdf:id', null);
      xmlPublicationXrefSelection.attr('rdf:about', publicationXrefId);
      // still need to lowercase Biopax element names, e.g., bp:ID and bp:DB to bp:id and bp:db
      // will do it with a simple string regex before passing it into the Biopax library
    });
    return gpmlPathwaySelection;
  };

  // TODO will handle this once everything is converted
  // Removes confusion of GroupId vs. GraphId by just using GraphId to identify containing elements
  Gpml2Json.addIsPartOfAttribute = function(gpmlPathwaySelection) {
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
  };

  // Fills in implicit values
  Gpml2Json.makeExplicit = function(gpmlPathwaySelection) {
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

            // TODO use one node vs. browser detection function throughout code!
            if (typeof(document) !== 'undefined' && !!document && !!document.createElementNS) {
              var graphicsElement = document.createElementNS('http://pathvisio.org/GPML/2013a', 'Graphics');
              graphicsElement.setAttribute('Position', positionValue);
              graphicsElement.setAttribute('ShapeType', shapeTypeValue);
              graphicsElement.setAttribute('LineThickness', 0);
              graphicsElement.setAttribute('FillColor', parentGraphicsSelection.attr('Color'));
              var anchorElement = anchorSelection[0];
              anchorElement.appendChild(graphicsElement);
            } else {
              anchorSelection.append('<Graphics Position="' + positionValue + '" ShapeType="' + shapeTypeValue + '" LineThickness="' + 0 + '" FillColor="' + parentGraphicsSelection.attr('Color') + '"></Graphics>');
            }

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
  };
