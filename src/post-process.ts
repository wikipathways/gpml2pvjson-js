/// <reference path="../gpml2pvjson.d.ts" />

import {arrayify, unionLSV} from './gpml-utilities';
import {omit, partition, values} from 'lodash';
import {processPointAttributes, postProcess as postProcessEdge} from './edge';
import {postProcess as postProcessGroup} from './group';
import {postProcess as postProcessInteraction} from './interaction';
import {wpTypes2BiopaxTypes} from './data-node';
import {EDGES, NODES} from './toPvjson';

const GPML_ELEMENT_NAME_TO_PVJSON_TYPE = {
	'DataNode': 'Node',
	'Shape': 'Node',
	'Label': 'Node',
	'Anchor': 'Burr',
	'State': 'Burr',
	'BiopaxRef': 'Citation',
	'Group': 'Group',
	'Interaction': 'Edge',
	'GraphicalLine': 'Edge',
};

function upsertDataMapEntry(dataMap, element: DataElement): void {
	dataMap[element.id] = element;
}

export function postProcess(data: Data) {
	let elementMap = data.elementMap;
	const elements = values(elementMap);
	const elementCount = elements.length;

	function getFromElementMapByIdIfExists(acc, id: string) {
		const element = elementMap[id];
		if (element) {
			acc.push(element);
		}
		return acc;
	}

	data.PublicationXref
		.reduce(getFromElementMapByIdIfExists, [])
		.sort(function(a, b) {
			const yearA = parseInt(a.year);
			const yearB = parseInt(b.year);
			if (yearA > yearB) {
				return 1;
			} else if (yearA < yearB) {
				return -1;
			} else {
				return 0;
			}
		})
		.map(function(publicationXref, i) {
			publicationXref.displayName = String(i + 1);
			return publicationXref;
		})
		.forEach(upsertDataMapEntry.bind(undefined, elementMap));

	// Process all edges.
	EDGES
		.reduce(function(acc, gpmlElementName) {
			data[gpmlElementName].forEach(function(el) {
				acc.push(el);
			});
			return acc;
		}, [])
		.reduce(getFromElementMapByIdIfExists, [])
		.map(processPointAttributes.bind(undefined, data))
		.forEach(upsertDataMapEntry.bind(undefined, elementMap));

	data.State
		.reduce(getFromElementMapByIdIfExists, [])
		.map(function(element) {
			let referencedElement = elementMap[<string>element.isAttachedTo];

			/* NOTE probably going to save this step for the render stage
			const referencedElementCenterX = referencedElement.x + referencedElement.width / 2;
			const referencedElementCenterY = referencedElement.y + referencedElement.height / 2;

			const elementCenterX = referencedElementCenterX +	element['gpml:RelX'] * referencedElement.width / 2;
			const elementCenterY = referencedElementCenterY +	element['gpml:RelY'] * referencedElement.height / 2;

			element.x = elementCenterX - element.width / 2;
			element.y = elementCenterY - element.height / 2;
		 	//*/

			// NOTE: this makes some assumptions about the distribution of ZOrder values in GPML
			element.zIndex = element.hasOwnProperty('zIndex') ? element.zIndex : referencedElement.zIndex + 1 / elementCount;

			// NOTE side effects
			referencedElement.burrs = referencedElement.burrs || [];
			referencedElement.burrs.push(element.id);
			upsertDataMapEntry(elementMap, referencedElement);

			return omit(element, ['gpml:RelX', 'gpml:RelY']);
		})
		.forEach(upsertDataMapEntry.bind(undefined, elementMap));

	data.Anchor
		.reduce(getFromElementMapByIdIfExists, [])
		.map(function(element) {
			let referencedElement = elementMap[<string>element.isAttachedTo];

			// NOTE: this makes some assumptions about the distribution of ZOrder values in GPML
			element.zIndex = element.hasOwnProperty('zIndex') ? element.zIndex : referencedElement.zIndex + 1 / elementCount;

			// NOTE side effects
			referencedElement.burrs = referencedElement.burrs || [];
			referencedElement.burrs.push(element.id);
			upsertDataMapEntry(elementMap, referencedElement);
			return element;
		})
		.forEach(upsertDataMapEntry.bind(undefined, elementMap));

	// Kludge to get the zIndex for Groups
	const zIndexForGroups = -1 + EDGES.concat(['DataNode', 'Label'])
		.reduce(function(acc, gpmlElementName) {
			data[gpmlElementName].forEach(function(el) {
				acc.push(el);
			});
			return acc;
		}, [])
		.reduce(getFromElementMapByIdIfExists, [])
		.map(element => element.zIndex)
		.reduce(function(acc, zIndex) {
			return Math.min(acc, zIndex);
		}, Infinity);

	// specify contained elements in groups
	data.Group
		.reduce(getFromElementMapByIdIfExists, [])
		.map(function(element) {
			element.zIndex = zIndexForGroups;

			// NOTE: pvjson doesn't use GroupId. It just uses GraphId as the id for an element.
			// That means:
			//   GPML GroupId is replaced in pvjson by just id (from GraphId), and
			//   GPML GroupRef is replaced in pvjson by element.isPartOf and group.contains (from GraphRef)
			// We need to map from GroupId/GroupRef to id/contains/isPartOf here.
			// element.id refers to the value of the GraphId of the Group
			const groupGraphId = element.id;
			const containedIds = element.contains = data.containedIdsByGroupId[data.GraphIdToGroupId[groupGraphId]] || [];

			if (containedIds.length > 0) {
				// NOTE side effects
				containedIds
					.reduce(getFromElementMapByIdIfExists, [])
					.map(function(contained) {
						contained.isPartOf = groupGraphId;
						return contained;
					})
					.forEach(upsertDataMapEntry.bind(undefined, elementMap));
			} else {
				// NOTE: side effect
				delete elementMap[groupGraphId];
			}

			return element;
		})
		.forEach(upsertDataMapEntry.bind(undefined, elementMap));

	let dependentIds = [];

	const independenceTests = [
		function(element) {
			return element.gpmlElementName !== 'Group' &&
				(
					!element.hasOwnProperty('isAttachedTo') ||
					!arrayify(element.isAttachedTo)
						.reduce(getFromElementMapByIdIfExists, [])
						.filter(el => ['Group', 'Interaction', 'GraphicalLine'].indexOf(el.gpmlElementName) === -1)
						.length
				);
		},
		function(element) {
			const gpmlElementName = element.gpmlElementName;
			if (EDGES.concat(['State']).indexOf(gpmlElementName) > -1) {
				// independent when edge or state not attached to a dependent
				return !arrayify(element.isAttachedTo)
					.reduce(getFromElementMapByIdIfExists, [])
					.filter(el => dependentIds.indexOf(el.id) > -1)
					.length;
			} else if (gpmlElementName === 'Group') {
				// independent when group does not contain a dependent
				return !arrayify(element.contains)
					.reduce(getFromElementMapByIdIfExists, [])
					.filter(el => dependentIds.indexOf(el.id) > -1)
					.length;
			}
		},
	];
	const testCount = independenceTests.length;

	function processDependent(acc, element, i) {
		const testIndex = acc.testIndex;
		let independents = acc.independents;
		let dependents = acc.dependents;
		const lastDependentCount = dependents.length;

		let [newIndependents, remainingDependents] = partition(dependents, independenceTests[testIndex]);
		acc.dependents = remainingDependents;

		newIndependents.forEach(function(independent) {
			const gpmlElementName = independent.gpmlElementName;
			const kaavioType = independent.kaavioType = GPML_ELEMENT_NAME_TO_PVJSON_TYPE[gpmlElementName];
			independent.type = unionLSV(independent.type, independent.gpmlElementName, independent.wpType, kaavioType) as string[];

			if (EDGES.indexOf(gpmlElementName) > -1) {
				independent = postProcessEdge(data, independent);
				if (gpmlElementName === 'Interaction') {
					independent = postProcessInteraction(data, independent);
				}
				independents.push(independent);
				upsertDataMapEntry(elementMap, independent);
			} else if (NODES.concat('Anchor').indexOf(gpmlElementName) > -1) {
				independent.fontFamily = independent.fontFamily || 'Arial';
				independent.textAlign = independent.textAlign || 'center';
				independent.verticalAlign = independent.verticalAlign || 'top';
				//return omit(independent, ['relX', 'relY']);
				if (gpmlElementName === 'DataNode') {
					// Convert GPML DataNode Type to a term from the GPML or BioPAX vocabulary,
					// using a Biopax class when possible (like biopax:Protein),
					// but otherwise using a GPML class.
					const wpType = independent.wpType;
					const biopaxType = wpTypes2BiopaxTypes[wpType] || 'PhysicalEntity';
					independent.type = unionLSV(independent.type, wpType, 'biopax:' + biopaxType) as string[];
					independents.push(independent);
				} else if (gpmlElementName === 'Group') {
					const containedIds = independent.contains;
					// GPML shouldn't have empty groups, but PathVisio-Java
					// has a bug that sometimes results in empty groups, so
					// we only push if the group is not empty.
					if (containedIds.length > 0) {
						independent = postProcessGroup(data, independent);
						independents.push(independent);
						upsertDataMapEntry(elementMap, independent);
					}
				} else {
					independents.push(independent);
					upsertDataMapEntry(elementMap, independent);
				}
			} else if (gpmlElementName === 'BiopaxRef') {
				independents.push(independent);
				upsertDataMapEntry(elementMap, independent);
			} else {
				console.error(independent);
				throw new Error('Reached unexpected state in processing element above');
			}
		});

	  dependentIds = remainingDependents.map(d => d.id);
		const dependentCount = remainingDependents.length;
		if ((i < elementCount - 1) || dependentCount === 0) {
			return acc;
		} else {
			if (dependentCount === lastDependentCount) {
				if (testIndex < testCount) {
					acc.testIndex += 1;
				} else {
					throw new Error('Unexpected state reached when processing dependents');
				}
			}
			return remainingDependents.reduce(processDependent, acc);
		}
	}

	data.elements = elements
		.reduce(processDependent, {
			independents: [],
			dependents: elements,
			testIndex: 0,
		})
		.independents;
	
	return data;
}
