import "source-map-support/register";
// TODO should I get rid of the lib above for production browser build?

import {
  assign,
  camelCase,
  concat,
  curry,
  find,
  flatten,
  fromPairs,
  indexOf,
  pullAt,
  sortBy,
  toPairs,
  toPairsIn
} from "lodash/fp";
import { arrayify, unionLSV } from "./gpml-utilities";

import * as GPML2013aKeyMappings from "./GPML2013aKeyMappings.json";
import * as GPML2013aValueMappings from "./GPML2013aValueMappings.json";
import * as GPML2013aValueConverters from "./GPML2013aValueConverters";
import * as hl from "highland";
import * as iassign from "immutable-assign";

iassign.setOption({
  // Deep freeze both input and output. Used in development to make sure they don't change.
  // TODO watch issue and re-enable when addressed: https://github.com/engineforce/ImassignM/issues/11
  //freeze: true,
  ignoreIfNoChange: true
});

function liftProperties(target, source) {
  return assign(target, source);
}

export function processKV(gpmlElement, [gpmlKey, gpmlValue]) {
  const pvjsonKey = GPML2013aKeyMappings[gpmlKey];
  // NOTE "pvjson:lift" is for elements like "Graphics", where they
  // are nested in GPML but are merged into the parent in pvjson.

  if (gpmlKey[0] === "_" || pvjsonKey === "pvjson:delete") {
    // NOTE: we don't want to include "private" keys, such as
    // "_exists" or "_namespace".
    return [];
  } else if (pvjsonKey === "pvjson:lift") {
    return toPairsIn(gpmlValue)
      .map(processKV.bind(undefined, gpmlElement))
      .map(flatten);
  } else if (gpmlKey === "Attribute") {
    // NOTE: in GPML, 'Attribute' is an XML *ELEMENT* named "Attribute".
    return toPairs(
      gpmlValue
        .map(function({ Key, Value }) {
          return processKV(gpmlElement, [Key, Value]);
        })
        .reduce(function(acc, [[processedKey, processedValue]]) {
          // NOTE: this looks more complicated than it needs to be,
          // but it's to handle the case where there are two or more
          // sibling Attribute elements that share the same Key.
          // I don't know of any cases of this in our actual GPML,
          // but the XSD does not require unique Keys for sibling
          // Attributes.
          if (acc.hasOwnProperty(processedKey)) {
            acc[processedKey] = unionLSV(acc[processedKey], processedValue);
          } else {
            acc[processedKey] = processedValue;
          }
          return acc;
        }, {})
    );
  } else {
    // NOTE: jsSafeGPMLKey is for attributes like "Data-Source", because
    // this is not valid JS:
    //   export function Data-Source() {};
    const jsSafeGPMLKey = gpmlKey.replace("-", "");
    const pvjsonValue = GPML2013aValueConverters.hasOwnProperty(jsSafeGPMLKey)
      ? GPML2013aValueConverters[jsSafeGPMLKey](gpmlElement)
      : gpmlValue;
    /* TODO for gpmlValues that are arrays, do we want to recursively descend into and process each array element?
      : isArray(gpmlValue)
        ? gpmlValue.map(function(valueItem) {
            if (!isObject(valueItem) || isArray(valueItem)) {
              return valueItem;
            } else {
              return fromPairs(
                toPairs(valueItem).map(function([key, value]) {
                  return processKV(valueItem, [key, value]);
                })
              );
            }
          })
        : gpmlValue;
		//*/
    // NOTE: not including key/value pairs when the value is missing
    if (["", null, undefined].indexOf(pvjsonValue) === -1) {
      return [
        [
          pvjsonKey || camelCase(gpmlKey),
          GPML2013aValueConverters.hasOwnProperty(jsSafeGPMLKey)
            ? GPML2013aValueConverters[jsSafeGPMLKey](gpmlElement)
            : GPML2013aValueMappings.hasOwnProperty(gpmlKey)
              ? GPML2013aValueMappings[gpmlKey]
              : gpmlValue
        ]
      ];
    } else {
      return [];
    }
  }
}

// see
// https://github.com/PathVisio/pathvisio/blob/3cb194f120de550ef2e102877965bed3c54a6a75/modules/org.pathvisio.core/src/org/pathvisio/core/biopax/BiopaxElement.java#L245
export class GraphIdManager {
  greatestAsInt: number;
  constructor() {
    this.greatestAsInt = parseInt("0xa00", 16);
  }

  generateAndRecord() {
    this.greatestAsInt += 1;
    return this.greatestAsInt.toString(16);
  }

  recordExisting(graphIdAsHex) {
    const { greatestAsInt } = this;
    const graphIdAsInt = parseInt(graphIdAsHex, 16);
    if (graphIdAsInt > greatestAsInt) {
      this.greatestAsInt = graphIdAsInt;
    }
  }
}

export class Processor {
  output: {
    pathway: Pathway;
    entityMap: PvjsonEntityMap;
  };

  outputStream: Highland.Stream<any>;

  graphIdManager: GraphIdManager;

  graphIdsByGraphRef: Record<string, string[]>;
  graphIdsByGroupRef: Record<string, string[]>;

  promisedGraphIdByGroupId: Record<string, Promise<string>>;
  promisedPvjsonEntityByGraphId: Record<string, Promise<PvjsonEntity>>;

  pvjsonEntityStream: Highland.Stream<PvjsonEntity>;
  groupIdToGraphIdStream: Highland.Stream<any>;

  graphIdToZIndex: Record<string, number>;

  constructor() {
    const that = this;

    this.output = {
      pathway: {
        contains: []
      },
      entityMap: {}
    } as {
      pathway: Pathway;
      entityMap: PvjsonEntityMap;
    };

    this.outputStream = hl();
    this.graphIdManager = new GraphIdManager();
    this.graphIdsByGraphRef = {};
    this.graphIdsByGroupRef = {};
    this.promisedGraphIdByGroupId = {};
    this.promisedPvjsonEntityByGraphId = {};
    this.graphIdToZIndex = {};

    const {
      graphIdToZIndex,
      promisedGraphIdByGroupId,
      promisedPvjsonEntityByGraphId,
      graphIdsByGraphRef,
      output,
      outputStream
    } = this;

    const groupIdToGraphIdStream = hl();
    this.groupIdToGraphIdStream = groupIdToGraphIdStream;
    groupIdToGraphIdStream.each(function([groupId, graphId]) {
      promisedGraphIdByGroupId[groupId] = Promise.resolve(graphId);
    });

    const pvjsonEntityStream = hl() as Highland.Stream<PvjsonEntity>;
    this.pvjsonEntityStream = pvjsonEntityStream;

    function insertIfNotExists<T>(list: T[], item: T): T[] {
      if (list.indexOf(item) === -1) {
        list.push(item);
      }
      return list;
    }
    function sortByZIndex(entityIds: string[]): string[] {
      return sortBy(
        [
          function(entityId) {
            return graphIdToZIndex[entityId];
          }
        ],
        entityIds
      );
    }
    const insertAndSort = curry(function(id, entityIds) {
      return sortByZIndex(insertIfNotExists(entityIds, id));
    });

    pvjsonEntityStream.each(function(pvjsonEntity: PvjsonEntity) {
      const { id, isAttachedTo, isPartOf, zIndex } = pvjsonEntity;

      that.output = iassign(
        that.output,
        function(o) {
          return o.entityMap;
        },
        function(entityMap) {
          entityMap[id] = pvjsonEntity;
          return entityMap;
        }
      );

      graphIdToZIndex[id] = zIndex;

      if (!!isAttachedTo) {
        arrayify(isAttachedTo).forEach(function(graphRef: string) {
          const graphRefs = graphIdsByGraphRef[graphRef] || [];
          if (graphRefs.indexOf(id) === -1) {
            graphRefs.push(id);
          }
          graphIdsByGraphRef[graphRef] = graphRefs;
        });
      }

      if (!!isPartOf && that.output.entityMap[isPartOf]) {
        that.output = iassign(
          that.output,
          function(o, ctx: Record<string, any>) {
            return (o.entityMap[ctx.isPartOf] as PvjsonNode).contains;
          },
          insertAndSort(id),
          { isPartOf: isPartOf }
        );

        const pullIndex = indexOf(id, that.output.pathway.contains);
        if (pullIndex > -1) {
          // NOTE: When an entity that is contained by a group appears in the GPML input
          // stream before the group does, we initially return that entity as if it were
          // not in the group, ie., as if it were contained only by the top-level pathway.
          // When the group appears in the stream, we remove any of its contained entities
          // from the top-level pathway and assign them as being contained just by the group.
          // In the end, we want the group, but not its contents, to be listed in
          // "processor.output.pathway.contains", because the contents are implicitly
          // listed by being part of the group, which is listed.
          that.output = iassign(
            that.output,
            function(o) {
              return o.pathway.contains;
            },
            function(contains) {
              return pullAt(pullIndex, contains);
            }
          );
        }
      } else {
        that.output = iassign(
          that.output,
          function(o) {
            return o.pathway.contains;
          },
          function(contains) {
            if (contains.indexOf(id) === -1) {
              contains.push(id);
            }
            return sortBy(
              [
                function(containedEntityId) {
                  return graphIdToZIndex[containedEntityId];
                }
              ],
              contains
            );
          }
        );
      }

      promisedPvjsonEntityByGraphId[id] = Promise.resolve(pvjsonEntity);
      outputStream.write(that.output);
      /*
      const { id, isAttachedTo, isPartOf, zIndex } = pvjsonEntity;
      promisedPvjsonEntityByGraphId[id] = Promise.resolve(pvjsonEntity);
      graphIdToZIndex[id] = zIndex;

      if (!!isAttachedTo) {
        arrayify(isAttachedTo).forEach(function(graphRef: string) {
          graphIdsByGraphRef[graphRef] = graphIdsByGraphRef[graphRef] || [];
          graphIdsByGraphRef[graphRef].push(id);
        });
      }

      that.output = iassign(
        that.output,
        function(o) {
          return o.entityMap;
        },
        function(entityMap) {
          entityMap[id] = pvjsonEntity;
          return entityMap;
        }
      );

      if (isPartOf) {
        that.output = iassign(
          that.output,
          function(o) {
            return o.entityMap[isPartOf];
          },
          function(group: PvjsonNode) {
            return iassign(
              group,
              function(g) {
                return g.contains;
              },
              function(contains) {
                contains.push(id);
                return sortBy(
                  [
                    function(containedEntityId) {
                      return graphIdToZIndex[containedEntityId];
                    }
                  ],
                  contains
                );
              }
            );
          }
        );
      } else {
        that.output = iassign(
          that.output,
          function(o) {
            return o.contains;
          },
          function(contains) {
            contains.push(id);
            return sortBy(
              [
                function(containedEntityId) {
                  return graphIdToZIndex[containedEntityId];
                }
              ],
              contains
            );
          }
        );
      }

      outputStream.write(that.output);
		 //*/
    });

    /*
    endStream.each(function(x) {
      groupIdToGraphIdStream.end();
      pvjsonEntityStream.end();
    });
		//*/
  }

  getByGraphId = graphId => {
    let promisedPvjsonEntity = this.promisedPvjsonEntityByGraphId[graphId];
    if (promisedPvjsonEntity) {
      return promisedPvjsonEntity;
    } else {
      const { pvjsonEntityStream } = this;
      promisedPvjsonEntity = new Promise(function(resolve, reject) {
        pvjsonEntityStream
          .observe()
          .find(pvjsonEntity => pvjsonEntity.id === graphId)
          .errors(reject)
          .each(resolve);
      });

      return promisedPvjsonEntity;
    }
  };

  getByGroupId = targetGroupId => {
    const { getByGraphId, groupIdToGraphIdStream } = this;
    let promisedGraphId = this.promisedGraphIdByGroupId[targetGroupId];
    if (!promisedGraphId) {
      promisedGraphId = this.promisedGraphIdByGroupId[
        targetGroupId
      ] = new Promise(function(resolve, reject) {
        groupIdToGraphIdStream
          .observe()
          .find(([groupId, graphId]) => groupId === targetGroupId)
          .errors(reject)
          .each(function([groupId, graphId]) {
            resolve(graphId);
          });
      });
    }

    return promisedGraphId.then(getByGraphId);
  };

  process = (gpmlElementName, gpmlElement) => {
    const { graphIdManager } = this;
    const { GroupId, GroupRef } = gpmlElement;

    let GraphId = gpmlElement.GraphId;
    // Does the schema allow the element to have a GraphId?
    if (!!GraphId) {
      // Does it actually have one?
      if (GraphId._exists === false) {
        // NOTE: we are making sure that elements that CAN have a GraphId
        // always DO have a GraphId. GraphIds are optional in GPML for Groups,
        // so we will add one if it's not already specified. But Pathway
        // elements never have GraphIds, so we don't add one for them.
        GraphId = gpmlElement.GraphId = graphIdManager.generateAndRecord();
      } else {
        graphIdManager.recordExisting(GraphId);
      }

      if (!!GroupRef && GroupRef._exists !== false) {
        const graphIds = this.graphIdsByGroupRef[GroupRef] || [];
        if (graphIds.indexOf(GraphId) === -1) {
          graphIds.push(GraphId);
        }
        this.graphIdsByGroupRef[GroupRef] = graphIds;
      }

      if (!!GroupId && GroupId._exists !== false) {
        this.groupIdToGraphIdStream.write([GroupId, GraphId]);
      }
    }

    const processed = fromPairs(
      toPairs(gpmlElement).reduce(
        (acc, x) => concat(acc, processKV(gpmlElement, x)),
        []
      )
    );
    processed.type = unionLSV(processed.type, gpmlElementName);

    return processed;
  };
}
