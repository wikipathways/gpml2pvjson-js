//*****************
// Key/Value Converters
//*****************

export function ShapeType(gpmlElement, KeyMappings, ValueMappings): [string, any][] {
	const { ShapeType } = gpmlElement.Graphics;
	const pvjsonKey = KeyMappings["ShapeType"];
	const output: any = [[
		pvjsonKey, ValueMappings[ShapeType]
	]];
	if (ShapeType === "RoundedRectangle") {
		output.push(["borderRadius", 15]);
	}
	return output;
}
