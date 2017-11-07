import "source-map-support/register";
// TODO should I get rid of the lib above for production browser build?

import { PvjsonSingleFreeNode } from "./gpml2pvjson";
import { transform } from "./gpml-utilities";

export function addressPathVisioShapeRenderingBugs(
  pvjsonElement: PvjsonSingleFreeNode
): PvjsonSingleFreeNode {
  const ShapeType = pvjsonElement.drawAs;
  // rotation in radians
  const Rotation = (pvjsonElement.rotation || 0) * (Math.PI / 180);

  let transformationSequence = [];

  // Correct GPML position and size values.
  //
  // Some GPML elements with ShapeTypes have Graphics values that
  // do not match what is visually displayed in PathVisio-Java.
  // Below are corrections for the GPML so that the display in
  // pvjs matches the display in PathVisio-Java.

  let xTranslation;
  let yTranslation;
  let xScale;
  let yScale;

  if (1 > 2 && ShapeType === "Triangle") {
    // NOTE: the numbers below come from visually experimenting with different widths
    // in PathVisio-Java and making linear approximations of the translation
    // scaling required to make x, y, width and height values match what is visually
    // displayed in PathVisio-Java.
    xScale = (pvjsonElement.width + 0.04) / 1.07 / pvjsonElement.width;
    yScale = (pvjsonElement.height - 0.14) / 1.15 / pvjsonElement.height;
    xTranslation = 0.28 * pvjsonElement.width - 2.0;
    yTranslation = 0;

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: Rotation
      });
    }

    transformationSequence.push({
      key: "translate",
      value: [xTranslation, yTranslation]
    });

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: -1 * Rotation
      });
    }

    transformationSequence.push({
      key: "scale",
      value: [xScale, yScale]
    });
  } else if (ShapeType === "Hexagon") {
    xScale = 1;
    yScale = 0.88;
    transformationSequence.push({
      key: "scale",
      value: [xScale, yScale]
    });
  } else if (ShapeType === "Pentagon") {
    xScale = 0.9;
    yScale = 0.95;
    xTranslation = 0.047 * pvjsonElement.width + 0.01;
    yTranslation = 0;

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: Rotation
      });
    }

    transformationSequence.push({
      key: "translate",
      value: [xTranslation, yTranslation]
    });

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: -1 * Rotation
      });
    }

    transformationSequence.push({
      key: "scale",
      value: [xScale, yScale]
    });
  } else if (ShapeType === "Arc") {
    xScale = 1;
    yScale = 0.5;
    xTranslation = 0;
    yTranslation = pvjsonElement.height * yScale / 2;

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: Rotation
      });
    }

    transformationSequence.push({
      key: "translate",
      value: [xTranslation, yTranslation]
    });

    if (typeof Rotation === "number" && Rotation !== 0) {
      transformationSequence.push({
        key: "rotate",
        value: -1 * Rotation
      });
    }

    transformationSequence.push({
      key: "scale",
      value: [xScale, yScale]
    });
  }
  /*
		else if (ShapeType === 'Sarcoplasmic Reticulum') {
		// TODO: enable this after comparing results from old converter
			xScale = 0.76;
			yScale = 0.94;
			xTranslation = 0.043 * pvjsonElement.width + 0.01;
			yTranslation = 0.009 * pvjsonElement.height - 15.94;

			if (typeof Rotation === 'number' && Rotation !== 0) {
				transformationSequence.push({
					key: 'rotate',
					value: Rotation
				});
			}

			transformationSequence.push({
				key: 'translate',
				value: [xTranslation, yTranslation]
			});

			if (typeof Rotation === 'number' && Rotation !== 0) {
				transformationSequence.push({
					key: 'rotate',
					value: (-1) * Rotation
				});
			}

			transformationSequence.push({
				key: 'scale',
				value: [xScale, yScale]
			});
		}
		//*/

  return transform({
    element: pvjsonElement,
    transformationSequence: transformationSequence
  });
}

export function postprocessPVJSON(
  pvjsonElement: PvjsonSingleFreeNode
): PvjsonSingleFreeNode {
  // should we use one of these libraryies to determine what's inside a cell component?
  // https://www.npmjs.com/package/rbush
  // https://www.npmjs.com/package/@types/point-in-polygon
  return addressPathVisioShapeRenderingBugs(pvjsonElement);
}
