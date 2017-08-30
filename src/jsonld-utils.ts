import { flatten, intersection, isArray, isEmpty, union } from "lodash";

/* LSV means JSON-LD @list or @set values
 */
export function arrayify<T>(
  input: (T & jsonldListSetPrimitive) | (T[] & jsonldListSetPrimitive[])
) {
  if (typeof input === "undefined") {
    return [];
  }
  return isArray(input) ? input : [input];
}

export function isJsonldListSetPrimitive(x): boolean {
  const TYPE = typeof x;
  return (
    ["string", "number", "boolean"].indexOf(TYPE) > -1 ||
    x === null ||
    (TYPE !== "undefined" && x.hasOwnProperty("@value"))
  );
}

export function getValuesLSV(
  input: jsonldListSetValue
): jsonldListSetPrimitive[] {
  if (typeof input === "undefined") {
    return [];
  }
  return arrayify(input)
    .map(function(x) {
      return x && x.hasOwnProperty("@value") ? x["@value"] : x;
    })
    .filter(isJsonldListSetPrimitive);
}

export function intersectsLSV(
  x: jsonldListSetValue,
  y: jsonldListSetValue
): boolean {
  return !isEmpty(intersection(getValuesLSV(x), getValuesLSV(y)));
}

export function unionLSV(
  ...inputs: jsonldListSetValue[]
): jsonldListSetPrimitive[] {
  return union(flatten(inputs.map(getValuesLSV)));
}
