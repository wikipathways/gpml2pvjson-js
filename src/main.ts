import _ = require('lodash');
import * as sax from 'sax';
//import Biopax from 'biopax2json';
import * as gpmlUtilities from './gpml-utilities';
import * as Group from './group';
import * as Interaction from './interaction';
import * as Point from './point';
import * as utils from './utils';
import * as XmlElement from './xml-element';

import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import 'rxjs/add/observable/fromEventPattern';
import 'rxjs/add/observable/merge';

import 'rxjs/add/operator/do';
import 'rxjs/add/operator/last';
import 'rxjs/add/operator/let';
import 'rxjs/add/operator/map';
import 'rx-extra/add/operator/throughNodeStream';
 
export function transformGpmlToPvjson(sourceStream: Observable<string>) {
  var pvjson: Pvjson;
  var pathwayIri;
  var currentElementIsPathway: boolean;
  var currentText;
  var globalContext = [];
  var saxStream;
  var saxStreamIsStrict = true; // set to false for html-mode
  var openTagStream;
  var currentTagName;
  var textStream;
  var closeTagStream;

  // TODO where should these be hosted?
  var externalContexts = [
    'https://wikipathwayscontexts.firebaseio.com/biopax.json',
    'https://wikipathwayscontexts.firebaseio.com/cellularLocation.json',
    'https://wikipathwayscontexts.firebaseio.com/display.json',
    //'https://wikipathwayscontexts.firebaseio.com/interactionType.json',
    'https://wikipathwayscontexts.firebaseio.com/organism.json',
    'https://wikipathwayscontexts.firebaseio.com/bridgedb/.json'
  ];

  globalContext = globalContext.concat(externalContexts);

  function convertConversionToGenericInteraction(interaction) {
    console.warn('This Conversion fails BioPAX validator:)');
    console.warn(interaction);
    interaction.type = 'Interaction';
    interaction.participant = [interaction.left, interaction.right];
    delete interaction.left;
    delete interaction.right;
    delete interaction.conversionDirection;
    delete interaction.interactionType;
    return interaction;
  }

  function convertCatalysisToGenericInteraction(interaction) {
    console.warn('This Catalysis fails BioPAX validator:)');
    console.warn(interaction);
    interaction.type = 'Interaction';
    interaction.participant = [interaction.controlled, interaction.controller];
    delete interaction.controlled;
    delete interaction.controller;
    delete interaction.interactionType;
    return interaction;
  }

  function createNewSAXStream() {
    // stream usage
    // takes the same options as the parser
    saxStream = sax.createStream(saxStreamIsStrict, {
      xmlns: true,
      trim: true
    });
    saxStream.on('error', function(e) {
      // unhandled errors will throw, since this is a proper node
      // event emitter.
      console.error('error!', e);
      // clear the error
      this._parser.error = null;
      this._parser.resume();
    });

		function fromSAXEvent(eventName) {
			return Observable.fromEventPattern(function(handler) {
				saxStream.on(eventName, handler);
			}, function(handler) {
				saxStream._parser['on' + eventName] = undefined;
			});
		}

		openTagStream = fromSAXEvent('opentag') as Observable<GPMLElement>;
		textStream = fromSAXEvent('text') as Observable<string>;
		closeTagStream = fromSAXEvent('closetag') as Observable<string>;

    return saxStream;
  }

  saxStream = createNewSAXStream();

  function ensureGraphIdExists(x) {
    x.attributes.GraphId = x.attributes.GraphId ||
      {
        name: 'GraphId',
        value: 'idpvjs' + saxStream._parser.startTagPosition
      };
    return x;
  }

  var saxStreamFiltered = Observable.merge(openTagStream, textStream, closeTagStream);

  var tagNamesForTargetElements = [
    'DataNode',
    'Label',
    'Interaction',
    'GraphicalLine',
    'Group',
    'Shape',
    'State',
    'Pathway',
  ];
  var tagNamesForNestedTargetElements = [
    'Anchor'
  ];
  var tagNamesForSupplementalElementsWithAttributes = [
    'Graphics',
    'Xref'
  ];
  var tagNamesForSupplementalElementsWithText = [
    'BiopaxRef',
    'Comment'
  ];
  var tagNamesForNestedSupplementalElements = [
    'Point',
    'Attribute'
  ];

  var currentTargetElement = {} as GPMLElement;
  var lastTargetElement = {} as GPMLElement;
  var currentNestedTargetElements = [];

	// NOTE: this is for handling BioPAX as in GPML,
	// which is not currently conformant with the
	// BioPAX 3 spec.
  var currentPublicationXref;
  var currentPublicationXrefTag;
  var currentPublicationXrefDisplayName = 0;
	const bpToPvjsonMappings = {
		'bp:ID': 'identifier',
		'bp:DB': 'database',
		'bp:TITLE': 'title',
		'bp:SOURCE': 'source',
		'bp:YEAR': 'year',
		'bp:AUTHORS': 'author',
	};
	function BioPAX(x): void {
		if (x === 'bp:PublicationXref') {
			pvjson.elements.push(currentPublicationXref);
			currentPublicationXref = null;
		} else if (x.name === 'bp:PublicationXref') {
			currentPublicationXrefDisplayName += 1;
			currentPublicationXref = {
				id: x.attributes['rdf:id'].value,
				displayName: String(currentPublicationXrefDisplayName),
				type: 'PublicationXref'
			} as PublicationXref;
		} else if (_.keys(bpToPvjsonMappings).indexOf(x.name) > -1) {
			currentPublicationXrefTag = bpToPvjsonMappings[x.name];
		} else if (!x.name && _.keys(bpToPvjsonMappings).indexOf(x) === -1) {
			currentPublicationXref[currentPublicationXrefTag] = x;
		} else if (_.keys(bpToPvjsonMappings).indexOf(x) > -1) {
			currentPublicationXrefTag = null;
		}
	}

	var topLevelGPMLElementStream = new Subject() as Subject<GPMLElement>;
	// TODO the union seems wrong. How do we handle this?
  saxStreamFiltered.subscribe(function(x: GPMLElement & string) {
    if (!!x.name) {
      currentTagName = x.name;
    }

    if ((tagNamesForTargetElements.indexOf(x) > -1 ||
         tagNamesForTargetElements.indexOf(x.name) > -1) &&
           tagNamesForTargetElements.indexOf(currentTargetElement.name) > -1) {
      topLevelGPMLElementStream.next(currentTargetElement);
      currentTargetElement = {} as GPMLElement;

      currentNestedTargetElements.forEach(function(currentNestedTargetElement) {
        currentNestedTargetElement.attributes.Color = {};
        currentNestedTargetElement.attributes.Color.name = 'Color';
        currentNestedTargetElement.attributes.Color.value =
          lastTargetElement.attributes.Color.value;

        currentNestedTargetElement.attributes.GraphRef = {};
        currentNestedTargetElement.attributes.GraphRef.name = 'GraphRef';
        currentNestedTargetElement.attributes.GraphRef.value =
          lastTargetElement.attributes.GraphId.value;

        currentNestedTargetElement.attributes.ZOrder = {};
        currentNestedTargetElement.attributes.ZOrder.name = 'ZOrder';
        currentNestedTargetElement.attributes.ZOrder.value =
          lastTargetElement.attributes.ZOrder.value + 0.1;

				topLevelGPMLElementStream.next(currentNestedTargetElement);
      });
      currentNestedTargetElements = [];
    }

    if (tagNamesForTargetElements.indexOf(x.name) > -1) {
      if (x.name !== 'Pathway') {
        x = ensureGraphIdExists(x);
      } else if (x.name === 'Pathway') {
        var attributes = x.attributes;
        var xmlns = attributes.xmlns.value;

        if (gpmlUtilities.supportedNamespaces.indexOf(xmlns) === -1) {
          // test for whether file is GPML
					// TODO do we need to destroy saxStreamFiltered?
          const message = 'Pvjs does not support the data format provided. ' +
            'Please convert to valid GPML and retry.';
					topLevelGPMLElementStream.error(message);
        } else if (gpmlUtilities.supportedNamespaces.indexOf(xmlns) !== 0) {
          // test for whether the GPML file version matches the latest version
          // (only the latest version will be supported by pvjs).
          // TODO call the Java RPC updater or in some other way call for the file to be updated.
					// TODO do we need to destroy saxStreamFiltered?
          const message = 'Pvjs may not fully support the version of GPML provided (xmlns: ' +
            xmlns + '). Please convert to the supported version of GPML (xmlns: ' +
            gpmlUtilities.supportedNamespaces[0] + ').';
					topLevelGPMLElementStream.error(message);
        }

        pvjson = {};
        pvjson['@context'] = globalContext;

        pvjson.type = 'Pathway';
        pvjson.elements = [];
      }
      currentTargetElement = x;
    } else if (tagNamesForSupplementalElementsWithAttributes.indexOf(x.name) > -1) {
      _.merge(currentTargetElement.attributes, x.attributes);
    } else if (tagNamesForNestedTargetElements.indexOf(x.name) > -1) {
      x = ensureGraphIdExists(x);
      currentNestedTargetElements.push(x);
    } else if (tagNamesForNestedSupplementalElements.indexOf(x.name) > -1) {
      currentTargetElement.attributes[x.name] = currentTargetElement.attributes[x.name] || {};
      currentTargetElement.attributes[x.name].name = x.name;
      currentTargetElement.attributes[x.name].value =
        currentTargetElement.attributes[x.name].value || [];
      currentTargetElement.attributes[x.name].value.push(x);
    } else if (tagNamesForSupplementalElementsWithText.indexOf(currentTagName) > -1 &&
               !x.name &&
                 currentTagName !== x) {
      currentTargetElement.attributes = currentTargetElement.attributes || {};
      currentTargetElement.attributes['gpml:' + currentTagName] =
        currentTargetElement.attributes['gpml:' + currentTagName] || {};
      currentTargetElement.attributes['gpml:' + currentTagName].name = 'gpml:' + currentTagName;
      currentTargetElement.attributes['gpml:' + currentTagName].value =
        currentTargetElement.attributes['gpml:' + currentTagName].value || [];
      currentTargetElement.attributes['gpml:' + currentTagName].value.push(x);
    } else if (x.name === 'bp:PublicationXref' || currentPublicationXref) {
			BioPAX(x);
    }

    if (x === 'Pathway') {
      topLevelGPMLElementStream.complete();
    }
  });

	let pvjsonStream = topLevelGPMLElementStream
		.do(function(element: GPMLElement) {
			element = XmlElement.applyDefaults(element);
			if (tagNamesForTargetElements.indexOf(element.name) > -1) {
				lastTargetElement = element;
			}
			var pvjsonElement = (element.name !== 'Pathway') ? {} : pvjson;
			pvjson = XmlElement.toPvjson({
				pvjson: pvjson,
				// TODO is this union below correct?
				pvjsonElement: pvjsonElement as PvjsonElement & Pvjson,
				gpmlElement: element
			});
		})
		.last()
		.map(function(gpmlElement: GPMLElement): Pvjson {
			return pvjson;
		})
		.map(function(pvjson: Pvjson) {
			// Update all groups, now that the rest of the elements have all been converted.
			pvjson.elements = _.filter(pvjson.elements, function(element) {
				return element['gpml:element'] !== 'gpml:Group';
			})
			.concat(
				_.filter(pvjson.elements, function(element) {
					return element['gpml:element'] === 'gpml:Group';
				})
				.map(function(group) {
					// Note that a group returned from Group.toPvjson() can be null if the group is empty.
					return Group.toPvjson(pvjson, group);
				})
				.filter(function(group) {
					return !!group;
				})
				.map(function(group) {
					var containsEdge = group.contains.reduce(function(accumulator, item) {
						var isEdge = utils.isType(utils.biopax.edgeTypes, item.type);
						accumulator = accumulator || isEdge;
						return accumulator;
					}, false);
					if (!containsEdge) {
						// TODO is this warranted?
						group.type = 'Complex';
					}
					return group;
				})
				.map(function(group) {
					group.contains = group.contains
						.map(function(element) {
							return element.id;
						});
					return group;
				})
			);

			// GroupRef attributes are initially represented as pvjson properties like this:
			// "gpml:GroupRef": GroupId value
			// Once all the elements have been converted to pvjson, these properties are
			// removed in Group.toPvjson(), being replaced with
			// "isPartOf": GraphId value
			//
			// Some GPML files have a GroupRef attribute referencing a GroupId for a non-existent
			// Group element. The "gpml:GroupRef":GroupId properties resulting from such GroupRef
			// attributes need to be removed below, because Group.toPvjson will not run for these
			// elements.
			//
			// Remove all remaining gpml:GroupRef properties.
			pvjson.elements.filter(function(element) {
				return element.hasOwnProperty('gpml:GroupRef');
			})
			.forEach(function(element) {
				delete element['gpml:GroupRef'];
			});

			var edges = pvjson.elements.filter(function(element) {
				// The check for gpml:Point is a hack so we don't get an error for not having it
				// because we've already deleted it when it runs more than once for the same edge.
				return (element['gpml:element'] === 'gpml:Interaction' ||
									element['gpml:element'] === 'gpml:GraphicalLine') &&
								element.hasOwnProperty('gpml:Point');
			})
			.map(function(edge) {
				edge = Point.toPvjson({
					pvjson: pvjson,
					pvjsonElement: edge
				});

				delete edge['gpml:Point'];
				return edge;
			});

			var interactions = edges.filter(function(element) {
				return element['gpml:element'] === 'gpml:Interaction';
			})
			.map(function(edge) {
				return Interaction.toPvjson({
					pvjson: pvjson,
					pvjsonElement: edge
				});
			});

			interactions.filter(function(interaction) {
				return interaction.type === 'Catalysis';
			})
			.map(function(catalysis) {
				var controlled: Controlled = utils.dereferenceElement(pvjson.elements, catalysis.controlled);
				var controller: Controller = utils.dereferenceElement(pvjson.elements, catalysis.controller);

				if (!utils.isBiopaxType(utils.biopax.nodeTypes, controller.type)) {
					// If the controller is not a Pathway or PhysicalEntity,
					// we make this interaction generic, because it's not a valid
					// Catalysis.

					if (controller['gpml:Type'] === 'Group') {
						controller.type = 'Complex';
					} else {
						convertCatalysisToGenericInteraction(catalysis);
					}
				}

				// If it's still a Catalysis, we need to make the controlled be a Conversion.
				if (catalysis.type === 'Catalysis' &&
						utils.isType(['Interaction'], controlled.type)) {
					controlled.type = 'Conversion';
					var participants = controlled.participant;
					if (_.isArray(participants) && participants.length >= 2) {
						controlled.left = participants[0];
						controlled.right = participants[1];
						delete controlled.participant;
					} else {
						convertConversionToGenericInteraction(controlled);
						convertCatalysisToGenericInteraction(catalysis);
					}
				}
			});

			if (!pathwayIri) {
				pathwayIri = encodeURI('http://wikipathways.org/index.php/Special:SearchPathways?query=' +
															 pvjson.standardName + '&species=' + pvjson.organism +
																 '&doSearch=1');
			}
			var localContext = {};
			localContext['@base'] = pathwayIri + '/';
			pvjson['@context'].push(localContext);

			delete pvjson['gpml:element'];

			return pvjson;
		});

  // TODO
  // * Comments
  // * Better handling of x,y for anchors

	return sourceStream
	.let(function(o) {
		o.subscribe(function(x) {
			saxStream.write(x);
		}, function(err) {
			// TODO is this how we want to handle errors?
			saxStream.emit('error', err);
			topLevelGPMLElementStream.error(err);
			saxStream.end();
			throw err;
		}, function() {
			saxStream.end();
		});
		
		return pvjsonStream;
	});
};
