//*****************
// Key/Value Converters
//*****************

// TODO: for some reason, this runs twice for every anchor. Why?
export function shapeType(
  gpmlElement,
  KeyMappings,
  ValueMappings
): [string, any][] {
  const { shapeType } = gpmlElement.hasOwnProperty("Graphics") ? gpmlElement.Graphics : gpmlElement;
  const pvjsonKey = KeyMappings["shapeType"];
  const output: any = [[pvjsonKey, ValueMappings[shapeType]]];
  if (shapeType === "RoundedRectangle") {
    output.push(["rx", 15]);
    output.push(["ry", 15]);
  }

  return output;
}

export function borderStyle(
  gpmlElement,
  KeyMappings,
  ValueMappings
): [string, any][] {
  const { Graphics } = gpmlElement;
  const gpmlBorderLineStyle = Graphics.hasOwnProperty("borderStyle") ? Graphics.borderStyle : Graphics.lineStyle;
  // TODO hard-coding this here is not the most maintainable
  if (gpmlBorderLineStyle === "Solid") {
    // this gets converted to strokeDasharray,
    // and we don't need this value when it's
    // solid, so we return undefined, because
    // then this won't be included.
    return [];
  } else if (gpmlBorderLineStyle === "Double") {
    return [["strokeStyle", "double"]];
  } else if (gpmlBorderLineStyle === "Dashed") {
    return [["strokeDasharray", "5,3"]];
  } else {
    throw new Error(`Unrecognized borderStyle or lineStyle: ${gpmlBorderLineStyle}`);
  }
}

export const lineStyle = borderStyle;
