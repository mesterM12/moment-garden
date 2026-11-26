import * as THREE from 'three';
import { BLOOM_FRONT_YAW } from './bloom-camera';

const MAP_SIZE = 1024;
const WINDOW_POSITION = new THREE.Vector3(-4, 6, 4.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), -BLOOM_FRONT_YAW);
const ORIGIN = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const WINDOW_DISTANCE = 16;

/** The camera observes a turntable: the window and its depth map stay with the
 * bouquet when the viewer turns it. Only a new cut or pose needs a depth pass. */
export class BouquetStudio extends THREE.Scene {
  private readonly key = new THREE.DirectionalLight(0xfff5e9, 2.9);
  private readonly rig = new THREE.Group();
  private readonly target = new THREE.Object3D();
  private readonly depthMaterial = new THREE.MeshDepthMaterial({
    colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1.4,
  });
  private readonly inverse = new THREE.Matrix4();
  private readonly localShadowMatrix = new THREE.Matrix4();
  private readonly localWindowView = new THREE.Matrix4();
  private readonly point = new THREE.Vector3();
  private readonly localKey = WINDOW_POSITION.clone().setLength(WINDOW_DISTANCE);
  private readonly worldUp = new THREE.Vector3();
  private bouquet: { plant: THREE.Group; readonly progress: number } | undefined;
  private lastProgress = NaN;
  private shadowUnavailable = false;

  constructor() {
    super();
    this.key.name = 'Window';
    const bounce = new THREE.DirectionalLight(0xfff0e6, .34);
    const rim = new THREE.DirectionalLight(0xffeedc, .65);
    this.key.target = bounce.target = rim.target = this.target;
    this.key.position.copy(this.localKey);
    bounce.position.set(4, 1, 3);
    rim.position.set(2, 3, -4);
    this.rig.add(new THREE.HemisphereLight(0xf3f4ff, 0xd8baa5, .77), this.key, bounce, rim, this.target);
    this.rig.matrixAutoUpdate = false;
    this.add(this.rig);
    const { shadow } = this.key;
    shadow.autoUpdate = false;
    shadow.mapSize.setScalar(MAP_SIZE);
    shadow.intensity = .93;
    shadow.radius = 2.35;
    // Thin double-sided surfaces have no outward direction. Bias in light
    // depth (plus slope-scaled polygon offset), not along a blade's normal.
    shadow.bias = -.0024;
    // Use the scene layer for the depth pass even if a view changes its mask.
    // Three otherwise inherits the view camera's mask for the default layer.
    shadow.camera.layers.enable(31);
  }

  setBouquet(bouquet: { plant: THREE.Group; readonly progress: number; framePoints: readonly THREE.Vector3[] }) {
    this.bouquet = bouquet;
    this.add(bouquet.plant);
    bouquet.plant.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = object.receiveShadow = true;
        // Three's depth program uses the very same absolute/relative morph
        // targets, influence arrays and instance transforms as the color pass.
        object.customDepthMaterial = this.depthMaterial;
      }
    });
    this.fitWindow(bouquet.framePoints);
    this.invalidateShadows();
  }

  private fitWindow(points: readonly THREE.Vector3[]) {
    const { shadow } = this.key;
    const camera = shadow.camera;
    // Fit the production cut's swept pose envelope in window space. Don't
    // refit to a view, a close-up, the visible heads, or the current morph.
    this.localWindowView.lookAt(this.localKey, ORIGIN, UP).setPosition(this.localKey).invert();
    const bounds = new THREE.Box3();
    for (const p of points) bounds.expandByPoint(this.point.copy(p).applyMatrix4(this.localWindowView));
    bounds.expandByScalar(.20);
    camera.left = bounds.min.x;
    camera.right = bounds.max.x;
    camera.bottom = bounds.min.y;
    camera.top = bounds.max.y;
    camera.near = -bounds.max.z;
    camera.far = -bounds.min.z;
    camera.updateProjectionMatrix();
  }

  /** Diagnostics that hide a head without posing or replacing the cut call this. */
  invalidateShadows() { this.lastProgress = NaN; }

  private prepareMap(renderer: THREE.WebGLRenderer) {
    const { shadow } = this.key;
    if (shadow.map || this.shadowUnavailable) return;
    // One single-sampled R8 color attachment (unused; WebGLRenderTarget
    // requires it) and one DEPTH_COMPONENT24 map, about 5 MiB altogether.
    const depth = new THREE.DepthTexture(MAP_SIZE, MAP_SIZE);
    depth.compareFunction = THREE.LessEqualCompare;
    depth.minFilter = depth.magFilter = THREE.LinearFilter;
    const map = new THREE.WebGLRenderTarget(MAP_SIZE, MAP_SIZE, { depthTexture: depth, format: THREE.RedFormat });
    const previous = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel();
    const gl = renderer.getContext();
    shadow.map = map;
    try {
      renderer.setRenderTarget(map);
      this.shadowUnavailable = gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE;
    } finally {
      renderer.setRenderTarget(previous, face, level);
      if (this.shadowUnavailable) this.releaseMap();
    }
  }

  override onBeforeRender(renderer: THREE.WebGLRenderer) {
    const { bouquet, key } = this;
    if (!bouquet) return;
    const { shadow } = key;
    if (renderer.shadowMap.enabled) this.prepareMap(renderer);
    key.castShadow = renderer.shadowMap.enabled && !this.shadowUnavailable;
    const world = bouquet.plant.matrixWorld;
    this.rig.matrix.copy(world);
    this.rig.updateMatrixWorld(true);
    if (!key.castShadow) return;
    this.inverse.copy(world).invert();
    shadow.needsUpdate = this.lastProgress !== bouquet.progress;
    if (shadow.needsUpdate) {
      shadow.camera.up.copy(this.worldUp.copy(UP).transformDirection(world));
      renderer.shadowMap.needsUpdate = true;
    } else {
      shadow.matrix.multiplyMatrices(this.localShadowMatrix, this.inverse);
    }
  }

  override onAfterRender(_renderer: THREE.WebGLRenderer) {
    if (!this.key.castShadow || !this.bouquet || this.lastProgress === this.bouquet.progress) return;
    this.localShadowMatrix.multiplyMatrices(this.key.shadow.matrix, this.bouquet.plant.matrixWorld);
    this.lastProgress = this.bouquet.progress;
  }

  /** Three rebuilds GL state after loss. A cached map's old pixels are gone. */
  resetShadows() {
    this.releaseMap();
    this.shadowUnavailable = false;
    this.invalidateShadows();
  }

  private releaseMap() {
    this.key.shadow.dispose();
    this.key.shadow.map = null;
  }

  dispose() {
    this.releaseMap();
    this.depthMaterial.dispose();
    this.bouquet = undefined;
    this.clear();
  }
}
