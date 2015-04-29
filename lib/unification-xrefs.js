'use strict';

var BridgeDb = require('./bridgedb/bridgedb.js')
  , _ = require('lodash')
  ;

module.exports = {
  addIdentifiersToContext: function(context, callback) {
    BridgeDb.getDataSources(function(err, dataSources) {
      _.forEach(dataSources, function(dataSource) {
        if (!!dataSource.namespace) {
          context[dataSource.namespace] = 'identifiers:' + dataSource.namespace + '/';
        }
      });
      if (!!callback) {
        callback(null, context);
      }
    });
  }
};
