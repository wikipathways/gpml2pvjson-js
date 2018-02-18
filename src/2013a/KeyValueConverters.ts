//*****************
// Key/Value Converters
//*****************

export function ShapeType(
  gpmlElement,
  KeyMappings,
  ValueMappings
): [string, any][] {
  const { ShapeType } = gpmlElement.Graphics;
  const pvjsonKey = KeyMappings["ShapeType"];
  const output: any = [[pvjsonKey, ValueMappings[ShapeType]]];
  if (ShapeType === "RoundedRectangle") {
    output.push(["rx", 15]);
    output.push(["ry", 15]);
  }
  return output;
}
