import "source-map-support/register";
// TODO should I get rid of the lib above for production browser build?

import {
  assign,
  camelCase,
  concat,
  curry,
  defaultsDeep,
  find,
  flow,
  fromPairs,
  indexOf,
  isObject,
  isString,
  map,
  omit,
  pullAt,
  toPairs,
  toPairsIn
} from "lodash/fp";
import { defaultsDeep as defaultsDeepM } from "lodash";
import {
  arrayify,
  insertIfNotExists,
  isPvjsonEdge,
  sortByMap,
  unionLSV
} from "./gpml-utilities";

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

const VALUES_TO_SKIP = ["", null, undefined];

export const processKV = curry(function(
  gpmlElement,
  [gpmlKey, gpmlValue]
): [string, any][] {
  if (VALUES_TO_SKIP.indexOf(gpmlValue) > -1) {
    return [];
  }
  const pvjsonKey = GPML2013aKeyMappings[gpmlKey];
  // NOTE "pvjson:lift" is for elements like "Graphics", where they
  // are nested in GPML but are merged into the parent in pvjson.

  if (
    gpmlKey[0] === "_" ||
    pvjsonKey === "pvjson:delete" ||
    (isObject(gpmlValue) && gpmlValue._exists === false)
  ) {
    // NOTE: we don't want to include "private" keys, such as
    // "_exists" or "_namespace".
    return [];
  } else if (pvjsonKey === "pvjson:lift") {
    return toPairsIn(gpmlValue).reduce(
      (acc, x) => concat(acc, processKV(gpmlElement, x)),
      []
    );
  } else if (gpmlKey === "Attribute") {
    // NOTE: in GPML, 'Attribute' is an XML *ELEMENT* named "Attribute".
    return toPairs(
      gpmlValue
        // NOTE: some attributes have empty values and will cause problems
        // if we don't use this filter to skip them.
        .filter(({ Key, Value }) => VALUES_TO_SKIP.indexOf(Value) === -1)
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
    // NOTE: we don't include key/value pairs when the value is missing
    if (VALUES_TO_SKIP.indexOf(pvjsonValue) === -1) {
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
});

/* pvjson: "id" is a required property.
 * GPML2013a: GraphId is sometimes optional, e.g., for Groups or Anchors.
 * GPML2017: supposed to make GraphId required.
 *
 * When converting GPML2013a, we fill in any missing GraphIds so that any
 * element that MAY have a GraphId DOES have one.
 * If the GraphId is already specified, we don't change it.
 * If it is not specified, we want to generate one with these properties:
 *   1) Stability/Purity: you can convert the same GPML file any number of times
 *      and always get the same pvjson output.
 *   2) Uniqueness: don't clobber an existing GraphId in the pathway.
 *
 *   The PathVisio algorithm for GraphId generation is basically:
 *
 *   GraphId = RandomValue + IncrementingValue
 *
 *   where IncrementingValue is generated by starting with a hex value of
 *   "0xa00" for the first GraphId and incrementing that value for each
 *   subsequent GraphId:
 *   https://github.com/PathVisio/pathvisio/blob/3cb194f120de550ef2e102877965bed3c54a6a75/modules/org.pathvisio.core/src/org/pathvisio/core/biopax/BiopaxElement.java#L245
 *
 *   We want a stable output, so instead of using a random value, we use the
 *   namespace "pvjsgeneratedid", and since that's a string, we must append
 *   the IncrementingValue instead of adding it:
 *
 *   GraphId = "pvjsgeneratedid" + IncrementingValue
 */
export class GraphIdManager {
  incrementingValueAsInt: number;
  namespace: string = "pvjsgeneratedid";
  constructor() {
    this.incrementingValueAsInt = parseInt("0xa00", 16);
  }

  generateAndRecord(): string {
    this.incrementingValueAsInt += 1;
    // NOTE: the namespace is not part of incrementingValueAsInt
    return this.namespace + this.incrementingValueAsInt.toString(16);
  }

  recordExisting(graphIdAsHex) {
    const { incrementingValueAsInt } = this;
    const graphIdAsInt = parseInt(graphIdAsHex, 16);
    // NOTE: this graphIdAsInt does not refer to exactly the same thing as PathVisio's
    // IncrementingValue, because it's the sum of RandomValue and IncrementingValue.
    if (graphIdAsInt > incrementingValueAsInt) {
      this.incrementingValueAsInt = graphIdAsInt;
    }
  }
}

export class Processor {
  output: {
    pathway: Pathway;
    entityMap: PvjsonEntityMap;
  } = {
    pathway: {
      contains: [],
      height: 0,
      width: 0,
      organism: "Homo Sapiens",
      name: "New Untitled Pathway",
      type: ["Pathway"]
    },
    entityMap: {}
  };

  outputStream: Highland.Stream<any> = hl();

  graphIdManager: GraphIdManager = new GraphIdManager();

  graphIdsByGraphRef: Record<string, string[]> = {};
  graphIdsByGroup: Record<string, string[]> = {};

  promisedGraphIdByGroupId: Record<string, Promise<string>> = {};
  promisedGPMLElementByGraphId: Record<string, Promise<GPMLElement>> = {};
  promisedPvjsonEntityByGraphId: Record<string, Promise<PvjsonEntity>> = {};

  gpmlElementStream: Highland.Stream<GPMLElement> = hl();
  pvjsonEntityStream: Highland.Stream<PvjsonEntity> = hl();
  groupIdToGraphIdStream: Highland.Stream<any> = hl();

  graphIdToZIndex: Record<string, number> = {};

  constructor(pathwayIri?: string) {
    const that = this;
    if (pathwayIri) {
      that.output.pathway.id = pathwayIri;
    }

    const {
      graphIdToZIndex,
      promisedGraphIdByGroupId,
      promisedPvjsonEntityByGraphId,
      promisedGPMLElementByGraphId,
      graphIdsByGraphRef,
      output,
      outputStream,
      groupIdToGraphIdStream,
      pvjsonEntityStream,
      gpmlElementStream
    } = this;

    const sortByZIndex = sortByMap(graphIdToZIndex);

    groupIdToGraphIdStream.each(function([groupId, graphId]) {
      promisedGraphIdByGroupId[groupId] = Promise.resolve(graphId);
    });

    gpmlElementStream.each(function(gpmlElement) {
      promisedGPMLElementByGraphId[gpmlElement.GraphId] = Promise.resolve(
        gpmlElement
      );
    });

    pvjsonEntityStream.each(function(pvjsonEntity: PvjsonNode | PvjsonEdge) {
      const { id, isAttachedTo, isPartOf, zIndex } = pvjsonEntity;

      graphIdToZIndex[id] = zIndex;
      promisedPvjsonEntityByGraphId[id] = Promise.resolve(pvjsonEntity);

      const insertEntityIdAndSortByZIndex = flow([
        insertIfNotExists(id),
        sortByZIndex
      ]);

      if (!!isAttachedTo) {
        arrayify(isAttachedTo).forEach(function(graphRef: string) {
          const graphRefs = graphIdsByGraphRef[graphRef] || [];
          if (graphRefs.indexOf(id) === -1) {
            graphRefs.push(id);
          }
          graphIdsByGraphRef[graphRef] = graphRefs;
        });
      }

      if (!!isPartOf) {
        that.getByGraphId(isPartOf).then(
          function(group: PvjsonNode) {
            const { x, y } = group;
            if (isPvjsonEdge(pvjsonEntity)) {
              pvjsonEntity.points = map(pvjsonEntity.points, function(point) {
                point.x -= x;
                point.y -= y;
                return point;
              });
            } else if (pvjsonEntity.hasOwnProperty("x")) {
              pvjsonEntity.x -= x;
              pvjsonEntity.y -= y;
            } else {
              console.error(pvjsonEntity);
              throw new Error(
                "Unexpected entity (logged above) found in group"
              );
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

            that.output = iassign(
              that.output,
              function(o, ctx: Record<string, any>) {
                return (o.entityMap[ctx.isPartOf] as PvjsonNode).contains;
              },
              insertEntityIdAndSortByZIndex,
              { isPartOf: isPartOf }
            );
            outputStream.write(that.output);
          },
          function(err) {
            throw err;
          }
        );
      } else {
        that.output = iassign(
          that.output,
          function(o) {
            return o.pathway.contains;
          },
          insertEntityIdAndSortByZIndex
        );

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

        outputStream.write(that.output);
      }
    });

    /*
		TODO do we need this?
    endStream.each(function(x) {
      groupIdToGraphIdStream.end();
      pvjsonEntityStream.end();
    });
		//*/
  }

  getGraphIdByGroupId = targetGroupId => {
    let promisedGraphId = this.promisedGraphIdByGroupId[targetGroupId];
    if (promisedGraphId) {
      return promisedGraphId;
    } else {
      const { groupIdToGraphIdStream } = this;
      // NOTE: we don't need to set the cache here, because the cache is
      // set for every item that flows through groupIdToGraphIdStream
      promisedGraphId = new Promise(function(resolve, reject) {
        groupIdToGraphIdStream
          .observe()
          .find(([groupId, graphId]) => groupId === targetGroupId)
          .map(([groupId, graphId]) => graphId)
          .errors(reject)
          .each(resolve);
      });

      return promisedGraphId;
    }
  };

  getByGraphId = graphId => {
    let promisedPvjsonEntity = this.promisedPvjsonEntityByGraphId[graphId];
    if (promisedPvjsonEntity) {
      return promisedPvjsonEntity;
    } else {
      const { pvjsonEntityStream } = this;
      // NOTE: we don't need to set the cache here, because the cache is
      // set for every item that flows through pvjsonEntityStream
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

  getGPMLElementByGraphId = graphId => {
    let promisedGPMLElement = this.promisedGPMLElementByGraphId[graphId];
    if (promisedGPMLElement) {
      return promisedGPMLElement;
    } else {
      const { gpmlElementStream } = this;
      // NOTE: we don't need to set the cache here, because the cache is
      // set for every item that flows through gpmlElementStream
      promisedGPMLElement = new Promise(function(resolve, reject) {
        gpmlElementStream
          .observe()
          .find(gpmlElement => gpmlElement.GraphId === graphId)
          .errors(reject)
          .each(resolve);
      });

      return promisedGPMLElement;
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

  processProperties = curry((gpmlElement: GPMLElement): PvjsonEntity => {
    return fromPairs(
      toPairs(gpmlElement).reduce(
        (acc, x) => concat(acc, processKV(gpmlElement, x)),
        []
      )
    );
  });

  processPropertiesAndAddType = curry(
    (gpmlElementName: string, gpmlElement: GPMLElement): PvjsonEntity => {
      const processed = this.processProperties(gpmlElement);
      processed.type = unionLSV(processed.type, gpmlElementName);
      return processed;
    }
  );

  ensureGraphIdExists = (gpmlElement: GPMLElement): GPMLElement => {
    const { graphIdManager } = this;
    const { GroupId } = gpmlElement;
    let { GraphId } = gpmlElement;

    // TODO does this work for all elements? Are there any that we give an id that don't have one in GPML?
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

      if (!!GroupId && GroupId._exists !== false) {
        this.groupIdToGraphIdStream.write([GroupId, GraphId]);
      }
    }

    return gpmlElement;
  };

  fixGroupRefs = (gpmlElement: GPMLElement): Highland.Stream<GPMLElement> => {
    const that = this;
    const { groupIdToGraphIdStream } = this;
    const { GraphId, GroupId, GroupRef } = gpmlElement;
    return !!GroupRef && GroupRef._exists !== false
      ? hl(this.getGraphIdByGroupId(GroupRef)).map(function(graphIdOfGroup) {
          // NOTE: side effect
          gpmlElement.GroupRef = graphIdOfGroup;
          // NOTE: side effect
          that.graphIdsByGroup[graphIdOfGroup] = unionLSV(
            that.graphIdsByGroup[graphIdOfGroup],
            GraphId
          ) as string[];
          return gpmlElement;
        })
      : !!GroupId && GroupId._exists !== false
        ? hl(this.getGraphIdByGroupId(GroupId)).map(x => gpmlElement)
        : hl([gpmlElement]);
  };

  preprocessGPMLElement = (
    gpmlElement: GPMLElement
  ): Highland.Stream<GPMLElement> => {
    const { ensureGraphIdExists, fixGroupRefs, gpmlElementStream } = this;

    return hl([gpmlElement])
      .map(ensureGraphIdExists)
      .flatMap(fixGroupRefs)
      .doto(function(processedGPMLElement) {
        gpmlElementStream.write(processedGPMLElement);
      });
  };

  processAsync = curry((gpmlElementName: string, gpmlElement) => {
    const { preprocessGPMLElement, processPropertiesAndAddType } = this;

    return preprocessGPMLElement(gpmlElement).map(
      processPropertiesAndAddType(gpmlElementName)
    );
  });

  fillInGPMLPropertiesFromParent = curry(
    (
      gpmlParentElement: GPMLElement,
      gpmlChildElement: GPMLElement
    ): GPMLElement => {
      const { Graphics } = gpmlParentElement;

      const propertiesToFillIn: Record<string, any> = {
        Graphics: {
          ZOrder: Graphics.ZOrder
        }
      };

      if (gpmlParentElement.GroupRef._exists !== false) {
        propertiesToFillIn.GroupRef = gpmlParentElement.GroupRef;
      }

      return defaultsDeepM(gpmlChildElement, propertiesToFillIn);
    }
  );

  finalize = pvjsonEntity => {
    const that = this;
    const { graphIdManager, processPropertiesAndAddType } = this;
    return hl([pvjsonEntity]);
  };
}
