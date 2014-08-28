'use strict';

var _ = require('lodash')
  , Graphics = require('./graphics.js')
  , Async = require('async')
  , GpmlUtilities = require('./gpml-utilities.js')
  ;

var Pathway = {
  defaults: {
    attributes: {
      BoardHeight: {
        name: 'BoardHeight',
        value: 500
      },
      Name: {
        name: 'Name',
        value: 'Untitled Pathway'
      }
    }
  },
  applyDefaults: function(gpmlElement, defaults) {
    GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
    return gpmlElement;
  }
};

module.exports = Pathway;
