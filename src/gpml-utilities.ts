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
import { intersectsLSV } from "./jsonld-utils";

export * from "./geom-utils";
export * from "./jsonld-utils";

export {
  arrayify,
  getValuesLSV,
  intersectsLSV,
  unionLSV
} from "./jsonld-utils";

export function augmentErrorMessage(err: Error, message: string): Error {
  err.message = (err.message || "") + message;
  return err;
}

/*
 * This is needed because PublicationXref rdf:id values and
 * GPML GraphId values are not necessarily mutually exclusive
 * and unique within a given pathway.
 * For example, WP306, version 80308, has rdf:id="d8a" and
 * a DataNode with GraphId="d8a".
 */
export function generatePublicationXrefId(originalId: string) {
  return "PublicationXref" + originalId;
}

export const insertIfNotExists = curry(function<T>(item: T, list: T[]): T[] {
  if (list.indexOf(item) === -1) {
    list.push(item);
  }
  return list;
});

export function isPvjsonBurr(entity: PvjsonEntity): entity is PvjsonBurr {
  return intersectsLSV(entity.type, "Burr");
}

export function isPvjsonGroup(entity: PvjsonEntity): entity is PvjsonNode {
  return (
    entity.hasOwnProperty("contains") && intersectsLSV(entity.type, "Group")
  );
}

export function isPvjsonEdge(entity: PvjsonEntity): entity is PvjsonEdge {
  return entity.hasOwnProperty("points");
}

export function isPvjsonNode(entity: PvjsonEntity): entity is PvjsonNode {
  return (
    entity.hasOwnProperty("x") &&
    entity.hasOwnProperty("y") &&
    entity.hasOwnProperty("width") &&
    entity.hasOwnProperty("height")
  );
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
