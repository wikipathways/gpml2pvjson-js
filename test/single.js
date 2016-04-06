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

console.log('M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M');
console.log('M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M');
console.log('M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M');
console.log('M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M M');

//*
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

function convertAndCompare(args) {
  var dbId = args.dbId
    , idVersion = args.idVersion
    , inputType = args.inputType
    , input = args.input
    ;
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
        console.log('hi');
        console.log(input);
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
  //*/


  /*
  //var input = path.resolve(__dirname, './input/WP525_74871.gpml');
  var input = path.resolve(__dirname, './input/playground656.gpml');
  fs.createReadStream(input)
  //*/

  /*
  var input = 'http://www.wikipathways.org/wpi/wpi.php?action=downloadFile&type=gpml&pwTitle=Pathway:' + dbId;
  request(input)
  //*/
  inputStream
  .pipe(Gpml2Pvjson)
  .pipe(highland.pipeline(
    function(s) {
      return s.map(function(pvjsonString) {
        var pvjson = JSON.parse(pvjsonString);
        /*
        console.log('pvjson');
        console.log(pvjson);
        //*/

        var pathwayIri = !!dbId ? 'http://identifiers.org/wikipathways/' + dbId : input;
        pvjson['@context'].filter(function(contextElement) {
          return contextElement.hasOwnProperty('@base');
        })
        .map(function(baseElement) {
          baseElement['@base'] = pathwayIri;
        });

        pvjson.idVersion = idVersion || '0';
        return pvjson;
      })
      .map(function(pvjson) {
        //*
        var oldPvjsonInput = 'http://test2.wikipathways.org/v2/pathways/' + dbId + '/.json';
        console.log('oldPvjsonInput');
        console.log(oldPvjsonInput);

        var oldPvjsonElementStreamEvents = new EventEmitter();
          highland(request({
            url: oldPvjsonInput
            , headers: {
              'Accept': 'application/json'
            }
          }))
          .pipe(JSONStream.parse('elements.*'))
          .pipe(highland.pipeline(
            function (s) {
              return s.filter(function(oldPvjsonElement) {
                return _.where(pvjson.elements, oldPvjsonElement).length === 0;
              })
              .map(function(oldPvjsonElement) {
                //oldPvjsonElementStreamEvents.emit('element', oldPvjsonElement);
                //console.log('oldPvjsonElement');
                //console.log(oldPvjsonElement);

                var output = [];

                var correspondingNewPvjsonElements = _.where(pvjson.elements, { 'id': oldPvjsonElement.id })
                  , correspondingNewPvjsonElement
                  ;

                // if one or more correspondingNewPvjsonElements exist
                if (correspondingNewPvjsonElements.length > 0) {
                  correspondingNewPvjsonElement = correspondingNewPvjsonElements[0];
                } else {
                  var oldPvjsonElementClone = _.cloneDeep(oldPvjsonElement);
                  delete oldPvjsonElementClone.id;
                  correspondingNewPvjsonElements = _.where(pvjson.elements, oldPvjsonElementClone);
                  // if one or more correspondingNewPvjsonElements exist
                  if (correspondingNewPvjsonElements.length > 0) {
                    correspondingNewPvjsonElement = correspondingNewPvjsonElements[0];
                  } else {
                    if (oldPvjsonElement['gpml:element'] === 'gpml:Group') {
                      //console.log('Matching based on contains count, x, y and width');
                      var oldPvjsonElementContainsCount = oldPvjsonElement.contains.length;
                      correspondingNewPvjsonElements = pvjson.elements.filter(function(element) {
                        return !!element.contains && element.contains.length === oldPvjsonElementContainsCount && !!element.width && element.width - 10 < oldPvjsonElement.width && element.width + 10 > oldPvjsonElement.width && element.x - 10 < oldPvjsonElement.x && element.x + 10 > oldPvjsonElement.x && element.y - 10 < oldPvjsonElement.y && element.y + 10 > oldPvjsonElement.y;
                      });
                    }
                    if (correspondingNewPvjsonElements.length === 1) {
                      correspondingNewPvjsonElement = correspondingNewPvjsonElements[0];
                    } else if (correspondingNewPvjsonElements.length > 0) {
                      console.log('Multiple correspondingNewPvjsonElements');
                      output.push('Multiple correspondingNewPvjsonElements');

                      console.log('oldPvjsonElement with multiple matches in correspondingNewPvjsonElements:');
                      output.push('oldPvjsonElement with multiple matches in correspondingNewPvjsonElements:');

                      console.log(oldPvjsonElement);
                      output.push(oldPvjsonElement);

                      console.log('All matches from correspondingNewPvjsonElements');
                      output.push('All matches from correspondingNewPvjsonElements');

                      console.log(correspondingNewPvjsonElements);
                      output.push(correspondingNewPvjsonElements);

                      correspondingNewPvjsonElement = correspondingNewPvjsonElements[0];
                    } else if (oldPvjsonElement.hasOwnProperty('author') && oldPvjsonElement.type === 'PublicationXref') {
                      console.log('Still need to finish Biopax conversion for PublicationXrefs.');
                      output = null;
                    } else {
                      console.log('No correspondingNewPvjsonElement for this old one:');
                      console.log(oldPvjsonElement);
                      output = null;
                    }
                  }
                }

                if (!!correspondingNewPvjsonElement) {
                  _.pull(pvjson.elements, correspondingNewPvjsonElement);
                  var elementDiffs = diff(oldPvjsonElement, correspondingNewPvjsonElement);
                  elementDiffs.forEach(function(elementDiff) {
                    if ((elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1 || elementDiff.path.indexOf('rotation') > -1) && elementDiff.kind === 'E' && (elementDiff.lhs - 3 < elementDiff.rhs) && (elementDiff.lhs + 3 > elementDiff.rhs)) {
                      output = null;
                    } else if (elementDiff.path.indexOf('height') > -1 && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'arc' && (elementDiff.lhs/2 - 3 < elementDiff.rhs) && (elementDiff.lhs/2 + 3 > elementDiff.rhs)) {
                      output = null;
                    } else if (elementDiff.path.indexOf('id') > -1 && elementDiff.kind === 'E' && oldPvjsonElement.hasOwnProperty('contains')) {
                      output = null;
                    } else if ((elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E' && oldPvjsonElement.hasOwnProperty('contains') && !!_.where(oldPvjsonElement.contains, {shape: 'arc'}) && _.where(oldPvjsonElement.contains, {shape: 'arc'}).length > 0) {
                      output = null;
                    } else if ((elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E' && oldPvjsonElement.shape === 'arc' && oldPvjsonElement.hasOwnProperty('rotation')) {
                      output = null;
                    } else if (elementDiff.path.indexOf('isAttachedTo') > -1 && elementDiff.kind === 'E') {
                      output = null;
                    } else if (elementDiff.path.indexOf('xrefs') > -1 && elementDiff.kind === 'E') {
                      output = null;
                    } else if (elementDiff.path.indexOf('width') > -1 && elementDiff.kind === 'E' && (oldPvjsonElement['gpml:element'] === 'gpml:Group') && elementDiff.lhs - 5 < elementDiff.rhs && elementDiff.lhs + 5 > elementDiff.rhs) {
                      output = null;
                    } else if (elementDiff.path.indexOf('xref') > -1 && elementDiff.kind === 'N' && (oldPvjsonElement['gpml:element'] === 'gpml:Interaction')) {
                      output = null;
                    } else if (elementDiff.path.indexOf('borderWidth') > -1 && elementDiff.kind === 'E' && (oldPvjsonElement.shape.indexOf('rectangle') > -1) && (elementDiff.lhs / 2) === elementDiff.rhs) {
                      output = null;
                    } else if (elementDiff.path.indexOf('anchor') > -1 && elementDiff.kind === 'E' && (elementDiff.lhs - 3) < elementDiff.rhs && (elementDiff.lhs + 3) > elementDiff.rhs) {
                      output = null;
                    } else if (elementDiff.kind === 'E' && parseFloat(elementDiff.lhs) === elementDiff.rhs) {
                      output = null;
                    } else if (elementDiff.path.indexOf('isPartOf') > -1 && elementDiff.kind === 'E') {
                      output = null;
                    } else if (elementDiff.path.indexOf('isPartOf') > -1 && elementDiff.kind === 'E') {
                      output = null;
                    } else if (elementDiff.path.indexOf('contains') > -1 && (elementDiff.path.indexOf('borderWidth') > -1 || elementDiff.path.indexOf('x') > -1 || elementDiff.path.indexOf('y') > -1 || elementDiff.path.indexOf('width') > -1 || elementDiff.path.indexOf('height') > -1) && elementDiff.kind === 'E') {
                      output = null;
                    } else if (elementDiff.path.indexOf('entityReference') > -1 && elementDiff.kind === 'N' && oldPvjsonElement['gpml:element'] === 'gpml:Interaction') {
                      output = null;
                    } else if (elementDiff.path.indexOf('organism') > -1 && elementDiff.kind === 'D') {
                      var pathwayReferenceIri = correspondingNewPvjsonElements[0].entityReference;
                      var pathwayReference = _.where(pvjson.elements, {id: pathwayReferenceIri})[0];
                      if (pathwayReference.organism !== elementDiff.lhs) {
                        console.log('elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff');
                        console.log('elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff');
                        console.log('pathwayReference does not have expected organism value');
                        console.log(elementDiff);
                        console.log('oldPvjsonElement');
                        console.log(oldPvjsonElement);
                        console.log('correspondingNewPvjsonElement');
                        console.log(correspondingNewPvjsonElements[0]);
                        console.log('pathwayReference');
                        console.log(pathwayReference);
                      } else {
                        output = null;
                      }
                    } else if (elementDiff.path.indexOf('type') > -1 && elementDiff.kind === 'N') {
                      output = null;
                    } else if (elementDiff.path.indexOf('type') > -1 && elementDiff.kind === 'E' && (elementDiff.lhs === 'gpml:Group' && elementDiff.rhs === 'Complex' || elementDiff.lhs === 'gpml:Group' && elementDiff.rhs === 'PhysicalEntity' || elementDiff.lhs === 'gpml:Group' && elementDiff.rhs === 'Pathway')) {
                      output = null;
                    } else if (elementDiff.path.indexOf('gpml:Style') > -1 && elementDiff.kind === 'D' && (elementDiff.lhs === 'gpml:Group' || elementDiff.lhs === 'gpml:Pathway' || elementDiff.lhs === 'gpml:None' || elementDiff.lhs === 'gpml:Complex')) {
                      output = null;
                    } else if (elementDiff.path.indexOf('gpml:Type') > -1 && elementDiff.kind === 'D' && (elementDiff.lhs === 'gpml:GeneProduct' || elementDiff.lhs === 'gpml:Metabolite' || elementDiff.lhs === 'gpml:Protein' || elementDiff.lhs === 'gpml:Pathway' || elementDiff.lhs === 'gpml:Unknown')) {
                      output = null;
                    } else {
                      console.log('elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff');
                      console.log('elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff');
                      output.unshift('elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff elementDiff');

                      console.log(elementDiff);
                      output.push(elementDiff);
                      /*
                      try {
                        console.log('oldPvjsonElement point 1');
                        console.log(oldPvjsonElement.points[1]);
                        console.log('correspondingNewPvjsonElement point 1');
                        console.log(correspondingNewPvjsonElements[0].points[1]);
                      } catch (e) {
                      }
                      //*/
                      console.log('oldPvjsonElement');
                      output.push(elementDiff);

                      console.log(oldPvjsonElement);
                      output.push(elementDiff);

                      console.log('correspondingNewPvjsonElement');
                      console.log(correspondingNewPvjsonElement);
                      output.push(correspondingNewPvjsonElement);
                    }
                  });
                }

                return JSON.stringify(output, null, '  ');
              });
            })
          )
          .filter(function(value) {
            return (!!value && value !== null && value !== 'null');
          })
          .pipe(fs.createWriteStream('../test/output/differences-old-vs-new.jsonld', {flags: 'a'}));
          //*/
        return JSON.stringify(pvjson, null, '  ');
      });
    }
  ))
  //.pipe(process.stdout);
  .pipe(fs.createWriteStream('../test/output/pathway-test.jsonld'));
}

