import * as	GpmlUtilities from './gpml-utilities';
import * as Point from './point';
import * as Anchor from './anchor';

// TODO break these into separate exported items
export default {
  defaults: {
    attributes: {
      Color: {
        name: 'Color',
        value: '000000'
      },
      ConnectorType: {
        name: 'ConnectorType',
        value: 'Straight'
      },
      FillColor: {
        name: 'FillColor',
        value: 'Transparent'
      },
      LineThickness: {
        name: 'LineThickness',
        value: 1
      }
    }
  },
  applyDefaults: function(gpmlElement, defaults) {
    gpmlElement = GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
    return gpmlElement;
  },
  // TODO this isn't getting the linetype info for determining whether activity is direct or indirect yet
  gpmlArrowHeadToSemanticMappings: {
    'Arrow':'Arrow'
  },
  toPvjson: function(pvjs, gpmlSelection, graphicalLineSelection, callback) {
    var jsonAnchorGraphicalLine,
      anchor,
      jsonAnchor,
      points,
      jsonPoints,
      graphicalLineType,
      target,
      targetId,
      groupRef,
      source,
      sourceId,
      pvjsonElements,
      pvjsonPath = {};

    /*
    GpmlElement.toPvjson(pvjs, gpmlSelection, graphicalLineSelection, pvjsonPath, function(pvjsonPath) {
      Graphics.toPvjson(pvjs, gpmlSelection, graphicalLineSelection, pvjsonPath, function(pvjsonPath) {
        Point.toPvjson(pvjs, gpmlSelection, graphicalLineSelection, pvjsonPath, function(pvjsonPath) {
          Anchor.toPvjson(pvjs, gpmlSelection, graphicalLineSelection, pvjsonPath, function(pvjsonAnchor) {
            pvjsonElements = [pvjsonPath].concat(pvjsonAnchor);
            callback(pvjsonElements);
          });
        });
      });
    });
    //*/
  }
};
