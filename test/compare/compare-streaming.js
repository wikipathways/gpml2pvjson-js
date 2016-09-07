var _ = require('lodash');
var strcase = require('tower-strcase');
var diff = require('deep-diff').diff;
var pd = require('pretty-data').pd;
var fs = require('graceful-fs');
var JSONStream = require('JSONStream');
var EventEmitter = require('events').EventEmitter;
var request = require('request');
var highland = require('highland');
var path = require('path');
var Gpml2PvjsonConverter = require('../index.js');
var url = require('url');
var pathwayMetadataList = require('./pathways-to-test.json');
var pathwaysCompleted;
var pathwaysCompletedFilePath = './pathways-completed.json';
var pathwayRetryCounts = {};
var httpRetryLimit = 2;
var httpRetryDelay = 3000;

function findBestMatchCorrespondingNewPvjsonElement(
    oldPvjsonElement, correspondingNewPvjsonElements) {
  if (correspondingNewPvjsonElements.length === 1) {
    return correspondingNewPvjsonElements[0];
  }

  console.log('Multiple correspondingNewPvjsonElements');
  console.log('oldPvjsonElement with multiple matches in correspondingNewPvjsonElements:');
  console.log(oldPvjsonElement);
  console.log('All matches from correspondingNewPvjsonElements');
  console.log(correspondingNewPvjsonElements);

  if (typeof oldPvjsonElement.x !== 'undefined') {
    var oldPvjsonElementX = oldPvjsonElement.x;
    var oldPvjsonElementY = oldPvjsonElement.y;
    var oldPvjsonElementWidth = oldPvjsonElement.width;
    var oldPvjsonElementHeight = oldPvjsonElement.height;

    return _.sortBy(correspondingNewPvjsonElements, function(correspondingNewPvjsonElement) {
      var correspondingNewPvjsonElementX = correspondingNewPvjsonElement.x;
      var correspondingNewPvjsonElementY = correspondingNewPvjsonElement.y;
      var correspondingNewPvjsonElementWidth = correspondingNewPvjsonElement.width;
      var correspondingNewPvjsonElementHeight = correspondingNewPvjsonElement.height;

      return Math.abs(oldPvjsonElementX - correspondingNewPvjsonElementX) + Math.abs(oldPvjsonElementY - correspondingNewPvjsonElementY) + Math.abs(oldPvjsonElementWidth - correspondingNewPvjsonElementWidth) + Math.abs(oldPvjsonElementHeight - correspondingNewPvjsonElementHeight);
    })[0];
  } else if (!!oldPvjsonElement.points) {
    var firstOldPointX = oldPvjsonElement.points[0].x;
    var firstOldPointY = oldPvjsonElement.points[0].y;
    var oldPvjsonElementPointCount = oldPvjsonElement.points.length;
    var lastOldPointX = oldPvjsonElement.points[oldPvjsonElementPointCount - 1].x;
    var lastOldPointY = oldPvjsonElement.points[oldPvjsonElementPointCount - 1].y;

    return _.sortBy(correspondingNewPvjsonElements, function(correspondingNewPvjsonElement) {
      var firstCorrespondingNewPointX = correspondingNewPvjsonElement.points[0].x;
      var firstCorrespondingNewPointY = correspondingNewPvjsonElement.points[0].y;
      var correspondingNewPvjsonElementPointCount = correspondingNewPvjsonElement.points.length;
      var lastCorrespondingNewPointX = correspondingNewPvjsonElement.points[correspondingNewPvjsonElementPointCount - 1].x;
      var lastCorrespondingNewPointY = correspondingNewPvjsonElement.points[correspondingNewPvjsonElementPointCount - 1].y;

      return Math.abs(firstOldPointX - firstCorrespondingNewPointX) + Math.abs(firstOldPointY - firstCorrespondingNewPointY) + Math.abs(lastOldPointX - lastCorrespondingNewPointX) + Math.abs(lastOldPointY - lastCorrespondingNewPointY);
    })[0];
  } else {
    return correspondingNewPvjsonElements[0];
  }
}

function findCorrespondingNewPvjsonElementMatchingCurrentOldPvjsonElement(pvjson, oldPvjsonElement) {
  // find correspondingNewPvjsonElement(s) that is/are an exact match for current oldPvjsonElement
  var correspondingNewPvjsonElements = _.where(pvjson.elements, {'id': oldPvjsonElement.id});
  var correspondingNewPvjsonElement;

  if (_.isEmpty(correspondingNewPvjsonElements)) {
    if (oldPvjsonElement['gpml:element'] === 'gpml:Group') {
      //console.log('Matching based on contains count, x, y and width');
      if (oldPvjsonElement['gpml:Style'] === 'gpml:Group' || oldPvjsonElement['gpml:Style'] === 'gpml:None') {
        oldPvjsonElement.type = 'PhysicalEntity';
      }
      var oldPvjsonElementContainsCount = oldPvjsonElement.contains.length;
      correspondingNewPvjsonElements = pvjson.elements.filter(function(element) {
        return !!element.contains && element.contains.length === oldPvjsonElementContainsCount && element.type === oldPvjsonElement.type && ((!!element.width && element.width * 0.9 < oldPvjsonElement.width && element.width * 1.1 > oldPvjsonElement.width) || (!!element.height && element.height * 0.9 < oldPvjsonElement.height && element.height * 1.1 > oldPvjsonElement.height)) && ((element.x - 10 < oldPvjsonElement.x && element.x + 10 > oldPvjsonElement.x) || (element.y - 10 < oldPvjsonElement.y && element.y + 10 > oldPvjsonElement.y));
      });

      if (correspondingNewPvjsonElements.length !== 1) {
        var oldGroupContainedElements = oldPvjsonElement.contains;
        var oldGroupContainedElementIds = oldGroupContainedElements.map(function(containedElement) {
          return containedElement.id;
        });
        var oldGroupContainedElementCount = oldGroupContainedElements.length;

        correspondingNewPvjsonElements = pvjson.elements.filter(function(element) {
          return !!element.contains;
        })
        .filter(function(correspondingNewGroup) {
          return correspondingNewGroup.contains.length === oldGroupContainedElementCount;
        });

        if (correspondingNewPvjsonElements.length > 1) {
          var correspondingNewPvjsonElementsBasedOnContainedElementIds = correspondingNewPvjsonElements.filter(function(correspondingNewGroup) {
            var correspondingNewGroupContainedElementIds = correspondingNewGroup.contains.map(function(containedElement) {
              return containedElement.id;
            });
            return _.intersection(oldGroupContainedElementIds, correspondingNewGroupContainedElementIds).length === oldGroupContainedElementCount;
          });
          correspondingNewPvjsonElements = !_.isEmpty(correspondingNewPvjsonElementsBasedOnContainedElementIds) ? correspondingNewPvjsonElementsBasedOnContainedElementIds : correspondingNewPvjsonElements;
        }
      }
    } else if (!!oldPvjsonElement.points) {
      correspondingNewPvjsonElements = pvjson.elements.filter(function(element) {
        return element['gpml:element'] === oldPvjsonElement['gpml:element'] &&
        element.points.length === oldPvjsonElement.points.length &&
        element.shape === oldPvjsonElement.shape &&
        (element.points[0].x - 1 < oldPvjsonElement.points[0].x && element.points[0].x + 1 > oldPvjsonElement.points[0].x) &&
        (element.points[0].y - 1 < oldPvjsonElement.points[0].y && element.points[0].y + 1 > oldPvjsonElement.points[0].y) &&
        (element.points[element.points.length - 1].x - 1 < oldPvjsonElement.points[element.points.length - 1].x && element.points[element.points.length - 1].x + 1 > oldPvjsonElement.points[element.points.length - 1].x) &&
        (element.points[element.points.length - 1].y - 1 < oldPvjsonElement.points[element.points.length - 1].y && element.points[element.points.length - 1].y + 1 > oldPvjsonElement.points[element.points.length - 1].y);
      });

    } else if (typeof oldPvjsonElement.height !== 'undefined' && oldPvjsonElement.height !== null) {
      correspondingNewPvjsonElements = pvjson.elements.filter(function(element) {
        return element['gpml:element'] === oldPvjsonElement['gpml:element'] && (!!element.width && element.width * 0.9 < oldPvjsonElement.width && element.width * 1.1 > oldPvjsonElement.width) && (!!element.height && element.height * 0.9 < oldPvjsonElement.height && element.height * 1.1 > oldPvjsonElement.height) && (element.x - 1 < oldPvjsonElement.x && element.x + 1 > oldPvjsonElement.x) && (element.y - 1 < oldPvjsonElement.y && element.y + 1 > oldPvjsonElement.y);
      });
    }


    if (_.isEmpty(correspondingNewPvjsonElements)) {
      // find correspondingNewPvjsonElement(s) based on everything except id
      var oldPvjsonElementClone = _.cloneDeep(oldPvjsonElement);
      delete oldPvjsonElementClone.id;
      correspondingNewPvjsonElements = _.where(pvjson.elements, oldPvjsonElementClone);
    }
  }

  if (correspondingNewPvjsonElements.length === 0) {
    console.log('correspondingNewPvjsonElements718');
    console.log(correspondingNewPvjsonElements);
    return null;
  }

  correspondingNewPvjsonElement = findBestMatchCorrespondingNewPvjsonElement(oldPvjsonElement, correspondingNewPvjsonElements);

  if (!correspondingNewPvjsonElement) {
    console.log('correspondingNewPvjsonElements719');
    console.log(correspondingNewPvjsonElements);
  }
  return correspondingNewPvjsonElement;
}

var checkForHttpErrors = function(args) {
  var error = args.error
    , response = args.response
    , body = args.body
    , pathway = args.pathway
    , stream = args.stream
    , source = args.source
    ;

  // request doesn't throw an error for responses like 404, 500, etc.,
  // but we want to treat them like errors.
  if (!!response && !!response.statusCode) {
    var statusCode = response.statusCode;
    var statusCodeFirstCharacter = statusCode.toString()[0];
    if (statusCodeFirstCharacter === '4' || statusCodeFirstCharacter === '5') {
      error = error || new Error('HTTP status code ' + statusCode);
    }
  }

  console.log('Checking for errors: ' + source);
  // if there is no error
  if (!error) {
    return console.log('Success with ' + pathway['@id'] + ' from ' + source);
  }

  // if there is an error

  stream.pause();

  httpErrors.emit('error', args);

  console.log('Error getting ' + source);
  console.log(error);

  pathwayRetryCounts[source] = pathwayRetryCounts[source] || 0;
  pathwayRetryCounts[source] += 1;

  setTimeout(function() {
    stream.resume();
  }, httpRetryDelay);
};

var gpmlToBiopaxTypeMappings = {
  'gpml:GeneProduct': 'Dna'
  , 'gpml:Metabolite': 'SmallMolecule'
  , 'gpml:Protein': 'Protein'
  , 'gpml:Pathway': 'Pathway'
  , 'gpml:Unknown': 'PhysicalEntity'
  , 'gpml:Complex': 'Complex'
  , 'gpml:Rna': 'Rna'
  , 'gpml:GeneProdKegg enzymeuct': 'Protein'
  , 'gpml:SimplePhysicalEntity': 'PhysicalEntity'
  , 'gpml:Modifier': 'SmallMolecule'
};

console.log('\n \n \n \n \n \n \n \n \n \n \n \n \n \n \n \n \n \n \n \n \n \n \n \n');
console.log('S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S');
console.log('S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S');
console.log('Start of file');
console.log('S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S');
console.log('S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S');

var badSourceGpmlPathwaysIds = [
  'WP19' // empty
  , 'WP551'
  , 'WP187'
  , 'WP2767' // no elements present
  , 'WP274' // old GPML
  , 'WP1487'
  , 'WP68'
  , 'WP450'
  , 'WP190'
  , 'WP2085'
  , 'WP1491'
  , 'WP1967'
  , 'WP1963'
  , 'WP569'
  , 'WP285'
];

var httpErrors = new EventEmitter();
var httpErrorsStream = highland('error', httpErrors);

if (fs.existsSync(pathwaysCompletedFilePath)) {
   pathwaysCompleted = JSON.parse(fs.readFileSync(pathwaysCompletedFilePath, {encoding: 'utf8'}) || '[]');
} else {
  pathwaysCompleted = [];
}

var pathwayMetadataStream = highland(pathwayMetadataList)
.concat(httpErrorsStream.filter(function(args) {
  return pathwayRetryCounts[args.pathway.source] <= httpRetryLimit;
}))
.filter(function(pathway) {
  return pathwaysCompleted.indexOf('http://identifiers.org/wikipathways/' + pathway.id) === -1;
})
.filter(function(pathway) {
  return badSourceGpmlPathwaysIds.indexOf(pathway.id) === -1;
});

var newPathwayMetadataStream = highland([pathwayMetadataStream.fork()]);
var oldPathwayMetadataStream = highland([pathwayMetadataStream.fork()]);

var newPvjsonStream = newPathwayMetadataStream.parallel(4)
.pipe(highland.pipeline(function(s) {
  return s.map(function(pathway) {
    var dbId = pathway.id;
    var idVersion = pathway.idVersion || 0;

    var source = 'http://www.wikipathways.org/wpi/wpi.php?action=downloadFile&type=gpml&pwTitle=Pathway:' + dbId + '&oldid=' + idVersion;

    var newRequestStream = highland(
      request(source, function (error, response, body) {
        var args = {};
        response = response;
        args.error = error;
        args.body = body;
        args.pathway = pathway;
        args.source = source;
        args.stream = s;
        checkForHttpErrors(args);
      })
    )
    .map(function(gpmlChunk) {
      /*
      console.log('gpmlChunk');
      console.log(gpmlChunk.toString());
      //*/
      return gpmlChunk;
    })
    .errors(function (err, push) {
      // do nothing. this just filters out errors.
    })
    .pipe(highland.pipeline(
      Gpml2PvjsonConverter.streamGpmlToPvjson,
      function(s) {
        return s.map(function(data) {
          var pvjson = JSON.parse(data);

          var pathwayIri = !!dbId ? 'http://identifiers.org/wikipathways/' + dbId : source;
          pvjson.id = pathwayIri;
          pvjson.idVersion = idVersion;

          pvjson['@context'].filter(function(contextElement) {
            return contextElement.hasOwnProperty('@base');
          })
          .map(function(baseElement) {
            baseElement['@base'] = pathwayIri + '/';
          });

          var pvjsonString = JSON.stringify(pvjson, null, '  ');
          fs.writeFileSync('../test/output/' + dbId + '-' + idVersion + '.json', pvjsonString);
          return pvjsonString;
        });
      }
    ));

    /*
    newRequestStream.fork()
    .map(function(pvjsonString) {
      return pvjsonString;
    })
    //.pipe(process.stdout);
    .pipe(fs.createWriteStream('../test/output/' + dbId + '-' + idVersion + '.json'));
    //*/

    //return newRequestStream.fork();
    return newRequestStream;
  });
}));

var oldPvjsonStream = oldPathwayMetadataStream.parallel(4)
.pipe(highland.pipeline(function(s) {
  return s.map(function(pathway) {
    var source = 'http://test2.wikipathways.org/v2/pathways/' + pathway.id + '/.json';

    var oldRequestStream = highland(
      request({
        url: source
        , headers: {
          'Accept': 'application/json'
        }
      }, function (error, response, body) {
        var args = {};
        response = response;
        args.error = error;
        args.body = body;
        args.pathway = pathway;
        args.source = source;
        args.stream = s;
        checkForHttpErrors(args);
      })
    )
    .errors(function (err, push) {
      // do nothing. this just filters out errors.
    })
    .map(function(pvjsonBufferChunk) {
      return pvjsonBufferChunk.toString();
    })
    .reduce('', function(pvjsonAsString, pvjsonChunkAsString) {
      pvjsonAsString += pvjsonChunkAsString;
      return pvjsonAsString;
    })
    .map(function(pvjsonAsString) {
      return JSON.stringify(JSON.parse(pvjsonAsString), null, '  ');
    })
    .collect();

    return oldRequestStream;
  });
}));

oldPvjsonStream.zip(newPvjsonStream.fork())
.each(function(outerArgs) {
  highland(outerArgs).apply(function (oldStream, newStream) {
    oldStream.collect().zip(newStream)
    .each(function(innerArgs) {
      var oldPvjson = innerArgs[0][0][0];
      var oldPvjsonParsed = JSON.parse(oldPvjson);
      var newPvjson = innerArgs[1];
      var newPvjsonParsed = JSON.parse(newPvjson);
      var newPvjsonClone = _.cloneDeep(newPvjsonParsed);

      var bareOldPvjson = _.cloneDeep(oldPvjsonParsed);
      bareOldPvjson.elements = [];

      var bareNewPvjson = _.cloneDeep(newPvjsonParsed);
      bareNewPvjson.elements = [];

      var pvjsonDiffs = diff(bareOldPvjson, bareNewPvjson);

      pvjsonDiffs = _.reject(pvjsonDiffs, function(pvjsonDiff) {
        var needToBetterHandleBiopaxRefs = (pvjsonDiff.path.indexOf('xrefs') === 0 && !!pvjsonDiff.lhs && pvjsonDiff.lhs.indexOf('pubmed') > -1 && pvjsonDiff.kind === 'E');
        var oldPvjsonDidntHandleAllXrefs = (pvjsonDiff.path.indexOf('xrefs') === 0 && (pvjsonDiff.kind === 'A' || pvjsonDiff.kind === 'N' || oldPvjsonParsed.xrefs.length < newPvjsonParsed.xrefs.length));
        var usingPathwayReferenceInsteadOfPathway = (pvjsonDiff.lhs === 'Pathway' && pvjsonDiff.rhs === 'PathwayReference');
        var haveBackgroundColor = (pvjsonDiff.path.indexOf('backgroundColor') === 0 && pvjsonDiff.rhs === '#ffffff');
        var updatedDataSourceHandling = (pvjsonDiff.path.indexOf('dataSource') === 0);
        var updatedVersionHandling = (pvjsonDiff.path.indexOf('idVersion') === 0 && pvjsonDiff.kind === 'E');
        var updatedContext = (pvjsonDiff.path.indexOf('@context') === 0);
        return (needToBetterHandleBiopaxRefs || usingPathwayReferenceInsteadOfPathway || haveBackgroundColor || oldPvjsonDidntHandleAllXrefs || updatedDataSourceHandling || updatedVersionHandling || updatedContext);
      });

      if (!_.isEmpty(pvjsonDiffs)) {
        var errorHeader = '\n\n**********************************************************************************************************************************************************************\n';
        errorHeader += 'Error in: ' + newPvjsonClone.id + ' ' + newPvjsonClone.idVersion + '\n';
        errorHeader += '**********************************************************************************************************************************************************************\n';
        fs.appendFileSync('../test/output/differences-old-vs-new.jsonld', errorHeader);

        pvjsonDiffs.forEach(function(pvjsonDiff) {
          fs.appendFileSync('../test/output/differences-old-vs-new.jsonld', 'pvjsonDiff');
          fs.appendFileSync('../test/output/differences-old-vs-new.jsonld', JSON.stringify(pvjsonDiff, null, '  '));
        });

        fs.appendFileSync('../test/output/differences-old-vs-new.jsonld', 'oldPvjson without elements');
        fs.appendFileSync('../test/output/differences-old-vs-new.jsonld', JSON.stringify(bareOldPvjson, null, '  '));

        fs.appendFileSync('../test/output/differences-old-vs-new.jsonld', 'newPvjson without elements');
        fs.appendFileSync('../test/output/differences-old-vs-new.jsonld', JSON.stringify(bareNewPvjson, null, '  '));
      }

      var errorMessagesStream = highland([oldPvjson]).pipe(highland.pipeline(
        function (s) {
          return s.map(function(oldPvjson) {
            return oldPvjson.toString();
          });
        },
        JSONStream.parse('elements.*'),
        function (s) {
          return s.filter(function(oldPvjsonElement) {
            // Don't need to double-check any exact matches
            return _.where(newPvjsonClone.elements, oldPvjsonElement).length === 0;
          })
          .filter(function(oldPvjsonElement) {
            // oldPvjson was wrong
            return !oldPvjsonElement.id || oldPvjsonElement.id.indexOf('undefined') === -1;
          })
          .filter(function(oldPvjsonElement) {
            // oldPvjson was wrong
            return !oldPvjsonElement.id || oldPvjsonElement.id.indexOf('chebi') === -1;
          })
          .map(function(oldPvjsonElement) {
            var errorMessages = [];

            if (oldPvjsonElement.type === 'PublicationXref') {
              console.log('Still need to finish Biopax conversion for PublicationXrefs.');
              return;
              //return errorMessages.concat('Still need to finish Biopax conversion for PublicationXrefs.');
            }

            var correspondingNewPvjsonElement = findCorrespondingNewPvjsonElementMatchingCurrentOldPvjsonElement(newPvjsonClone, oldPvjsonElement);

            if (_.isEmpty(correspondingNewPvjsonElement) && (!oldPvjsonElement.id || oldPvjsonElement.id.indexOf('undefined') > -1)) {
              var matchForDuplicate = newPvjsonParsed.elements.filter(function(element) {
                return element.id === oldPvjsonElement.id;
              });
              if (!_.isEmpty(matchForDuplicate)) {
                // do nothing, because the oldPvjson incorrectly had duplicated data.
                return;
              } else {
                return errorMessages.concat([
                  'Could not find correspondingNewPvjsonElement for the following oldPvjsonElement:'
                  , oldPvjsonElement
                  , 'newPvjson'
                  , JSON.parse(newPvjson)
                  , 'E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E'
                  , '                                                              end of pvjson'
                  , 'E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E E'
                ]);
              }
            }

            _.pull(newPvjsonClone.elements, correspondingNewPvjsonElement);

            var elementDiffs = diff(oldPvjsonElement, correspondingNewPvjsonElement);
            elementDiffs.forEach(function(elementDiff) {
              if (!!elementDiff.path && (elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1 || elementDiff.path.indexOf('rotation') > -1) && elementDiff.kind === 'E' && (elementDiff.lhs - 3 < elementDiff.rhs) && (elementDiff.lhs + 3 > elementDiff.rhs)) {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E' && (elementDiff.lhs + oldPvjsonElement.borderWidth / 2 - 3 < elementDiff.rhs) && (elementDiff.lhs + oldPvjsonElement.borderWidth / 2 + 3 > elementDiff.rhs)) {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('zIndex') === 0) && elementDiff.kind === 'E' && (elementDiff.lhs - 0.001 < elementDiff.rhs) && (elementDiff.lhs + 0.001 > elementDiff.rhs)) {
                // do nothing
              } else if (!!elementDiff.path && !!oldPvjsonElement.contains && (elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E' && (elementDiff.lhs - 8 < elementDiff.rhs) && (elementDiff.lhs + 8 > elementDiff.rhs)) {
                // do nothing
              } else if (!!oldPvjsonElement.points && !!oldPvjsonElement.points[0] && !!oldPvjsonElement.points[0].anchor && oldPvjsonElement.points[0].anchor.length >= 2 && (oldPvjsonElement.points[0].anchor[0].toString().length > 4 || oldPvjsonElement.points[0].anchor[1].toString().length > 4)) {
                // do nothing
              } else if (!!oldPvjsonElement.points && !!oldPvjsonElement.points[oldPvjsonElement.points.length - 1] && !!oldPvjsonElement.points[oldPvjsonElement.points.length - 1].anchor && oldPvjsonElement.points[oldPvjsonElement.points.length - 1].anchor.length >= 2 && (oldPvjsonElement.points[oldPvjsonElement.points.length - 1].anchor[0].toString().length > 4 || oldPvjsonElement.points[oldPvjsonElement.points.length - 1].anchor[1].toString().length > 4)) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('points') === 0 && (oldPvjsonElement.shape === 'line-curved' || oldPvjsonElement.shape === 'line-elbow') && oldPvjsonElement.points.length < correspondingNewPvjsonElement.points.length) {
                // TODO check why oldPvjson has fewer points specified than does newPvjson.
                var firstPointDiffs = diff(oldPvjsonElement.points[0], correspondingNewPvjsonElement.points[0]);
                var lastPointDiffs = diff(oldPvjsonElement.points[1], correspondingNewPvjsonElement.points[correspondingNewPvjsonElement.points.length - 1]);
                var pointDiffs = firstPointDiffs.concat(lastPointDiffs);
                pointDiffs.forEach(function(pointDiff) {
                  if (!pointDiff) {
                    console.log('pointDiff');
                    console.log(pointDiff);
                    // do nothing
                  } else if (pointDiff.kind === 'E' && Math.round(pointDiff.lhs * 100) / 100 === Math.round(pointDiff.rhs * 100) / 100) {
                    // do nothing
                  } else {
                    errorMessages = errorMessages.concat([
                      'elementDiff'
                      , elementDiff
                      , 'pointDiff'
                      , pointDiff
                      , 'oldPvjsonElement'
                      , oldPvjsonElement
                      , 'correspondingNewPvjsonElement'
                      , correspondingNewPvjsonElement
                    ]);
                  }
                });
              } else if (!!elementDiff.path && oldPvjsonElement.shape === 'line-elbow' && elementDiff.kind === 'E' && elementDiff.path.indexOf('y') === 2) {
                // do nothing
                // TODO I don't know for sure what's going on with this error:
                /*
                  **********************************************************************************************************************************************************************
                  Error in: http://identifiers.org/wikipathways/WP929 69230
                  **********************************************************************************************************************************************************************
                  [
                    "elementDiff",
                    {
                      "kind": "E",
                      "path": [
                        "points",
                        1,
                        "y"
                      ],
                      "lhs": 763.3333333333335,
                      "rhs": 396.61627545977404
                    },
                    "oldPvjsonElement",
                    {
                      "backgroundColor": "transparent",
                      "borderWidth": 1,
                      "color": "#008000",
                      "gpml:element": "gpml:Interaction",
                      "id": "d90d4",
                      "interactionType": [
                        "SBO:0000167",
                        "SBO:0000393",
                        "SBO:0000394"
                      ],
                      "markerEnd": "arrow",
                      "participants": [
                        "f20",
                        "e6c8f"
                      ],
                      "points": [
                        {
                          "anchor": [
                            0.5,
                            0,
                            0,
                            -1
                          ],
                          "isAttachedTo": "f20",
                          "x": 1786.6666666666667,
                          "y": 783.3333333333335
                        },
                        {
                          "x": 1581.8304016666668,
                          "y": 763.3333333333335
                        },
                        {
                          "anchor": [
                            "0.01623024747015428",
                            0,
                            0,
                            -1
                          ],
                          "isAttachedTo": "e6c8f",
                          "x": 1376.994136666667,
                          "y": 416.616275459774
                        }
                      ],
                      "shape": "line-elbow",
                      "type": "Interaction",
                      "zIndex": 12288
                    },
                    "correspondingNewPvjsonElement",
                    {
                      "type": "Interaction",
                      "zIndex": 12288,
                      "id": "d90d4",
                      "backgroundColor": "transparent",
                      "color": "#008000",
                      "borderWidth": 1,
                      "shape": "line-elbow",
                      "gpml:element": "gpml:Interaction",
                      "markerEnd": "arrow",
                      "points": [
                        {
                          "isAttachedTo": "f20",
                          "anchor": [
                            0.5,
                            0,
                            0,
                            -1
                          ],
                          "x": 1786.6666666666667,
                          "y": 783.3333333333334
                        },
                        {
                          "x": 1581.8304016666668,
                          "y": 396.61627545977404
                        },
                        {
                          "anchor": [
                            0.01623024747015428,
                            0,
                            0,
                            -1
                          ],
                          "isAttachedTo": "e6c8f",
                          "x": 1376.994136666667,
                          "y": 416.61627545977404
                        }
                      ],
                      "participants": [
                        "f20",
                        "e6c8f"
                      ],
                      "interactionType": [
                        "SBO:0000167",
                        "SBO:0000393",
                        "SBO:0000394"
                      ]
                    }
                  ]
                //*/
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('x') === 0 || elementDiff.path.indexOf('width') === 0) && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'triangle' && oldPvjsonElement.x < 0) {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('y') === 0 || elementDiff.path.indexOf('height') === 0) && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'triangle') {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('x') === 0 || elementDiff.path.indexOf('y') === 0) && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'triangle' && (elementDiff.lhs - 10 < elementDiff.rhs) && (elementDiff.lhs + 10 > elementDiff.rhs)) {
                // do nothing
                // TODO check whether the new calcs actually give us the right y values for triangles
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('x') === 0 || elementDiff.path.indexOf('y') === 0 || elementDiff.path.indexOf('width') === 0 || elementDiff.path.indexOf('height') === 0) && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'pentagon' && (elementDiff.lhs - 10 < elementDiff.rhs) && (elementDiff.lhs + 10 > elementDiff.rhs)) {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('x') === 0 || elementDiff.path.indexOf('y') === 0 || elementDiff.path.indexOf('width') === 0 || elementDiff.path.indexOf('height') === 0) && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'hexagon' && (elementDiff.lhs - 15 < elementDiff.rhs) && (elementDiff.lhs + 15 > elementDiff.rhs)) {
                // do nothing
                // TODO check whether the new calcs actually give us the right y values for pentagons
              } else if (!!elementDiff.path && elementDiff.path.indexOf('height') === 0 && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'arc' && (elementDiff.lhs/2 - 11 < elementDiff.rhs) && (elementDiff.lhs/2 + 11 > elementDiff.rhs)) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('y') === 0 && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'arc' && (elementDiff.lhs - 15 < elementDiff.rhs) && (elementDiff.lhs + 15 > elementDiff.rhs)) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('gpml:Type') > -1 && elementDiff.kind === 'D' && elementDiff.lhs === 'gpml:Rna' && correspondingNewPvjsonElement.type === 'Rna') {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('entityReference') === 0 && elementDiff.kind === 'N' && oldPvjsonElement.type === 'Pathway') {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('type') > -1 && elementDiff.kind === 'E' && elementDiff.lhs === 'undefinedReference' && (elementDiff.rhs === 'PhysicalEntityReference' || elementDiff.rhs === 'RnaReference')) {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('id') === 0 || elementDiff.path.indexOf('controlled') === 0 || elementDiff.path.indexOf('controller') === 0 || elementDiff.path.indexOf('participants') === 0 || elementDiff.path.indexOf('isAttachedTo') === 0 || elementDiff.path.indexOf('left') === 0 || elementDiff.path.indexOf('right') === 0) && elementDiff.kind === 'E' && elementDiff.lhs.indexOf('-') === -1 && elementDiff.rhs.indexOf('idpvjs') > -1 && elementDiff.rhs.length > 6) {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E' && oldPvjsonElement.hasOwnProperty('contains') && !!_.where(oldPvjsonElement.contains, {shape: 'arc'}) && _.where(oldPvjsonElement.contains, {shape: 'arc'}).length > 0) {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'arc' && oldPvjsonElement.hasOwnProperty('rotation')) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('contains') === 0 & elementDiff.path.length > 2 && !!oldPvjsonElement.contains && !!correspondingNewPvjsonElement.contains && oldPvjsonElement.contains.length === correspondingNewPvjsonElement.contains.length) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('isAttachedTo') > -1 && elementDiff.kind === 'E') {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('entityReference') > -1 && !!oldPvjsonElement.entityReference && oldPvjsonElement.entityReference.indexOf('chebi') > -1) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('xrefs') > -1) {
                // it's unclear why the comparison is turning the ids in xrefs arrays for PublicationXrefs into arrays with every character an element.
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('xrefs') > -1 && elementDiff.kind === 'E') {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('RelX') > -1 || elementDiff.path.indexOf('RelY') > -1 || elementDiff.path.indexOf('relX') > -1 || elementDiff.path.indexOf('relY') > -1) && elementDiff.kind === 'E' && elementDiff.lhs - 0.01 < elementDiff.rhs && elementDiff.lhs + 0.01 > elementDiff.rhs) {
                // do nothing
                // TODO we shouldn't use both relX and RelX. check whether we actually are and choose relX only.
              } else if (!!elementDiff.path && elementDiff.path.indexOf('width') > -1 && elementDiff.kind === 'E' && (oldPvjsonElement['gpml:element'] === 'gpml:Group') && elementDiff.lhs - 5 < elementDiff.rhs && elementDiff.lhs + 5 > elementDiff.rhs) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('xref') > -1 && elementDiff.kind === 'N' && (oldPvjsonElement['gpml:element'] === 'gpml:Interaction')) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('anchor') > -1 && elementDiff.kind === 'E' && (elementDiff.lhs - 3) < elementDiff.rhs && (elementDiff.lhs + 3) > elementDiff.rhs) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.kind === 'E' && parseFloat(elementDiff.lhs) === elementDiff.rhs) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('entityReference') === 0 && elementDiff.kind === 'N') {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('isPartOf') > -1 && elementDiff.kind === 'E') {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('width') === 0 || elementDiff.path.indexOf('height') === 0) && elementDiff.kind === 'E' && (oldPvjsonElement[elementDiff.path[0]] === correspondingNewPvjsonElement[elementDiff.path[0]] - correspondingNewPvjsonElement.borderWidth / 2)) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('contains') > -1 && (elementDiff.path.indexOf('borderWidth') > -1 || elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E') {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('type') === 0 && oldPvjsonElement['gpml:element'] === 'gpml:Group') {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('groupStyle') === 0 && oldPvjsonElement['gpml:element'] === 'gpml:Group') {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('groupType') === 0 && oldPvjsonElement['gpml:element'] === 'gpml:Group') {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('displayName') === 0 && newPvjsonClone.id === 'http://identifiers.org/wikipathways/WP2582') {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('entityReference') === 0 || elementDiff.path.indexOf('id') === 0) && elementDiff.kind === 'E' && oldPvjsonElement[elementDiff.path[0]].indexOf('undefined') > -1) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('entityReference') > -1 && elementDiff.kind === 'N' && oldPvjsonElement['gpml:element'] === 'gpml:Interaction') {
                // do nothing
              } else if (!!elementDiff.path && (elementDiff.path.indexOf('markerStart') === 0 || elementDiff.path.indexOf('markerEnd') === 0) && elementDiff.kind === 'E' && strcase.camelCase(elementDiff.lhs) === elementDiff.rhs) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('anchor') > -1 && elementDiff.kind === 'E' && typeof elementDiff.path[elementDiff.path.length - 1] === 'number' && elementDiff.path[elementDiff.path.length - 1] > 3) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('organism') > -1 && elementDiff.kind === 'D') {
                var pathwayReferenceIri = correspondingNewPvjsonElement.entityReference;
                var pathwayReference = _.where(newPvjsonClone.elements, {id: pathwayReferenceIri})[0];
                if (!pathwayReference) {
                  // Do nothing
                } else if (pathwayReference.organism !== elementDiff.lhs) {
                  errorMessages = errorMessages.concat([
                    'pathwayReference does not have expected organism value'
                    , 'elementDiff'
                    , elementDiff
                    , 'oldPvjsonElement'
                    , oldPvjsonElement
                    , 'correspondingNewPvjsonElement'
                    , correspondingNewPvjsonElement
                    , 'pathwayReference'
                    , pathwayReference
                  ]);
                }
              } else if (!!elementDiff.path && elementDiff.path.indexOf('type') > -1 && elementDiff.kind === 'N') {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('type') > -1 && elementDiff.kind === 'E' && (elementDiff.lhs === 'gpml:Group' && elementDiff.rhs === 'Complex' || elementDiff.lhs === 'gpml:Group' && elementDiff.rhs === 'PhysicalEntity' || elementDiff.lhs === 'gpml:Group' && elementDiff.rhs === 'Pathway')) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('gpml:Style') > -1 && elementDiff.kind === 'D' && (elementDiff.lhs === 'gpml:Group' || elementDiff.lhs === 'gpml:Pathway' || elementDiff.lhs === 'gpml:None' || elementDiff.lhs === 'gpml:Complex')) {
                // do nothing
              } else if (!!elementDiff.path && elementDiff.path.indexOf('gpml:Type') > -1 && elementDiff.kind === 'D' && gpmlToBiopaxTypeMappings[elementDiff.lhs] === correspondingNewPvjsonElement.type) {
                // do nothing
              } else if (!!elementDiff.lhs && elementDiff.lhs.indexOf('\ufffd') > -1) {
                // oldPvjson element has a character that is a REPLACEMENT CHARACTER, meaning it either is not or cannot be represented in Unicode.
                // do nothing
              } else {
                errorMessages = errorMessages.concat([
                  'elementDiff'
                  , elementDiff
                  , 'oldPvjsonElement'
                  , oldPvjsonElement
                  , 'correspondingNewPvjsonElement'
                  , correspondingNewPvjsonElement
                  , 'newPvjsonParsed'
                  , newPvjsonParsed
                ]);
              }
            });

            return errorMessages;

          });
        })
      )
      .filter(function(errorMessages) {
        return (!_.isEmpty(errorMessages));
      })
      .reduce([], function(errorOutput, errorMessages) {
        errorOutput = errorOutput.concat(errorMessages);
        return errorOutput;
      })
      .map(function(errorOutput) {
        if (errorOutput.length > 0) {
          var errorHeader = '\n\n**********************************************************************************************************************************************************************\n';
          errorHeader += 'Error in: ' + newPvjsonClone.id + ' ' + newPvjsonClone.idVersion + '\n';
          errorHeader += '**********************************************************************************************************************************************************************\n';
          return errorHeader + JSON.stringify(errorOutput, null, '  ');
        } else {
          var pathwayId = newPvjsonClone.id;
          if (pathwaysCompleted.indexOf(pathwayId) === -1) {
            pathwaysCompleted.push(pathwayId);
            fs.writeFileSync('./pathways-completed.json', JSON.stringify(pathwaysCompleted, null, '  '));
          }
          errorMessagesStream.destroy();
        }
      });

      errorMessagesStream.pipe(fs.createWriteStream('../test/output/differences-old-vs-new.jsonld', {flags: 'a'}));
      //errorMessagesStream.fork().pipe(fs.createWriteStream('../test/output/differences-old-vs-new.jsonld', {flags: 'a'}));
      //errorMessagesStream.fork().pipe(process.stdout);
    });
  });
});
