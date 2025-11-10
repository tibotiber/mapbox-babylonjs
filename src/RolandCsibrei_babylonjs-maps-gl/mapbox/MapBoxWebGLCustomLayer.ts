// from https://github.com/RolandCsibrei/babylonjs-maps-gl
import mapboxgl, {
  MercatorCoordinate,
  type CustomLayerInterface,
  type Map,
} from "mapbox-gl";

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera, type Camera } from "@babylonjs/core/Cameras";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { latLngToVector3Relative, type LatLngAltLike } from "./util";

const DEFAULT_UP = new Vector3(0, 1, 0);
const CAMERA_NAME = "mapbox-camera";

export interface LngLatLike {
  lng: number;
  lat: number;
}

// configuration of the custom layer for a 3D model per the CustomLayerInterface
interface IMapboxWebGLCustomLayer {
  map: Map;

  /**
   * The anchor for the scene.
   */
  anchor: LngLatLike;

  altitude?: number;

  /**
   * The axis pointing up in the scene. Can be specified as "Z", "Y" or a
   * Vector3, in which case the normalized vector will become the up-axis.
   *
   * @default "Z"
   */
  upAxis?: "Z" | "Y" | Vector3;

  /**
   * Whether to use a right-handed coordinate system.
   */
  useRightHandedSystem?: boolean;

  /**
   * Add default lighting to the scene.
   * @default true
   */
  addDefaultLighting?: boolean;

  /**
   * Specify the camera to be used to render the overlayed scene.
   * If not specified a new FreeCamera will be created.
   * The camera matrix will be synced with the google maps view.
   */
  camera?: Camera;

  /**
   * Whether to adapt the device ratio.
   * @default false
   */
  adaptToDeviceRatio?: boolean;

  /**
   * Whether to enable antialiasing for the js engine.
   * @default false
   */
  antialias?: boolean;
}

export class MapboxWebGLCustomLayer {
  protected readonly rotationArray: Float32Array = new Float32Array(3);
  public readonly rotationInverse: Quaternion = new Quaternion();

  private _engine!: Engine;
  private _scene!: Scene;
  private _camera!: Camera;

  private _map!: Map;
  protected anchor!: LatLngAltLike;

  private _scale: number;
  private _anchorMercatorCoordinate: MercatorCoordinate;

  /**
   * The current rotation matrix
   */
  public get rotationMatrix() {
    return Matrix.FromQuaternionToRef(this.rotationInverse, Matrix.Zero());
  }

  /**
   * The scene
   */
  public get scene() {
    return this._scene;
  }

  /**
   * The camera
   */
  public get camera() {
    return this._camera;
  }

  constructor(protected readonly options: IMapboxWebGLCustomLayer) {
    const {
      anchor = { lat: 0, lng: 0, altitude: 0 },
      upAxis = "Y",
      map,
      addDefaultLighting = true,
    } = options;

    this.options = {
      ...this.options,
      anchor,
      upAxis,
      addDefaultLighting,
    };

    map.on("style.load", () => {
      map.addLayer(this.getCustomLayer());
    });

    this._anchorMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
      options.anchor,
      options.altitude ?? 0
    );

    this.setUpAxis(upAxis);

    this._scale =
      this._anchorMercatorCoordinate.meterInMercatorCoordinateUnits();
  }

  public async waitForSceneInit(): Promise<void> {
    return new Promise((resolve) => {
      const checkScene = () => {
        if (this._scene) {
          resolve();
        } else {
          setTimeout(checkScene, 100); // Check every 100ms
        }
      };
      checkScene();
    });
  }

  /**
   * Triggers the map to redraw a frame.
   */
  public requestRedraw(): void {
    this._map.triggerRepaint();
  }

  /**
   * Sets the anchor-point.
   * @param anchor
   */
  public setAnchor(anchor: LatLngAltLike) {
    this.anchor = anchor;
  }

  /**
   * Setup axis
   */
  public setUpAxis(axis: "Y" | "Z" | Vector3): void {
    const upVector = new Vector3(0, 1, 0); // Y up

    if (typeof axis !== "string") {
      upVector.copyFrom(axis);
    } else {
      if (axis.toLowerCase() === "z") {
        upVector.set(0, 0, 1);
      } else if (axis.toLowerCase() !== "y") {
        console.warn(`invalid value '${axis}' specified as upAxis`);
      }
    }

    upVector.normalize();

    const q = new Quaternion();
    Quaternion.FromUnitVectorsToRef(upVector, DEFAULT_UP, q);

    this.rotationInverse.copyFrom(q).invert();

    // copy to rotationArray for transformer.fromLatLngAltitude()
    const euler = q.toEulerAngles();
    this.rotationArray[0] = euler.x;
    this.rotationArray[1] = euler.y;
    this.rotationArray[2] = euler.z;
  }

  /**
   * Convert coordinates from WGS84 Latitude Longitude to world-space
   * coordinates while taking the origin and orientation into account.
   * @param position the position to convert
   * @param target the target vector to write the result to
   * @returns the target vector
   */
  public latLngAltitudeToVector3Ref(
    position: LatLngAltLike,
    target = new Vector3()
  ) {
    latLngToVector3Relative(position, this.anchor, target);

    target.applyRotationQuaternion(this.rotationInverse);

    return target;
  }

  private _createCamera() {
    const camera = new FreeCamera(CAMERA_NAME, new Vector3(), this._scene);
    camera.minZ = 0.01;
    return camera;
  }

  /**
   * Creates a hemispheric light to illuminate the model
   * (roughly approximates the lighting of buildings in maps)
   */
  private initSceneLighting() {
    const light = new HemisphericLight(
      "gmaps-light",
      new Vector3(0, -0.2, 1).normalize(),
      this._scene
    );
    light.intensity = 0.7;
    light.groundColor = new Color3(1, 1, 1);
    light.diffuse = new Color3(0.27, 0.27, 0.27);
  }

  private _onAdd(map: Map, gl: WebGL2RenderingContext) {
    // dispose existing engine and scene
    if (this._scene) {
      this._scene.dispose();
    }

    if (this._engine) {
      this._engine.dispose();
    }

    this._map = map;

    // create new engine and scene with and inject the GL context
    this._engine = new Engine(gl, this.options.antialias, {
      ...gl.getContextAttributes(),
      adaptToDeviceRatio: this.options.adaptToDeviceRatio ?? false,
    });

    this._engine.stopRenderLoop();

    // setup the scene
    this._scene = new Scene(this._engine);
    this._scene.detachControl();
    this._scene.clearColor = new Color4(0, 0, 0, 0);
    this._scene.autoClear = false;
    this._scene.autoClearDepthAndStencil = false;
    this._scene.useRightHandedSystem =
      this.options.useRightHandedSystem ?? false;

    if (this.options.addDefaultLighting) {
      this.initSceneLighting();
    }

    // setup the camera if not specified in the options
    this._camera = this._camera ?? this._createCamera();
  }

  private _render(gl: WebGL2RenderingContext, matrix: number[]) {
    if (!this._camera || !this._scene || !this._map) {
      return;
    }

    const scale = new Vector3(this._scale, this._scale, this._scale);
    const rotation = Quaternion.RotationYawPitchRoll(
      this.rotationArray[1],
      -this.rotationArray[0],
      this.rotationArray[2]
    );
    const translation = new Vector3(
      this._anchorMercatorCoordinate.x,
      this._anchorMercatorCoordinate.y,
      this._anchorMercatorCoordinate.z
    );

    const world = Matrix.Compose(scale, rotation, translation);

    const projection = Matrix.FromArray(matrix);
    (projection as any)._m = matrix;
    this._camera.freezeProjectionMatrix(world.multiply(projection));

    this._scene.render();
    this._resetState(this._engine);
    this._map.triggerRepaint();
  }

  private _resetState(engine: Engine) {
    try {
      engine.wipeCaches(true);
    } catch (e) {
      /* ignore */
    }
  }

  private getCustomLayer(): CustomLayerInterface {
    return {
      id: "babylonjs-layer",
      type: "custom",
      renderingMode: "3d",
      onAdd: this._onAdd.bind(this),
      render: this._render.bind(this),
    };
  }
}
