var EventEmitter = require('events').EventEmitter;
var highland = require('highland');

function createStream(args) {
  var httpRetryLimit = 2;
  var retryCount = 0;
  var httpRetryDelay = 3000;
  var httpErrors = new EventEmitter();
  var httpErrorsStream = highland('error', httpErrors);

  function check(args) {
    var error = args.error;
    var response = args.response;
    var body = args.body;
    var pathway = args.pathway;
    var stream = args.stream;
    var source = args.source;

    // request doesn't throw an error for responses like 404, 500, etc.,
    // but we want to treat them like errors.
    if (!!response && !!response.statusCode) {
      var statusCode = response.statusCode;
      var statusCodeFirstCharacter = statusCode.toString()[0];
      if (statusCodeFirstCharacter === '4' ||
          statusCodeFirstCharacter === '5') {
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

    retryCount += 1;

    setTimeout(function() {
      stream.resume();
    }, httpRetryDelay);
  }
}

module.exports = exports = {
  createStream: createStream
};
