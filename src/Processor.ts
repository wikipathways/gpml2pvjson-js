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
  isArray,
  isObject,
  isString,
  map,
  omit,
  pullAt,
  toPairs,
  toPairsIn
} from "lodash/fp";
import { defaultsDeep as defaultsDeepM } from "lodash";
import * as hl from "highland";

import {
  PvjsonSingleFreeNode,
  PvjsonBurr,
  PvjsonEdge,
  PvjsonGroup,
  PvjsonEntity,
  GPMLElement,
  Pathway,
  PathwayStarter,
  PvjsonEntityMap
} from "./gpml2pvjson";
import { isDefinedCXML, unionLSV } from "./gpml-utilities";

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
  DataNode: "SingleFreeNode",
  GraphicalLine: "Edge",
  Group: "Group",
  Interaction: "Edge",
  Label: "SingleFreeNode",
  //openControlledVocabulary: "Skip",
  //PublicationXref: "Skip",
  Shape: "SingleFreeNode",
  State: "Burr"
};

const VALUES_TO_SKIP = ["", null, undefined];

export type GPML_VALUE_SIMPLE = string | number;
export type GPML_VALUE_UP_TO_OBJECT =
  | GPML_VALUE_SIMPLE
  | Record<string, GPML_VALUE_SIMPLE>;
export type GPML_VALUE_UP_TO_SUB_OBJECT =
  | GPML_VALUE_UP_TO_OBJECT
  | Record<string, GPML_VALUE_UP_TO_OBJECT>;
export type GPML_VALUE =
  | GPML_VALUE_UP_TO_SUB_OBJECT
  | GPML_VALUE_UP_TO_SUB_OBJECT[];

// TODO update lodash/fp TS defs to use "x is ..."
function isStringTS(x: any): x is string {
  return isString(x);
}

function isArrayTS(x: any): x is any[] {
  return isArray(x);
}

// NOTE: isPlainObject does not return true for an instance of a class
function isRecord(x: any): x is Record<string, any> {
  return !isArray(x) && isObject(x);
}

function getPvjsonValue(gpmlElement, gpmlKey: string, gpmlValue: GPML_VALUE) {
  // NOTE: jsSafeGPMLKey is for attributes like "Data-Source", because
  // the following would be invalid JS:
  //   export function Data-Source() {};
  // TODO what about things like spaces, etc.?
  const jsSafeGPMLKey = gpmlKey.replace("-", "");
  let pvjsonValue;
  if (GPML2013aValueConverters.hasOwnProperty(jsSafeGPMLKey)) {
    return GPML2013aValueConverters[jsSafeGPMLKey](gpmlElement);
  } else if (isStringTS(gpmlValue)) {
    if (GPML2013aValueMappings.hasOwnProperty(gpmlValue)) {
      return GPML2013aValueMappings[gpmlValue];
    } else {
      return gpmlValue;
    }
  } else if (isArrayTS(gpmlValue)) {
    return gpmlValue.map(function(valueItem) {
      return getPvjsonValue(valueItem, gpmlKey, valueItem);
    });
  } else if (isRecord(gpmlValue)) {
    return fromPairs(
      toPairs(gpmlValue).reduce(function(acc, [key, value]): [string, any][] {
        processKV(gpmlValue, [key, value]).forEach(function(x) {
          acc.push(x);
        });
        return acc;
      }, [])
    ) as Record<string, any>;
  } else {
    return gpmlValue;
  }
}

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
    (isObject(gpmlValue) && !isDefinedCXML(gpmlValue))
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
    const pvjsonValue = getPvjsonValue(gpmlElement, gpmlKey, gpmlValue);
    // NOTE: we don't include key/value pairs when the value is missing
    if (VALUES_TO_SKIP.indexOf(pvjsonValue) === -1) {
      return [[pvjsonKey || camelCase(gpmlKey), pvjsonValue]];
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
      // NOTE: GPML does not contain a way to express background color.
      // It's always just white.
      backgroundColor: "white",
      borderWidth: 0,
      color: "white",
      contains: [],
      drawAs: "Rectangle",
      gpmlElementName: "Pathway",
      height: 0,
      // it appears type = {id: string} & type = {id?: string} makes id required.
      // TODO can we override that just for PathwayStarter?
      id: undefined,
      kaavioType: "Group",
      name: "New Pathway",
      // TODO what should the padding be?
      padding: 5,
      type: ["Pathway"],
      width: 0,
      x: 0,
      y: 0,
      zIndex: -Infinity,
      // NOTE: these properties only apply contents of current element. They do not affect children.
      fontWeight: "bold",
      textAlign: "left",
      verticalAlign: "top"
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
      .doto(function(
        pvjsonEntity:
          | PvjsonSingleFreeNode
          | PvjsonGroup
          | PvjsonBurr
          | PvjsonEdge
      ) {
        const { id, zIndex } = pvjsonEntity;

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
      if (!isDefinedCXML(GraphId)) {
        // NOTE: we are making sure that elements that CAN have a GraphId
        // always DO have a GraphId. GraphIds are optional in GPML for Groups,
        // so we will add one if it's not already specified. But Pathway
        // elements never have GraphIds, so we don't add one for them.
        GraphId = gpmlElement.GraphId = graphIdManager.generateAndRecord();
      } else {
        graphIdManager.recordExisting(GraphId);
      }

      if (isDefinedCXML(GroupRef)) {
        containedGraphIdsByGroupGroupId[GroupRef] =
          containedGraphIdsByGroupGroupId[GroupRef] || [];
        containedGraphIdsByGroupGroupId[GroupRef].push(GraphId);
      }

      if (isDefinedCXML(GroupId)) {
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
      if (isDefinedCXML(gpmlParentElement.GroupRef)) {
        propertiesToFillIn.GroupRef = gpmlParentElement.GroupRef;
      }
			//*/

      return defaultsDeepM(gpmlChildElement, propertiesToFillIn);
    }
  );

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

  preprocessGPMLElement = (gpmlElement: GPMLElement): GPMLElement => {
    const { ensureGraphIdExists, gpmlElementStream } = this;
    const processedGPMLElement = ensureGraphIdExists(gpmlElement);
    // NOTE: side effect
    gpmlElementStream.write(processedGPMLElement);
    return processedGPMLElement;
  };

  processGPMLAndPropertiesAndType = curry(
    (gpmlElementName: string, gpmlElement) => {
      const {
        preprocessGPMLElement,
        processPropertiesAndType,
        pvjsonEntityLatestStream
      } = this;
      return processPropertiesAndType(
        gpmlElementName,
        preprocessGPMLElement(gpmlElement)
      );
    }
  );

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
      if (!!kaavioType) {
        processed.kaavioType = kaavioType;
      }
      processed.gpmlElementName = gpmlElementName;
      return processed;
    }
  );

  setPvjsonEntity = pvjsonEntity => {
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
  };
}
