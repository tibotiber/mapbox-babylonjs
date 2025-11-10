// from https://github.com/RolandCsibrei/babylonjs-maps-gl
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Tools } from "@babylonjs/core/Misc/tools";
import { VertexData, type IndicesArray, type Nullable } from "@babylonjs/core";

import mapboxgl, { type MapOptions, Map } from "mapbox-gl";
import type { MapboxWebGLCustomLayer } from "./MapboxWebGLCustomLayer";

export type LatLngAltLike = {
  lat: number;
  lng: number;
  altitude: number;
};

export interface APIOptions {
  accessToken: string;
}

const { atan, cos, exp, log, tan, PI } = Math;

export const EARTH_RADIUS = 6371010.0;
export const WORLD_SIZE = Math.PI * EARTH_RADIUS;

export async function initMap(
  apiOptions: APIOptions,
  mapOptions: MapOptions,
  htlmDivElement = "map"
) {
  const mapDiv = document.getElementById(htlmDivElement) as HTMLDivElement;
  if (!mapDiv) {
    throw new Error(`Div element with id '${htlmDivElement}' not found.`);
  }

  mapboxgl.accessToken = apiOptions.accessToken;

  const map = new mapboxgl.Map(mapOptions);
  return map;
}

export function latLngToVector3Relative(
  point: LatLngAltLike,
  reference: LatLngAltLike,
  target = new Vector3()
): Vector3 {
  const [px, py] = latLngToXY(point);
  const [rx, ry] = latLngToXY(reference);

  target.set(px - rx, py - ry, 0);

  // apply the spherical mercator scale-factor for the reference latitude
  const val = cos(Tools.ToRadians(reference.lat));
  const vector = new Vector3(val, val, val);
  target.multiplyInPlace(vector);

  target.z = point.altitude - reference.altitude;

  return target;
}

export function latLngToXY(position: LatLngAltLike): number[] {
  return [
    EARTH_RADIUS * Tools.ToRadians(position.lng),
    EARTH_RADIUS * log(tan(0.25 * PI + 0.5 * Tools.ToRadians(position.lat))),
  ];
}

export function xyToLatLng(x: number, y: number) {
  return {
    lat: Tools.ToDegrees(PI * 0.5 - 2.0 * atan(exp(-y / EARTH_RADIUS))),
    lng: Tools.ToDegrees(x) / EARTH_RADIUS,
  };
}

export function setCursor(map: Map, pointer: string | null) {
  map.getCanvas().style.cursor = pointer ?? "";
}

/**
 * Retrieves the indices of a mesh with the winding order of each triangle reversed.
 * This reverses the face direction of the mesh.
 * @param {Mesh} mesh - The Babylon.js mesh whose indices will be reversed.
 * @returns {Nullable<IndicesArray>} The reversed indices array or undefined if no indices.
 */
export function getReversedIndices(mesh: Mesh): Nullable<IndicesArray> {
  const indices = mesh.getIndices(false, true);

  if (indices) {
    // Reverse the order of vertices in each triangle (3 indices per face)
    for (let i = 0; i < indices.length; i += 3) {
      // Swap the second and third index to reverse the winding order
      const temp = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = temp;
    }
  }

  return indices;
}

/**
 * Reverses the winding order of triangles in a Babylon.js mesh by modifying its indices.
 * @param {Mesh} mesh - The mesh whose indices will be reversed.
 */
export function fixMesh(mesh: Mesh) {
  const indices = getReversedIndices(mesh);
  const positions = mesh.getPositionData();
  if (!indices || !positions) {
    return;
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;

  vertexData.applyToMesh(mesh);
}

export function destroyMap(map: Map) {
  map.remove();
}

/**
 * Computes the position and angle transform between two GPS bounds relative to a BabylonJSWebGLOverlayView.
 * Useful for positioning overlays or models between two latitude/longitude points.
 * @param {BabylonJSWebGLOverlayView} overlay - The overlay view instance.
 * @param {LatLngLiteral} leftLowerCorner - The southwest corner of the bounds.
 * @param {LatLngLiteral} rightLowerCorner - The southeast corner of the bounds.
 * @returns {{ position: Vector3; angle: number }} The computed position (Vector3) and angle in radians.
 */
export function getTransformFromGpsBounds(
  overlay: MapboxWebGLCustomLayer,
  leftLowerCorner: LatLngAltLike,
  rightLowerCorner: LatLngAltLike
): { position: Vector3; angle: number } {
  const p1Position = overlay.latLngAltitudeToVector3Ref(leftLowerCorner);
  const p2Position = overlay.latLngAltitudeToVector3Ref(rightLowerCorner);

  if (p1Position && p2Position) {
    const angle = Math.atan2(
      p2Position.y - p1Position.y,
      p2Position.x - p1Position.x
    );

    return {
      position: p1Position,
      angle,
    };
  }

  return {
    position: new Vector3(),
    angle: 0,
  };
}

/**
 * Converts Babylon.js Vector3 coordinates back to latitude and longitude,
 * relative to an origin GPS coordinate.
 * Only the x and z components are used (y is ignored).
 * @param {number} x - The X coordinate in meters (Babylon.js).
 * @param {number} z - The Z coordinate in meters (Babylon.js).
 * @param {LatLngTypes} originLatLng - The origin geographic coordinate.
 * @returns {LatLngTypes} The geographic coordinate corresponding to the vector.
 */
export function vector3ToLatLng(
  x: number,
  z: number,
  originLatLng: LatLngAltLike
) {
  // Define meters per degree conversion
  const latPerMeter = 1 / ((Math.PI * EARTH_RADIUS) / 180);
  const lngPerMeter =
    1 /
    (((Math.PI * EARTH_RADIUS) / 180) *
      Math.cos(originLatLng.lat * (Math.PI / 180)));

  // Convert Babylon.js X/Z to lat/lng (Y is ignored)
  const lat = originLatLng.lat + z * latPerMeter;
  const lng = originLatLng.lng + x * lngPerMeter;

  return { lat, lng };
}
