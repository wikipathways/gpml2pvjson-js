/* This file appears very similar to compare-streaming.js
 */

var _ = require('lodash')
  , diff = require('deep-diff').diff
  , pd = require('pretty-data').pd
  , fs = require('fs')
  , JSONStream = require('JSONStream')
  , EventEmitter = require('events').EventEmitter
  , request = require('request')
  , highland = require('highland')
  , path = require('path')
  , Gpml2Pvjson = require('../lib/index')
  , url = require('url')
  , pathways = require('./pathways-list.json')
  ;

console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S');
console.log('S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S');
console.log('Start of file');
console.log('S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S');
console.log('S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S S');

/*
(function() {
  var dbId = 'WP1218';
  var idVersion = '68743';

  convertAndCompare({
    dbId: dbId
    , idVersion: idVersion
    , inputType: 'ID'
  });
}());
//*/

/*
pathways.forEach(function(pathway){
  console.log(pathway.id);
  console.log(pathway.idVersion);

  convertAndCompare({
    dbId: pathway.id
    , idVersion: pathway.idVersion
    , inputType: 'ID'
  });
});
//*/

var dbId
  , idVersion
  , input
  ;

//pathways = [{id: 'WP525', idVersion: '74871'}, {id: 'WP524', idVersion: '72112'}];
//pathways = [{id: 'WP1000', idVersion: '74149'}];
var pathwaysStream = highland(pathways);

var oldPvjsonPathwayStream = highland([pathwaysStream.fork()]).sequence()
.map(function(pathway) {
  var oldPvjsonInput = 'http://test2.wikipathways.org/v2/pathways/' + pathway.id + '/.json';

  return highland(request({
    url: oldPvjsonInput
    , headers: {
      'Accept': 'application/json'
    }
  }))
  .map(function(pvjsonBufferChunk) {
    return pvjsonBufferChunk.toString();
  })
  .reduce('', function(pvjsonAsString, pvjsonChunkAsString) {
    pvjsonAsString += pvjsonChunkAsString;
    return pvjsonAsString;
  });
});


function findCorrespondingNewPvjsonElementMatchingCurrentOldPvjsonElement(pvjson, oldPvjsonElement) {
  // find correspondingNewPvjsonElement(s) that is/are an exact match for current oldPvjsonElement
  var correspondingNewPvjsonElements = _.where(pvjson.elements, { 'id': oldPvjsonElement.id })
    , correspondingNewPvjsonElement
    ;

  // if one or more correspondingNewPvjsonElements exist
  if (correspondingNewPvjsonElements.length > 0) {
    correspondingNewPvjsonElement = correspondingNewPvjsonElements[0];
  } else {
    // find correspondingNewPvjsonElement(s) based on everything except id
    var oldPvjsonElementClone = _.cloneDeep(oldPvjsonElement);
    delete oldPvjsonElementClone.id;
    correspondingNewPvjsonElements = _.where(pvjson.elements, oldPvjsonElementClone);
    // if one or more correspondingNewPvjsonElements exist
    if (correspondingNewPvjsonElements.length > 0) {
      correspondingNewPvjsonElement = correspondingNewPvjsonElements[0];
    } else {
      if (oldPvjsonElement['gpml:element'] === 'gpml:Group') {
        //console.log('Matching based on contains count, x, y and width');
        if (oldPvjsonElement['gpml:Style'] === 'gpml:Group' || oldPvjsonElement['gpml:Style'] === 'gpml:None') {
          oldPvjsonElement.type = 'PhysicalEntity';
        }
        var oldPvjsonElementContainsCount = oldPvjsonElement.contains.length;
        correspondingNewPvjsonElements = pvjson.elements.filter(function(element) {
          return !!element.contains && element.contains.length === oldPvjsonElementContainsCount && element.type === oldPvjsonElement.type && ((!!element.width && element.width * 0.9 < oldPvjsonElement.width && element.width * 1.1 > oldPvjsonElement.width) || (!!element.height && element.height * 0.9 < oldPvjsonElement.height && element.height * 1.1 > oldPvjsonElement.height)) && ((element.x - 10 < oldPvjsonElement.x && element.x + 10 > oldPvjsonElement.x) || (element.y - 10 < oldPvjsonElement.y && element.y + 10 > oldPvjsonElement.y));
        });
        /*
        console.log('618correspondingNewPvjsonElements');
        console.log(correspondingNewPvjsonElements.length);
        console.log(correspondingNewPvjsonElements);
        console.log('oldPvjsonElement');
        console.log(oldPvjsonElement);
        //*/

        if (correspondingNewPvjsonElements.length !== 1) {
          var firstOldContainedElement = oldPvjsonElement.contains[0];
          correspondingNewPvjsonElements = pvjson.elements.filter(function(element) {
            var containedElements = element.contains;
            if (!!containedElements) {
              return containedElements.filter(function(containedElement) {
                return (containedElement.id === firstOldContainedElement.id || ((element.x - 10 < oldPvjsonElement.x && element.x + 10 > oldPvjsonElement.x) && (element.y - 10 < oldPvjsonElement.y && element.y + 10 > oldPvjsonElement.y)));
              }).length > 0;
            } else {
              return false;
            }
          });
        }
      }
      if (correspondingNewPvjsonElements.length === 1) {
        correspondingNewPvjsonElement = correspondingNewPvjsonElements[0];
      } else if (correspondingNewPvjsonElements.length > 0) {
        console.log('Multiple correspondingNewPvjsonElements');
        //errorMessages.push('Multiple correspondingNewPvjsonElements');

        console.log('oldPvjsonElement with multiple matches in correspondingNewPvjsonElements:');
        //errorMessages.push('oldPvjsonElement with multiple matches in correspondingNewPvjsonElements:');

        console.log(oldPvjsonElement);
        //errorMessages.push(oldPvjsonElement);

        console.log('All matches from correspondingNewPvjsonElements');
        //errorMessages.push('All matches from correspondingNewPvjsonElements');

        console.log(correspondingNewPvjsonElements);
        //errorMessages.push(correspondingNewPvjsonElements);

        correspondingNewPvjsonElement = correspondingNewPvjsonElements[0];
      }
    }
  }

  return correspondingNewPvjsonElement;
}

//highland([{id: 'WP525', idVersion: '74871'}])
//highland([{id: 'WP10', idVersion: '69132'}])
//highland([{id: 'WP1000', idVersion: '74149'}])
//highland([{id: 'WP1218', idVersion: '68743'}])
//highland([ highland([{id: 'WP525', idVersion: '74871'}]) ])
//highland([ highland([{id: 'WP525', idVersion: '74871'}, {id: 'WP524', idVersion: '72112'}]) ]).sequence()
//highland([ highland(pathways) ]).sequence()
//highland([ pathways ]).sequence()
pathwaysStream.fork()
.take(4)
.map(function(pathway) {
  console.log('**************************************************************************************************************************************************************************');
  console.log('**************************************************************************************************************************************************************************');
  console.log('Starting on ' + pathway.id + ' ' + pathway.idVersion);
  console.log('**************************************************************************************************************************************************************************');
  console.log('**************************************************************************************************************************************************************************');

  dbId = pathway.id;
  idVersion = pathway.idVersion;
  var inputType = 'ID'; 
  //*
  if (!inputType) {
    if (!input) {
      inputType = 'ID';
    } else if (!!url.parse(input).host) {
      inputType = 'url';
    } else if (fs.existsSync(input)) {
      inputType = 'path';
      /*
    } else if (isStream(input)) {
      inputType = 'stream';
      //*/
    } else {
      inputType = 'xmlString';
    }
    console.warn('No inputType specified. Using best guess of "' + inputType + '"');
  }

  var inputStream;
  if (inputType === 'url') {
    inputStream = highland(request(input));
  } else if (inputType === 'path') {
    inputStream = highland(fs.createReadStream(input));
  } else if (inputType === 'ID') {
    input = 'http://www.wikipathways.org/wpi/wpi.php?action=downloadFile&type=gpml&pwTitle=Pathway:' + dbId;
    //input = 'http://test2.wikipathways.org/wpi/wpi.php?action=downloadFile&type=gpml&pwTitle=Pathway:' + dbId;
    console.log('now running ' + input);
    inputStream = highland(request(input));
    /*
  } else if (inputType === 'stream') {
    inputStream = highland(input);
    //*/
  } else if (inputType === 'xmlString') {
    inputStream = highland([ input ]);
  } else {
    throw new Error('Unrecognized inputType: "' + inputType + '"');
  }

  return inputStream;
})
.sequence()
//.parallel(2)
//.pipe(Gpml2Pvjson)
.pipe(highland.pipeline(
  Gpml2Pvjson,
  function(s) {
    return s.zip(oldPvjsonPathwayStream)
    .map(function(array) {
      var pvjson = JSON.parse(array[0]);
      console.log('pvjson');
      console.log(pvjson);
      var pvjsonClone = _.cloneDeep(pvjson);
      var oldPvjsonStream = array[1];

      var pathwayIri = !!dbId ? 'http://identifiers.org/wikipathways/' + dbId : input;
      pvjson.id = pathwayIri;
      pvjson.idVersion = idVersion || '0';

      pvjson['@context'].filter(function(contextElement) {
        return contextElement.hasOwnProperty('@base');
      })
      .map(function(baseElement) {
        baseElement['@base'] = pathwayIri;
      });
      console.log('Converted ' + pvjson.id);

      var errorMessagesStream = oldPvjsonStream.pipe(highland.pipeline(
        function (s) {
          return s.map(function(oldPvjson) {
            return oldPvjson.toString();
          });
        },
        JSONStream.parse('elements.*'),
        function (s) {
          return s.filter(function(oldPvjsonElement) {
            return _.where(pvjsonClone.elements, oldPvjsonElement).length === 0;
          })
          .map(function(oldPvjsonElement) {
            var errorMessages = [];

            if (oldPvjsonElement.hasOwnProperty('author') && oldPvjsonElement.type === 'PublicationXref') {
              console.log('Still need to finish Biopax conversion for PublicationXrefs.');
              return;
              //return errorMessages.concat('Still need to finish Biopax conversion for PublicationXrefs.');
            }

            var correspondingNewPvjsonElement = findCorrespondingNewPvjsonElementMatchingCurrentOldPvjsonElement(pvjsonClone, oldPvjsonElement);

            if (!correspondingNewPvjsonElement) {
              return errorMessages.concat([
                'Could not find correspondingNewPvjsonElement for the following oldPvjsonElement:'
                , oldPvjsonElement
              ]);
            }

            _.pull(pvjsonClone.elements, correspondingNewPvjsonElement);
            var elementDiffs = diff(oldPvjsonElement, correspondingNewPvjsonElement);
            elementDiffs.forEach(function(elementDiff) {
              if ((elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1 || elementDiff.path.indexOf('rotation') > -1) && elementDiff.kind === 'E' && (elementDiff.lhs - 3 < elementDiff.rhs) && (elementDiff.lhs + 3 > elementDiff.rhs)) {
                // do nothing
              } else if (elementDiff.path.indexOf('height') > -1 && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'arc' && (elementDiff.lhs/2 - 3 < elementDiff.rhs) && (elementDiff.lhs/2 + 3 > elementDiff.rhs)) {
                // do nothing
              } else if (elementDiff.path.indexOf('id') > -1 && elementDiff.kind === 'E' && oldPvjsonElement.hasOwnProperty('contains')) {
                // do nothing
              } else if ((elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E' && oldPvjsonElement.hasOwnProperty('contains') && !!_.where(oldPvjsonElement.contains, {shape: 'arc'}) && _.where(oldPvjsonElement.contains, {shape: 'arc'}).length > 0) {
                // do nothing
              } else if ((elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'arc' && oldPvjsonElement.hasOwnProperty('rotation')) {
                // do nothing
              } else if (elementDiff.path.indexOf('isAttachedTo') > -1 && elementDiff.kind === 'E') {
                // do nothing
              } else if (elementDiff.path.indexOf('xrefs') > -1) {
                // it's unclear why the comparison is turning the ids in xrefs arrays for PublicationXrefs into arrays with every character an element.
                // do nothing
              } else if (elementDiff.path.indexOf('xrefs') > -1 && elementDiff.kind === 'E') {
                // do nothing
              } else if (elementDiff.path.indexOf('width') > -1 && elementDiff.kind === 'E' && (oldPvjsonElement['gpml:element'] === 'gpml:Group') && elementDiff.lhs - 5 < elementDiff.rhs && elementDiff.lhs + 5 > elementDiff.rhs) {
                // do nothing
              } else if (elementDiff.path.indexOf('xref') > -1 && elementDiff.kind === 'N' && (oldPvjsonElement['gpml:element'] === 'gpml:Interaction')) {
                // do nothing
              } else if (elementDiff.path.indexOf('anchor') > -1 && elementDiff.kind === 'E' && (elementDiff.lhs - 3) < elementDiff.rhs && (elementDiff.lhs + 3) > elementDiff.rhs) {
                // do nothing
              } else if (elementDiff.kind === 'E' && parseFloat(elementDiff.lhs) === elementDiff.rhs) {
                // do nothing
              } else if (elementDiff.path.indexOf('isPartOf') > -1 && elementDiff.kind === 'E') {
                // do nothing
              } else if (elementDiff.path.indexOf('isPartOf') > -1 && elementDiff.kind === 'E') {
                // do nothing
              } else if (elementDiff.path.indexOf('contains') > -1 && (elementDiff.path.indexOf('borderWidth') > -1 || elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E') {
                // do nothing
              } else if (elementDiff.path.indexOf('entityReference') > -1 && elementDiff.kind === 'N' && oldPvjsonElement['gpml:element'] === 'gpml:Interaction') {
                // do nothing
              } else if (elementDiff.path.indexOf('organism') > -1 && elementDiff.kind === 'D') {
                var pathwayReferenceIri = correspondingNewPvjsonElement.entityReference;
                var pathwayReference = _.where(pvjsonClone.elements, {id: pathwayReferenceIri})[0];
                if (pathwayReference.organism !== elementDiff.lhs) {
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
                } else {
                  // do nothing
                }
              } else if (elementDiff.path.indexOf('type') > -1 && elementDiff.kind === 'N') {
                // do nothing
              } else if (elementDiff.path.indexOf('type') > -1 && elementDiff.kind === 'E' && (elementDiff.lhs === 'gpml:Group' && elementDiff.rhs === 'Complex' || elementDiff.lhs === 'gpml:Group' && elementDiff.rhs === 'PhysicalEntity' || elementDiff.lhs === 'gpml:Group' && elementDiff.rhs === 'Pathway')) {
                // do nothing
              } else if (elementDiff.path.indexOf('gpml:Style') > -1 && elementDiff.kind === 'D' && (elementDiff.lhs === 'gpml:Group' || elementDiff.lhs === 'gpml:Pathway' || elementDiff.lhs === 'gpml:None' || elementDiff.lhs === 'gpml:Complex')) {
                // do nothing
              } else if (elementDiff.path.indexOf('gpml:Type') > -1 && elementDiff.kind === 'D' && (elementDiff.lhs === 'gpml:GeneProduct' || elementDiff.lhs === 'gpml:Metabolite' || elementDiff.lhs === 'gpml:Protein' || elementDiff.lhs === 'gpml:Pathway' || elementDiff.lhs === 'gpml:Unknown')) {
                // do nothing
              } else {
                errorMessages = errorMessages.concat([
                  'elementDiff'
                  , elementDiff
                  , 'oldPvjsonElement'
                  , oldPvjsonElement
                  , 'correspondingNewPvjsonElement'
                  , correspondingNewPvjsonElement
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
      .map(function(errorMessages) {
        var errorHeader = '\n**********************************************************************************************************************************************************************\n';
        errorHeader += 'Error in: ' + pvjson.id + '\n';
        errorHeader += '**********************************************************************************************************************************************************************\n';
        console.log(errorHeader);
        fs.appendFileSync('../test/output/differences-old-vs-new.jsonld', errorHeader);
        return JSON.stringify(errorMessages, null, '  ');
      });

      errorMessagesStream.fork().pipe(fs.createWriteStream('../test/output/differences-old-vs-new.jsonld', {flags: 'a'}));
      errorMessagesStream.fork().pipe(process.stdout);

      return JSON.stringify(pvjson, null, '  ');
    });
  }
))
//.pipe(process.stdout);
.pipe(fs.createWriteStream('../test/output/pathway-test.jsonld'));
