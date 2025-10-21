import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl, {
  type CustomLayerInterface,
  type LngLatLike,
  type Map,
} from "mapbox-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import "./style.css";

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

// add glTF model using ThreeJS (adapted from https://docs.mapbox.com/mapbox-gl-js/example/add-3d-model/)
// parameters to ensure the model is georeferenced correctly on the map
const modelOrigin: LngLatLike = [148.9819, -35.39847];
const modelAltitude = 0;
const modelRotate = [Math.PI / 2, 0, 0];

const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
  modelOrigin,
  modelAltitude
);

// transformation parameters to position, rotate and scale the 3D model onto the map
const modelTransform = {
  translateX: modelAsMercatorCoordinate.x,
  translateY: modelAsMercatorCoordinate.y,
  translateZ: modelAsMercatorCoordinate.z,
  rotateX: modelRotate[0],
  rotateY: modelRotate[1],
  rotateZ: modelRotate[2],
  /* Since the 3D model is in real world meters, a scale transform needs to be
   * applied since the CustomLayerInterface expects units in MercatorCoordinates.
   */
  scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits(),
};

// configuration of the custom layer for a 3D model per the CustomLayerInterface
interface ThreeJsCustomLayer extends CustomLayerInterface {
  map?: Map;
  camera?: THREE.Camera;
  scene?: THREE.Scene;
  renderer?: THREE.WebGLRenderer;
}

const customLayer: ThreeJsCustomLayer = {
  id: "3d-model",
  type: "custom",
  renderingMode: "3d",
  onAdd: function (map, gl) {
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();

    // create two three.js lights to illuminate the model
    const directionalLight = new THREE.DirectionalLight(0xffffff);
    directionalLight.position.set(0, -70, 100).normalize();
    this.scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff);
    directionalLight2.position.set(0, 70, 100).normalize();
    this.scene.add(directionalLight2);

    // use the three.js GLTF loader to add the 3D model to the three.js scene
    const loader = new GLTFLoader();
    loader.load(
      "https://docs.mapbox.com/mapbox-gl-js/assets/34M_17/34M_17.gltf",
      (gltf) => {
        if (!this.scene) {
          console.error("ThreeJS scene is null");
          return;
        }
        this.scene.add(gltf.scene);
      }
    );
    this.map = map;

    // use the Mapbox GL JS map canvas for three.js
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });

    this.renderer.autoClear = false;
  },
  // @ts-expect-error gl is not used here
  render: function (gl, matrix) {
    if (!this.camera || !this.scene || !this.renderer || !this.map) {
      return;
    }

    const rotationX = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(1, 0, 0),
      modelTransform.rotateX
    );
    const rotationY = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(0, 1, 0),
      modelTransform.rotateY
    );
    const rotationZ = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(0, 0, 1),
      modelTransform.rotateZ
    );

    const m = new THREE.Matrix4().fromArray(matrix);
    const l = new THREE.Matrix4()
      .makeTranslation(
        modelTransform.translateX,
        modelTransform.translateY,
        modelTransform.translateZ
      )
      .scale(
        new THREE.Vector3(
          modelTransform.scale,
          -modelTransform.scale,
          modelTransform.scale
        )
      )
      .multiply(rotationX)
      .multiply(rotationY)
      .multiply(rotationZ);

    this.camera.projectionMatrix = m.multiply(l);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  },
};

map.on("style.load", () => {
  map.addLayer(customLayer);
});
