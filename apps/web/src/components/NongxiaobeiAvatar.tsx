import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { AvatarAction } from "./avatarActions";
import type { CameraPreset } from "../assistant/assistantContext";

const assetBase = `${import.meta.env.BASE_URL}models/`;

export default function NongxiaobeiAvatar({
  action,
  cameraPreset = "full",
  cameraRevision = 0,
  reducedMotion = false,
  active = true,
  compact = false,
}: {
  action: AvatarAction;
  cameraPreset?: CameraPreset;
  cameraRevision?: number;
  reducedMotion?: boolean;
  active?: boolean;
  compact?: boolean;
}) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const playingRef = useRef<THREE.AnimationAction | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const optionsRef = useRef({ action, reducedMotion, active, cameraPreset });
  const frameCameraRef = useRef<((preset: CameraPreset) => void) | null>(null);
  useEffect(() => {
    optionsRef.current = { action, reducedMotion, active, cameraPreset };
  }, [action, reducedMotion, active, cameraPreset]);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    let disposed = false;
    let visible = true;
    let model: THREE.Group | null = null;
    const blinkMeshes: { mesh: THREE.Mesh; index: number }[] = [];
    let head: THREE.Object3D | undefined;
    let headBase = new THREE.Quaternion();
    let time = 0;
    let nextBlink = 2.5;
    let blinkStart = -1;
    let cameraMoving = false;
    let pointerX = 0;
    let pointerY = 0;
    const gazeRotation = new THREE.Quaternion();
    const gazeEuler = new THREE.Euler();
    const targetPosition = new THREE.Vector3();
    const targetLookAt = new THREE.Vector3();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    host.appendChild(renderer.domElement);
    const contextLost = (event: Event) => {
      event.preventDefault();
      setLoaded(false);
      setError(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcad7cd, 2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(3, 5, 6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xd9efff, 0.8);
    fillLight.position.set(-4, 2, -3);
    scene.add(fillLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI - 0.3;
    const stopCameraMove = () => {
      cameraMoving = false;
    };
    controls.addEventListener("start", stopCameraMove);
    const followPointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX = THREE.MathUtils.clamp(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -1,
        1,
      );
      pointerY = THREE.MathUtils.clamp(
        ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1,
        -1,
        1,
      );
    };
    const resetPointer = () => {
      pointerX = 0;
      pointerY = 0;
    };
    host.addEventListener("pointermove", followPointer);
    host.addEventListener("pointerleave", resetPointer);
    const clock = new THREE.Clock();

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (width > 1 && height > 1)
        frameCameraRef.current?.(optionsRef.current.cameraPreset);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    visibilityObserver.observe(host);

    const disposeModel = (root: THREE.Group) => {
      const materials = new Set<THREE.Material>();
      const geometries = new Set<THREE.BufferGeometry>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material);
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      const textures = new Set<THREE.Texture>();
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value instanceof THREE.Texture) textures.add(value);
        });
        material.dispose();
      });
      textures.forEach((texture) => {
        texture.dispose();
        if (texture.image instanceof ImageBitmap) texture.image.close();
      });
    };

    try {
      new GLTFLoader().load(
        `${assetBase}nongxiaobei-v2.glb`,
        (gltf) => {
          if (disposed) {
            disposeModel(gltf.scene);
            return;
          }
          model = gltf.scene;
          scene.add(model);
          const bounds = new THREE.Box3().setFromObject(model);
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          model.position.sub(center);
          const distance = Math.max(
            (size.y /
              (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) *
              1.15,
            4,
          );
          camera.position.set(distance * 0.4, distance * 0.14, distance);
          camera.lookAt(0, 0, 0);
          controls.target.set(0, 0, 0);
          controls.minDistance = distance * 0.65;
          controls.maxDistance = distance * 2.2;
          controls.update();
          head = model.getObjectByName("head");
          if (head) headBase = head.quaternion.clone();
          // The head bone is a neck pivot, not the visual face centre.
          model.updateMatrixWorld(true);
          const faceBounds = new THREE.Box3();
          model.traverse((object) => {
            if (
              object instanceof THREE.Mesh &&
              /^(Head |Ear |Eye|Brow |Cheek |Forehead |Forelock |Mouth |Muzzle |Nostril |Upper eyelid |Mane \| (Crown|Continuous crown|Swept crown))/.test(
                object.name,
              )
            ) {
              faceBounds.union(new THREE.Box3().setFromObject(object));
            }
          });
          const faceSize = !faceBounds.isEmpty()
            ? faceBounds.getSize(new THREE.Vector3())
            : undefined;
          const faceY = !faceBounds.isEmpty()
            ? faceBounds.getCenter(new THREE.Vector3()).y
            : size.y * 0.28;
          model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const index = object.morphTargetDictionary?.Blink;
            if (index !== undefined && object.morphTargetInfluences)
              blinkMeshes.push({ mesh: object, index });
          });
          frameCameraRef.current = (preset) => {
            const subjectHeight =
              preset === "full"
                ? size.y
                : preset === "portrait"
                  ? size.y * 0.75
                  : Math.max((faceSize?.y ?? 0) * 1.15, size.y * 0.4);
            const centerY =
              preset === "full"
                ? 0
                : preset === "portrait"
                  ? size.y * 0.5 - subjectHeight * 0.5
                  : faceY;
            const vertical =
              subjectHeight /
              (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
            const horizontal =
              (preset === "full"
                ? size.x
                : Math.max(faceSize?.x ?? 0, size.x * 0.7)) /
              (2 *
                Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
                camera.aspect);
            const framedDistance =
              Math.max(vertical, horizontal) * 1.16 +
              (preset === "full" ? size.z : (faceSize?.z ?? size.z)) * 0.5;
            targetLookAt.set(0, centerY, 0);
            targetPosition.set(
              framedDistance * 0.08,
              centerY + framedDistance * 0.03,
              framedDistance,
            );
            controls.minDistance = size.y * 0.25;
            controls.maxDistance = Math.max(distance, framedDistance) * 2.2;
            cameraMoving = true;
          };

          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;
          actionsRef.current = new Map(
            gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]),
          );
          setLoaded(true);
        },
        undefined,
        () => {
          if (!disposed) setError(true);
        },
      );
    } catch {
      setError(true);
    }

    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.05);
      if (!visible || document.hidden || !optionsRef.current.active) return;
      time += delta;
      const reduce = optionsRef.current.reducedMotion;
      if (head) head.quaternion.copy(headBase);
      mixerRef.current?.update(reduce ? 0 : delta);
      if (head) {
        headBase.copy(head.quaternion);
        if (!reduce) {
          gazeEuler.set(
            pointerY * 0.025 + Math.sin(time * 0.65) * 0.006,
            pointerX * 0.04 + Math.sin(time * 0.38) * 0.009,
            0,
          );
          gazeRotation.setFromEuler(gazeEuler);
          head.quaternion.multiply(gazeRotation);
        }
      }
      if (!reduce && time >= nextBlink && blinkStart < 0) {
        blinkStart = time;
        nextBlink = time + 3 + Math.random() * 3;
      }
      const elapsed = time - blinkStart;
      const blink =
        !reduce && blinkStart >= 0 && elapsed < 0.22
          ? Math.sin((elapsed / 0.22) * Math.PI)
          : 0;
      if (elapsed >= 0.22) blinkStart = -1;
      blinkMeshes.forEach(({ mesh, index }) => {
        mesh.morphTargetInfluences![index] = blink;
      });
      if (cameraMoving) {
        const blend = reduce ? 1 : 1 - Math.exp(-delta * 6);
        camera.position.lerp(targetPosition, blend);
        controls.target.lerp(targetLookAt, blend);
        if (camera.position.distanceToSquared(targetPosition) < 0.00001)
          cameraMoving = false;
      }
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      controls.dispose();
      controls.removeEventListener("start", stopCameraMove);
      host.removeEventListener("pointermove", followPointer);
      host.removeEventListener("pointerleave", resetPointer);
      frameCameraRef.current = null;
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      actionsRef.current.clear();
      playingRef.current = null;
      if (model) disposeModel(model);
      renderer.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.remove();
    };
  }, [retry]);

  useEffect(() => {
    if (loaded) frameCameraRef.current?.(cameraPreset);
  }, [cameraPreset, cameraRevision, loaded, compact]);

  useEffect(() => {
    if (!loaded) return;
    const next =
      actionsRef.current.get(action) ?? actionsRef.current.get("Idle");
    if (!next || next === playingRef.current) return;
    playingRef.current?.fadeOut(0.25);
    next.reset().fadeIn(0.25).play();
    playingRef.current = next;
  }, [action, loaded]);

  return (
    <div
      className="nongxiaobei-stage"
      data-avatar-action={action}
      data-camera-preset={cameraPreset}
    >
      <div
        ref={canvasHostRef}
        className="nongxiaobei-canvas"
        aria-label="可旋转的农小贝 V2 三维模型"
      />
      {!loaded && (
        <div className="nongxiaobei-placeholder" role="status">
          <span>
            {error
              ? "农小贝模型暂时无法显示，对话仍可使用。"
              : "正在加载农小贝 3D 模型…"}
          </span>
          {error && (
            <button
              className="secondary-button"
              onClick={() => {
                setLoaded(false);
                setError(false);
                setRetry((value) => value + 1);
              }}
            >
              重新加载模型
            </button>
          )}
        </div>
      )}
      {loaded && !compact && (
        <span className="nongxiaobei-hint">
          拖动旋转 · 滚轮缩放 · 镜头按钮可复位
        </span>
      )}
    </div>
  );
}
