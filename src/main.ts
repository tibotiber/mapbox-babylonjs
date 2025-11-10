import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import "@babylonjs/loaders/glTF/2.0";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";

import { MapboxWebGLCustomLayer } from "./RolandCsibrei_babylonjs-maps-gl/mapbox/MapBoxWebGLCustomLayer";

import "./style.css";
import { AppendSceneAsync } from "@babylonjs/core/Loading/sceneLoader.js";

const TEST_SIMPLE_SCENE = true;
const TEST_GLTF = true;

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div id="map"></div>
`;

const map = new mapboxgl.Map({
  container: "map",
  // Choose from Mapbox's core styles, or make your own style with Mapbox Studio
  style: "mapbox://styles/mapbox/standard",
  config: {
    basemap: {
      theme: "monochrome",
    },
  },
  zoom: 18,
  center: [148.9819, -35.3981],
  pitch: 60,
  antialias: true, // create the gl context with MSAA antialiasing, so custom layers are antialiased
});

// configure overlay using Roland's custom layer
const overlay = new MapboxWebGLCustomLayer({
  map,
  anchor: {
    lat: -35.39847,
    lng: 148.9819,
  },
  antialias: true,
  adaptToDeviceRatio: true,
  addDefaultLighting: true,
  upAxis: "Z",
});

await overlay.waitForSceneInit();

const scene = overlay.scene;

if (TEST_SIMPLE_SCENE) {
  const sphere = CreateSphere("sphere", { diameter: 10 }, scene);
  const sphereMaterial = new StandardMaterial("sphere-material", scene);
  sphereMaterial.diffuseColor = new Color3(0, 0, 1);
  sphere.material = sphereMaterial;
  sphere.position = new Vector3(50, 0, 0);

  const box = CreateBox("box", { size: 10 }, scene);
  const material = new StandardMaterial("box-material", scene);
  material.diffuseColor = new Color3(1, 0, 0);
  box.material = material;
  box.position = new Vector3(0, 50, 0);
  box.rotation = new Vector3(Math.PI / 4, Math.PI / 4, 0);

  // animate the sphere
  let i = 0;
  scene.onBeforeRenderObservable.add(() => {
    sphere.position.x = Math.sin(i) * 50;
    sphere.position.z = Math.cos(i) * 50;
    i += 0.1 * scene.getAnimationRatio();

    overlay.requestRedraw(); // or use animationMode: "always" when in overlay options
  });
}

if (TEST_GLTF) {
  await AppendSceneAsync(
    "https://docs.mapbox.com/mapbox-gl-js/assets/34M_17/34M_17.gltf",
    scene
  );
}
