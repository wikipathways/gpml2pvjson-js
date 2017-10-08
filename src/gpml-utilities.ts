import {
  flatten,
  intersection,
  isArray,
  isEmpty,
  isFinite,
  keys,
  map,
  union
} from "lodash";
import { curry, sortBy } from "lodash/fp";
import { intersectsLSV } from "./spinoffs/jsonld-utils";
import {
  Point,
  PvjsonNode,
  PvjsonSingleFreeNode,
  PvjsonBurr,
  PvjsonEdge,
  PvjsonGroup,
  PvjsonEntity,
  AttachablePoint,
  EdgeGraphicsTypePointType
} from "./gpml2pvjson";

export * from "./geom-utils";

// TODO this line conflicts with the section below it
export * from "./spinoffs/jsonld-utils";
export {
  arrayify,
  getValuesLSV,
  intersectsLSV,
  unionLSV
} from "./spinoffs/jsonld-utils";

/*
 * This is needed because PublicationXref rdf:id values and
 * GPML GraphId values are not necessarily mutually exclusive
 * and unique within a given pathway.
 * For example, WP306, version 80308, has rdf:id="d8a" and
 * a DataNode with GraphId="d8a".
 */
export function generatePublicationXrefId(originalId: string) {
  return "publicationXref" + originalId;
}

export const insertIfNotExists = curry(function<T>(item: T, list: T[]): T[] {
  if (list.indexOf(item) === -1) {
    list.push(item);
  }
  return list;
});

export function isAttachablePoint(
  pvjsonPoint: Point | AttachablePoint
): pvjsonPoint is AttachablePoint {
  return pvjsonPoint.hasOwnProperty("attachmentDisplay");
}

export function isDefinedCXML(x: any) {
  // NOTE: we need the array checks to handle cases like this:
  // [ XmlType { _exists: false, _extended: true } ]
  return (
    typeof x !== "undefined" &&
    x._exists !== false &&
    (!isArray(x) || (x.length > 0 && x[0]._exists !== false))
  );
}

export function isPvjsonBurr(entity: PvjsonEntity): entity is PvjsonBurr {
  return intersectsLSV(entity.type, "Burr");
}

export function isPvjsonGroup(entity: PvjsonEntity): entity is PvjsonGroup {
  return (
    entity.hasOwnProperty("contains") && intersectsLSV(entity.type, "Group")
  );
}

export function isPvjsonSingleFreeNode(
  entity: PvjsonEntity
): entity is PvjsonSingleFreeNode {
  return entity.kaavioType === "SingleFreeNode";
}

export function isPvjsonNode(entity: PvjsonEntity): entity is PvjsonNode {
  return ["SingleFreeNode", "Burr", "Group"].indexOf(entity.kaavioType) > -1;
  /*
  return (
    entity.hasOwnProperty("x") &&
    entity.hasOwnProperty("y") &&
    entity.hasOwnProperty("width") &&
    entity.hasOwnProperty("height")
  );
	//*/
}

export function isPvjsonEdge(entity: PvjsonEntity): entity is PvjsonEdge {
  return entity.hasOwnProperty("points");
}

export function isPvjsonEdgeOrBurr(
  entity: PvjsonEntity
): entity is PvjsonEdge | PvjsonBurr {
  return isPvjsonEdge(entity) || isPvjsonBurr(entity);
}

export function isGPMLAnchor(entity: PvjsonEntity): entity is PvjsonBurr {
  return entity.gpmlElementName === "Anchor";
}

export const sortByMap = curry(function(
  mapToSortBy: Record<string, number>,
  listToSort: string[]
): string[] {
  return sortBy(function(listItem) {
    return mapToSortBy[listItem];
  }, listToSort);
});

export const supportedNamespaces = [
  "http://pathvisio.org/GPML/2013a",
  "http://genmapp.org/GPML/2010a",
  "http://genmapp.org/GPML/2008a",
  "http://genmapp.org/GPML/2007"
];
