/// <reference path="../gpml2pvjson.d.ts" />
/// <reference path="../spinoffs/json.d.ts" />

import { isPvjsonEdge, unionLSV } from "../gpml-utilities";
import { PvjsonEntity, PvjsonNode } from "../gpml2pvjson";

// TODO this isn't worth much. It also overlaps in purpose with the
// process function below.
export const GPML2013aGroupStyleToBioPAX = {
  None: "Pathway",
  Group: "Pathway",
  Complex: "Complex",
  Pathway: "Pathway"
};

export function process(
  containedEntities: PvjsonEntity[],
  group: PvjsonNode
): PvjsonNode {
  // NOTE: Making the result BioPAX-compliant. To the best of my understanding,
  // BioPAX says there are only two groups types: Complex and Pathway.
  // If it contains an edge, it's a Pathway. Otherwise, it's a Complex.
  const containsEdge = containedEntities.reduce(function(accumulator, entity) {
    // NOTE: determining whether group contains an edge, so this expression
    // should (eventually) return true, even if there are several nodes and
    // just one edge
    accumulator = accumulator || isPvjsonEdge(entity);
    return accumulator;
  }, false);

  if (containsEdge) {
    group.type = (unionLSV(group.type, "Pathway") as string[]).filter(
      entity => entity !== "Complex"
    );
  } else {
    group.type = (unionLSV(group.type, "Complex") as string[]).filter(
      entity => entity !== "Pathway"
    );
  }

  return group;
}
