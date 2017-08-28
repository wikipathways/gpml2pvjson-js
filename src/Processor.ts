import "source-map-support/register";
// TODO should I get rid of the lib above for production browser build?

import {
  assign,
  camelCase,
  concat,
  curry,
  find,
  fromPairs,
  indexOf,
  isObject,
  map,
  omit,
  pullAt,
  toPairs,
  toPairsIn
} from "lodash/fp";
import { defaultsDeep as defaultsDeepM } from "lodash";
import * as hl from "highland";

import { unionLSV } from "./gpml-utilities";

import * as iassign from "immutable-assign";
iassign.setOption({
  // Deep freeze both input and output. Used in development to make sure they don't change.
  // TODO watch issue and re-enable when addressed: https://github.com/engineforce/ImassignM/issues/11
  //freeze: true,
  ignoreIfNoChange: true
});

import { GraphIdManager } from "./GraphIdManager";
import * as GPML2013aKeyMappings from "./GPML2013aKeyMappings.json";
import * as GPML2013aValueMappings from "./GPML2013aValueMappings.json";
import * as GPML2013aValueConverters from "./GPML2013aValueConverters";

const GPML_ELEMENT_NAME_TO_KAAVIO_TYPE = {
  Anchor: "Burr",
  BiopaxRef: "Citation",
  DataNode: "Node",
  GraphicalLine: "Edge",
  Group: "Group",
  Interaction: "Edge",
  Label: "Node",
  //openControlledVocabulary: "Skip",
  //PublicationXref: "Skip",
  Shape: "Node",
  State: "Burr"
};

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

export class Processor {
  output: {
    pathway: Pathway | PathwayStarter;
    entityMap: PvjsonEntityMap;
  } = {
    pathway: {
      contains: [],
      height: 0,
      width: 0,
      // NOTE: GPML does not contain a way to express background color.
      // It's always just white.
      backgroundColor: "white",
      type: ["Pathway"]
    },
    entityMap: {}
  };

  graphIdManager: GraphIdManager = new GraphIdManager();

  graphIdsByGraphRef: Record<string, string[]> = {};
  containedGraphIdsByGroupGraphId: Record<string, string[]> = {};
  containedGraphIdsByGroupGroupId: Record<string, string[]> = {};

  promisedGraphIdByGroupId: Record<string, Promise<string>> = {};
  groupIdToGraphIdStream: Highland.Stream<[string, string]> = hl();

  promisedGPMLElementByGraphId: Record<string, Promise<GPMLElement>> = {};
  gpmlElementStream: Highland.Stream<GPMLElement> = hl();

  promisedPvjsonEntityLatestByGraphId: Record<
    string,
    Promise<PvjsonEntity>
  > = {};
  pvjsonEntityLatestStream: Highland.Stream<PvjsonEntity> = hl();

  graphIdToZIndex: Record<string, number> = {};

  constructor() {
    const that = this;
    const {
      graphIdToZIndex,
      graphIdsByGraphRef,

      promisedGPMLElementByGraphId,
      gpmlElementStream,

      promisedGraphIdByGroupId,
      groupIdToGraphIdStream,

      promisedPvjsonEntityLatestByGraphId,
      pvjsonEntityLatestStream
    } = this;

    groupIdToGraphIdStream.each(function([groupId, graphId]) {
      promisedGraphIdByGroupId[groupId] = Promise.resolve(graphId);
    });

    gpmlElementStream.each(function(gpmlElement) {
      promisedGPMLElementByGraphId[gpmlElement.GraphId] = Promise.resolve(
        gpmlElement
      );
    });

    pvjsonEntityLatestStream
      .doto(function(pvjsonEntity: PvjsonNode | PvjsonEdge) {
        const { id, isAttachedTo, isPartOf, zIndex } = pvjsonEntity;
        //console.log("Latest");
        //console.log(pvjsonEntity);

        graphIdToZIndex[id] = zIndex;
        promisedPvjsonEntityLatestByGraphId[id] = Promise.resolve(pvjsonEntity);
      })
      .errors(function(err) {
        throw err;
      })
      .each(function(pvjsonEntity) {});

    /*
		TODO do we need this?
    endStream.each(function(x) {
      groupIdToGraphIdStream.end();
      gpmlElementStream.end();
      pvjsonEntityLatestStream.end();
    });
		//*/
  }

  private ensureGraphIdExists = (gpmlElement: GPMLElement): GPMLElement => {
    const {
      containedGraphIdsByGroupGroupId,
      graphIdManager,
      groupIdToGraphIdStream
    } = this;
    const { GroupId, GroupRef } = gpmlElement;
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

      if (!!GroupRef && GroupRef._exists !== false) {
        containedGraphIdsByGroupGroupId[GroupRef] =
          containedGraphIdsByGroupGroupId[GroupRef] || [];
        containedGraphIdsByGroupGroupId[GroupRef].push(GraphId);
      }

      if (!!GroupId && GroupId._exists !== false) {
        groupIdToGraphIdStream.write([GroupId, GraphId]);
      }
    } else {
      throw new Error("GraphId missing.");
    }

    return gpmlElement;
  };

  fillInGPMLPropertiesFromParent = curry(
    (
      gpmlParentElement: GPMLElement,
      gpmlChildElement: GPMLElement
    ): GPMLElement => {
      const { Graphics } = gpmlParentElement;

      // NOTE: this makes some assumptions about the distribution of ZOrder values in GPML
      // TODO This is what we used to do. Do we still need to do this? Or can we just sort them
      // based on whether they are burrs of each other?
      //element.zIndex = element.hasOwnProperty('zIndex') ? element.zIndex : referencedElement.zIndex + 1 / elementCount;
      const propertiesToFillIn: Record<string, any> = {
        Graphics: {
          ZOrder: Graphics.ZOrder
        }
      };

      /*
      if (gpmlParentElement.GroupRef._exists !== false) {
        propertiesToFillIn.GroupRef = gpmlParentElement.GroupRef;
      }
			//*/

      return defaultsDeepM(gpmlChildElement, propertiesToFillIn);
    }
  );

  /*
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
	//*/

  getPvjsonEntityLatestByGraphId = graphId => {
    let promisedPvjsonEntity = this.promisedPvjsonEntityLatestByGraphId[
      graphId
    ];
    if (promisedPvjsonEntity) {
      return promisedPvjsonEntity;
    } else {
      const { pvjsonEntityLatestStream } = this;
      // NOTE: we don't need to set the cache here, because the cache is
      // set for every item that flows through pvjsonEntityLatestStream
      promisedPvjsonEntity = new Promise(function(resolve, reject) {
        pvjsonEntityLatestStream
          .observe()
          .find(pvjsonEntity => pvjsonEntity.id === graphId)
          .errors(reject)
          .each(resolve);
      });

      return promisedPvjsonEntity;
    }
  };

  getGPMLElementByGraphId = GraphId => {
    let promisedGPMLElement = this.promisedGPMLElementByGraphId[GraphId];
    if (promisedGPMLElement) {
      return promisedGPMLElement;
    } else {
      const { gpmlElementStream } = this;
      // NOTE: we don't need to set the cache here, because the cache is
      // set for every item that flows through gpmlElementStream
      promisedGPMLElement = new Promise(function(resolve, reject) {
        gpmlElementStream
          .observe()
          .find(gpmlElement => gpmlElement.GraphId === GraphId)
          .errors(reject)
          .each(resolve);
      });

      return promisedGPMLElement;
    }
  };

  /*
  getByGroupId = targetGroupId => {
    const { getPvjsonEntityByGraphId, groupIdToGraphIdStream } = this;
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

    return promisedGraphId.then(getPvjsonEntityByGraphId);
  };
	//*/

  preprocessGPMLElement = (gpmlElement: GPMLElement): GPMLElement => {
    const { ensureGraphIdExists, gpmlElementStream } = this;
    const processedGPMLElement = ensureGraphIdExists(gpmlElement);
    // NOTE: side effect
    gpmlElementStream.write(processedGPMLElement);
    return processedGPMLElement;
  };

  processGeneral = curry((gpmlElementName: string, gpmlElement) => {
    const {
      preprocessGPMLElement,
      processPropertiesAndType,
      pvjsonEntityLatestStream
    } = this;
    return processPropertiesAndType(
      gpmlElementName,
      preprocessGPMLElement(gpmlElement)
    );
  });

  processProperties = curry((gpmlElement: GPMLElement): PvjsonEntity => {
    return fromPairs(
      toPairs(gpmlElement).reduce(
        (acc, x) => concat(acc, processKV(gpmlElement, x)),
        []
      )
    );
  });

  processPropertiesAndType = curry(
    (gpmlElementName: string, gpmlElement: GPMLElement): PvjsonEntity => {
      const pvjsonEntity = this.processType(
        gpmlElementName,
        this.processProperties(gpmlElement)
      );
      this.pvjsonEntityLatestStream.write(pvjsonEntity);
      return pvjsonEntity;
    }
  );

  private processType = curry(
    (gpmlElementName: string, processed: PvjsonEntity): PvjsonEntity => {
      const kaavioType = GPML_ELEMENT_NAME_TO_KAAVIO_TYPE[gpmlElementName];
      processed.type = unionLSV(
        processed.type,
        gpmlElementName,
        kaavioType
      ) as string[];
      processed.kaavioType = kaavioType;
      // TODO do we want to specify the GPML element name here?
      return processed;
    }
  );

  setPvjsonEntity(pvjsonEntity) {
    const { graphIdToZIndex, promisedPvjsonEntityLatestByGraphId } = this;
    const { id, zIndex } = pvjsonEntity;

    graphIdToZIndex[id] = zIndex;
    promisedPvjsonEntityLatestByGraphId[id] = Promise.resolve(pvjsonEntity);

    this.output = iassign(
      this.output,
      function(o) {
        return o.entityMap;
      },
      function(entityMap) {
        entityMap[pvjsonEntity.id] = pvjsonEntity;
        return entityMap;
      }
    );
  }
}
