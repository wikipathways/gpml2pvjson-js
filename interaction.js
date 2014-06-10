var GpmlElement = require('./element.js')
  , Graphics = require('./graphics.js')
  , Point = require('./point.js')
  , strcase = require('tower-strcase')
  , Anchor = require('./anchor.js')
  ;

var markerNameToIdentifierMappings = {
  'arrow': ['Conversion', 'Production', 'Consumption'],
  't-bar': ['Inhibition'],
  'mim-gap': ['gpml:MimGap'],
  'mim-branching-right': ['gpml:MimBranchingRight'],
  'mim-branching-left': ['gpml:MimBranchingLeft'],
  'mim-inhibition':['Inhibition'],
  'mim-conversion':['Conversion'],
  'mim-necessary-stimulation':['Necessary stimulation'],
  'mim-binding':['Non-covalent binding'], // this is non-covalent binding in SBO
  'mim-stimulation':['Stimulation'],
  'mim-modification':['Addition of a chemical group'],
  'mim-catalysis':['Catalysis'],
  'mim-cleavage':['Cleavage'],
  'mim-covalent-bond':['Addition of a chemical group'], // this doesn't exactly match, but it seems the closest
  'mim-transcription-translation':['Transcription', 'Translation']
};

module.exports = {
  toPvjson: function(pvjson, gpmlSelection, interactionSelection, callback) {
    var jsonAnchorInteraction
      , anchor
      , jsonAnchor
      , points
      , jsonPoints
      , relationType
      , target
      , targetId
      , groupRef
      , source
      , sourceId
      , pvjsonElements
      , pvjsonPath = {}
      ;

    GpmlElement.toPvjson(pvjson, gpmlSelection, interactionSelection, pvjsonPath, function(pvjsonPath) {
      Graphics.toPvjson(pvjson, gpmlSelection, interactionSelection, pvjsonPath, function(pvjsonPath) {
        Point.toPvjson(pvjson, gpmlSelection, interactionSelection, pvjsonPath, function(pvjsonPath) {
          Anchor.toPvjson(pvjson, gpmlSelection, interactionSelection, pvjsonPath, function(pvjsonAnchor) {
            var startNode, endNode, marker;
            if (!!pvjsonPath.markerStart) {
              marker = pvjsonPath.markerStart;
              startNode = pvjsonPath.points[pvjsonPath.points.length - 1].references;
              endNode = pvjsonPath.points[0].references;
            } else if (!!pvjsonPath.markerEnd) {
              marker = pvjsonPath.markerEnd;
              startNode = pvjsonPath.points[0].references;
              endNode = pvjsonPath.points[pvjsonPath.points.length - 1].references;
            }

            if (!!startNode && !!endNode) {
              pvjsonPath.relationGraph = [{
                id: startNode,
                relation: endNode
              }];
              //pvjsonPath.relationTypes = markerNameToIdentifierMappings[strcase.paramCase(marker)] || 'undefined';
              pvjsonPath.relationTypes = markerNameToIdentifierMappings[strcase.paramCase(marker)] || [strcase.classCase(marker)];
              pvjsonPath.type = pvjsonPath.type || [];
              pvjsonPath.type = pvjsonPath.type.concat(pvjsonPath.relationTypes);
            }

            pvjsonElements = [pvjsonPath].concat(pvjsonAnchor);
            callback(pvjsonElements);
          });
        });
      });
    });
  }
};
