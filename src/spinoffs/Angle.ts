import { isUndefined } from "lodash/fp";

// based on code drawn from this repo:
// https://github.com/infusion/Angles.js/blob/master/angles.js

const TAU = 2 * Math.PI;
const EPS = 1e-15;
const SCALE = 2 * Math.PI;
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
   * Mathematical modulo
   * 
   * @param {number} x
   * @param {number} m
   * @returns {number}
   */
function mod(x, m) {
  return (x % m + m) % m;
}

/**
	 * Convert from radians to degrees
	 *
	 * @param {number} radians
	 * @returns {number} degrees
	 */
export function radiansToDegrees(radians: number): number {
  return 180 / Math.PI * radians;
}

/**
	 * Convert from degrees to radians
	 *
	 * @param {number} degrees
	 * @returns {number} radians
	 */
export function degreesToRadians(degrees: number): number {
  return Math.PI / 180 * degrees;
}

/**
	 * Normalize an arbitrary angle to the interval [-180, 180)
	 *
	 * @param {number} n
	 * @returns {number}
	 */
export function normalizeHalf(n) {
  var h = SCALE / 2;

  return mod(n + h, SCALE) - h;
}

/**
	 * Normalize an arbitrary angle to the interval [0, 360)
	 *
	 * @param {number} n
	 * @returns {number}
	 */
export function normalize(n) {
  return mod(n, SCALE);
}

/**
	 * Gets the shortest direction to rotate to another angle
	 *
	 * @param {number} from
	 * @param {number} to
	 * @returns {number}
	 */
export function shortestDirection(from, to) {
  var z = from - to;
  // mod(-z, 360) < mod(z, 360) <=> mod(z + 180, 360) < 180       , for all z \ 180

  if (from === to) {
    return 0;
    // if (mod(-z, 360) < mod(z, 360)) {
  } else if (normalizeHalf(z) < 0) {
    return -1; // Left
  } else {
    return +1; // Right
  }
}

/**
	 * Checks if an angle is between two other angles
	 *
	 * @param {number} n
	 * @param {number} a
	 * @param {number} b
	 * @returns {boolean}
	 */
export function between(n, a, b) {
  // Check if an angle n is between a and b

  n = mod(n, SCALE);
  a = mod(a, SCALE);
  b = mod(b, SCALE);

  if (a < b) return a <= n && n <= b;
  // return 0 <= n && n <= b || a <= n && n < 360;
  return a <= n || n <= b;
}

/**
	 * Calculates the angular difference between two angles
	 * @param {number} a
	 * @param {number} b
	 * @returns {number}
	 */
export function diff(a, b) {
  return Math.abs(b - a) % SCALE;
}

/**
	 * Calculate the minimal distance between two angles
	 *
	 * @param {number} a
	 * @param {number} b
	 * @returns {number}
	 */
export function distance(a, b) {
  var h = SCALE / 2;

  // One-Liner:
  //return Math.min(mod(a - b, m), mod(b - a, m));

  var diff = normalizeHalf(a - b);

  if (diff > h) diff = diff - SCALE;

  return Math.abs(diff);
}

/**
	 * Calculate radians from current angle
	 *
	 * @param {number} n
	 * @returns {number}
	 */
export function toRad(n) {
  // https://en.wikipedia.org/wiki/Radian
  return n / SCALE * TAU;
}

/**
	 * Calculate degrees from current angle
	 *
	 * @param {number} n
	 * @returns {number}
	 */
export function toDeg(n) {
  // https://en.wikipedia.org/wiki/Degree_(angle)
  return n / SCALE * 360;
}

/**
	 * Calculate gons from current angle
	 *
	 * @param {number} n
	 * @returns {number}
	 */
export function toGon(n) {
  // https://en.wikipedia.org/wiki/Gradian
  return n / SCALE * 400;
}

/**
	 * Given the sine and cosine of an angle, what is the original angle?
	 *
	 * @param {number} sin
	 * @param {number} cos
	 * @returns {number}
	 */
export function fromSinCos(sin, cos) {
  var angle = (1 + Math.acos(cos) / TAU) * SCALE;

  if (sin < 0) {
    angle = SCALE - angle;
  }
  return mod(angle, SCALE);
}

/**
	 * What is the angle of two points making a line
	 *
	 * @param {Array} p1
	 * @param {Array} p2
	 * @returns {number}
	 */
export function fromSlope(p1, p2) {
  var angle = (TAU + Math.atan2(p2[1] - p1[1], p2[0] - p1[0])) % TAU;

  return angle / TAU * SCALE;
}

/**
	 * Returns the quadrant
	 *
	 * @param {number} x The point x-coordinate
	 * @param {number} y The point y-coordinate
	 * @param {number=} k The optional number of regions in the coordinate-system
	 * @param {number=} shift An optional angle to rotate the coordinate system
	 * @returns {number}
	 */
export function quadrant(x, y, k, shift) {
  if (isUndefined(k)) k = 4; // How many regions? 4 = quadrant, 8 = octant, ...

  if (isUndefined(shift)) shift = 0; // Rotate the coordinate system by shift° (positiv = counter-clockwise)

  /* shift = PI / k, k = 4:
		 *   I) 45-135
		 *  II) 135-225
		 * III) 225-315
		 *  IV) 315-360
		 */

  /* shift = 0, k = 4:
		 *   I) 0-90
		 *  II) 90-180
		 * III) 180-270
		 *  IV) 270-360
		 */

  var phi = (Math.atan2(y, x) + TAU) / TAU;

  if (Math.abs(phi * SCALE % (SCALE / k)) < EPS) {
    return 0;
  }

  return 1 + mod(Math.floor(k * shift / SCALE + k * phi), k);
}

/**
	 * Calculates the compass direction of the given angle
	 *
	 * @param {number} angle
	 * @returns {string}
	 */
export function compass(course) {
  // 0° = N
  // 90° = E
  // 180° = S
  // 270° = W

  var k = DIRECTIONS.length;

  var dir = Math.round(course / SCALE * k);

  return DIRECTIONS[mod(dir, k)];
}

/**
	 * Calculates the linear interpolation of two angles
	 *
	 * @param {number} a Angle one
	 * @param {number} b Angle two
	 * @param {number} p Percentage
	 * @param {number} dir Direction (either 1 [=CW] or -1 [=CCW])
	 * @returns {number}
	 */
export function lerp(a, b, p, dir) {
  a = mod(a, SCALE);
  b = mod(b, SCALE);

  if (a === b) return a;

  // dir becomes an offset if we have to add a full revolution (=scale)
  if (!dir) dir = -SCALE;
  else if (dir === 1 === a < b) dir *= SCALE;
  else dir = 0;

  return mod(a + p * (b - a - dir), SCALE);
}
