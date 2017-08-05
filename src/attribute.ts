import { unionLSV } from "./gpml-utilities";

export function fromGPML(dataElement, gpmlElement, attributeElement) {
  if (!attributeElement || !gpmlElement || !dataElement) {
    throw new Error("Missing input element(s) in attribute.fromGPML()");
  }

  // NOTE: Yes, 'attributeElementAttributes' is confusing, but that's just the
  // way it needs to be when GPML has an element named 'Attribute'.
  const attributeElementAttributes = attributeElement.attributes;
  const attributeKey = attributeElementAttributes.Key.value;
  const attributeValue = attributeElementAttributes.Value.value;

  if (attributeKey === "org.pathvisio.DoubleLineProperty") {
    dataElement.lineStyle = "double";
    // The line below is left here for future reference, but after discussing with AP, the desired behavior is for the entire glyph to be filled. -AR
    //dataElement.fillRule = 'evenodd';
  } else if (attributeKey === "org.pathvisio.CellularComponentProperty") {
    // CellularComponent is not a BioPAX term, but "PhysicalEntity" is.
    dataElement.type = unionLSV(
      dataElement.type,
      "PhysicalEntity",
      "CellularComponent"
    ) as string[];
    dataElement.cellularComponent = attributeValue;
  }

  return dataElement;
}
