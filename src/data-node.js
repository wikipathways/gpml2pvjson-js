'use strict';

var Graphics = require('./graphics.js')
  , fs = require('fs')
  , GpmlUtilities = require('./gpml-utilities.js')
  , BridgeDb = require('bridgedbjs')
  ;

//var BridgeDbDataSources = JSON.parse(fs.readFileSync('../data-sources.json'));

module.exports = {
  defaults: {
    attributes: {
    },
    Graphics: {
      attributes: {
        Align: {
          name: 'Align',
          value: 'Center'
        },
        Color: {
          name: 'Color',
          value: '000000'
        },
        FontSize: {
          name:'FontSize',
          value:10
        },
        LineThickness: {
          name: 'LineThickness',
          value: 1
        },
        Padding: {
          name: 'Padding',
          value: '0.5em'
        },
        ShapeType: {
          name: 'ShapeType',
          value: 'Rectangle'
        },
        Valign: {
          name: 'Valign',
          value: 'Top'
        },
        ZOrder: {
          name: 'ZOrder',
          value: 0
        },
      }
    }
  },

  applyDefaults: function(gpmlElement, defaults) {
    gpmlElement = GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
    return gpmlElement;
  },
  toPvjsonOld: function(pathway, gpmlSelection, dataNodeSelection, callbackInside) {
    var generateEntityReference = this.generateEntityReference
      , organism = pathway.organism
      , pvjsonElements
      , entity = {}
      , gpmlDataNodeType = dataNodeSelection.attr('Type')
      ;

    if (!gpmlDataNodeType) {
      gpmlDataNodeType = 'Unknown';
    }

    // this is a Biopax class, like Protein or SmallMolecule
    var entityType = this.gpmlToBiopaxMappings[gpmlDataNodeType];
    if (!!entityType) {
      entity.type = entityType;
    }

    //GpmlElement.toPvjson(pathway, gpmlSelection, dataNodeSelection, entity, function(entity) {
      Graphics.toPvjson(pathway, gpmlSelection, dataNodeSelection, entity, function(entity) {
        var entityReferences = [entity.id]
          , dataSourceName
          , dbId
          , userSpecifiedXref
          , xrefSelection = dataNodeSelection.find('Xref').eq(0)
          ;
        if (xrefSelection.length > 0) {
          dataSourceName = xrefSelection.attr('Database');
          dbId = xrefSelection.attr('ID');
          if (!!dataSourceName && !!dbId) {
            generateEntityReference(entity.textContent, dataSourceName, dbId, organism, entityType, function(err, entityReference) {
              if (!!entityReference) {
                var entityReferenceId = entityReference.id;
                entity.entityReference = entityReferenceId;

                var entityReferenceExists = pathway.elements.filter(function(entity) {
                  return entity.id === entityReferenceId;
                }).length > 0;

                // TODO how should be best handle sub-pathway instances in a pathway?
                if (entityType === 'Pathway' || !!entityReferenceExists) {
                  if (entityType === 'Pathway') {
                    entity.organism = organism;
                  } 
                  pvjsonElements = [entity];
                } else {
                  pvjsonElements = [entity, entityReference];
                }
                callbackInside(pvjsonElements);
              } else {
                pvjsonElements = [entity];
                callbackInside(pvjsonElements);
              }
            });
          } else {
            // this would indicate incorrect GPML
            pvjsonElements = [entity];
            console.warn('GPML Xref missing DataSource and/or ID');
            callbackInside(pvjsonElements);
          }
        } else {
          pvjsonElements = [entity];
          callbackInside(pvjsonElements);
        }
      });
    //});
  }
};
