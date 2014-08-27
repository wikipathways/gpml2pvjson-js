'use strict';

var He = require('he')
  , Strcase = require('tower-strcase')
  , GpmlUtilities = require('./gpml-utilities.js')
  , _ = require('lodash')
  ;

module.exports = {
  classLevelElements: {
    Pathway: require('./pathway'),
    Group: require('./group'),
    //*
    DataNode: require('./data-node'),
    GraphicalLine: require('./graphical-line'),
    Interaction: require('./interaction'),
    Label: require('./label'),
    Shape: require('./shape')
    //*/
  },
  defaults: {
    attributes: {
      /*
      GraphId: {
        name: 'GraphId',
        value: null
      }
      //*/
    },
    Graphics: {
      attributes: {
        FillColor: {
          name: 'FillColor',
          value: 'ffffff'
        },
      }
    }
  },

  toPvjson: function(args) {
    var pvjsonElement = args.pvjsonElement
      , gpmlElement = args.gpmlElement
      , attribute
      , i
      , pvjsonHeight
      , pvjsonWidth
      , pvjsonStrokeWidth
      , gpmlShapeType
      , pvjsonShape
      , pvjsonZIndex
      , pvjsonRelX
      , pvjsonRelY
      , pvjsonX
      , pvjsonY
      , pvjsonTextContent
      , pvjsonHref
      , tagName = gpmlElement.name
      , type
      ;


    var attributeDependencyOrder = [
      'GroupId',
      'GraphId',
      'GraphRef',
      'GroupRef',
      'Name',
      'IsPartOf',
      'TextLabel',
      'Type',
      'CellularComponent'
    ];

    var gpmlToPvjsonConverter = {
      Author: function(gpmlValue){
        pvjsonElement.author = gpmlValue;
      },
      'Data-Source': function(gpmlValue){
        pvjsonElement.dataSource = gpmlValue;
      },
      Email: function(gpmlValue){
        pvjsonElement.email = gpmlValue;
      },
      GraphId: function(gpmlValue){
        /*
        var uuid = require('uuid')
        pvjsonElement.id = gpmlValue || uuid.v1();
        //*/
        pvjsonElement.id = gpmlValue;
      },
      GraphRef: function(gpmlValue){
        pvjsonElement.isAttachedTo = gpmlValue;
      },
      GroupId: function(gpmlValue){
        pvjsonElement['gpml:GroupId'] = gpmlValue;
      },
      GroupRef: function(gpmlValue){
        pvjsonElement['gpml:GroupRef'] = gpmlValue;
        //pvjsonElement.isPartOf = gpmlValue;
      },
      Href: function(gpmlHrefValue){
        pvjsonHref = encodeURI(He.decode(gpmlHrefValue));
        pvjsonElement.href = pvjsonHref;
      },
      'Last-Modified': function(gpmlValue){
        pvjsonElement.lastModified = gpmlValue;
      },
      License: function(gpmlValue){
        pvjsonElement.license = gpmlValue;
      },
      Maintainer: function(gpmlValue){
        pvjsonElement.maintainer = gpmlValue;
      },
      Name: function(nameValue){
        var splitName = nameValue.split(' (');
        if (!!splitName && splitName.length === 2 && !!nameValue.match(/\(/g) && nameValue.match(/\(/g).length === 1 && !!nameValue.match(/\)/g) && nameValue.match(/\)/g).length === 1) {
          pvjsonElement.standardName = splitName[0];
          pvjsonElement.displayName = splitName[1].replace(')', '');
        } else {
          pvjsonElement.standardName = nameValue;
          pvjsonElement.displayName = nameValue;
        }
      },
      Organism: function(gpmlValue){
        pvjsonElement.organism = gpmlValue;
      },
      Style: function(gpmlValue){
        // This code handles 'Style' attributes for GPML 'Group' elements
        // It uses Biopax terms when possible, otherwise GPML.
        // Note that Biopax is the default namespace in JSON-LD for jsonpv,
        // so if a namespace is not specified below, there is an implied "bp:" preceding the term
        var gpmlToSemanticMappings = {
          'gpml:Group': 'gpml:Group',
          'gpml:Complex': 'Complex',
          'gpml:Pathway': 'Pathway'
        };
        pvjsonElement['gpml:Style'] = 'gpml:' + gpmlValue;
        var type = gpmlToSemanticMappings[ pvjsonElement['gpml:Type'] ] || 'gpml:Group';
        pvjsonElement.type = type;
      },
      TextLabel: function(gpmlTextLabelValue){
        pvjsonTextContent = He.decode(gpmlTextLabelValue);
        pvjsonElement.textContent = pvjsonTextContent;
      },
      Type: function(gpmlTypeValue){
        pvjsonElement['gpml:Type'] = 'gpml:' + gpmlTypeValue;
      },
      Version: function(gpmlValue){
        pvjsonElement.idVersion = gpmlValue;
      },
    };

    gpmlElement = this.classLevelElements[tagName].applyDefaults(gpmlElement, this.defaults);
    pvjsonElement = GpmlUtilities.convertAttributesToJson(gpmlElement, pvjsonElement, gpmlToPvjsonConverter, attributeDependencyOrder);

    var result = {};
    result.pvjsonElement = pvjsonElement;
    result.gpmlElement = gpmlElement;
    return result;
  }
};

