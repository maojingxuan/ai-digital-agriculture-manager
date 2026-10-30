import { useEffect, useMemo, useState } from "react";
import type { AvatarAction } from "./avatarActions";
import type { CameraPreset } from "../assistant/assistantContext";

const assetBase = `${import.meta.env.BASE_URL}xiaomo/`;

const CLIP_FRAMES: Record<string, string[]> = {
  idle: ["idle-01.png", "idle-02.png", "idle-03.png", "idle-04.png"],
  blink: ["blink-01.png", "blink-02.png", "blink-03.png", "blink-04.png", "blink-05.png"],
  jump: ["jump-01.png", "jump-02.png", "jump-03.png", "jump-04.png", "jump-05.png"],
  shake: ["shake-01.png", "shake-02.png", "shake-03.png", "shake-04.png", "shake-05.png"],
  squish: ["squish-01.png", "squish-02.png", "squish-03.png", "squish-04.png", "squish-05.png"],
};
const STATIC_FRAME = "core-ip.png";
const FRAME_MS = 150;
const BLINK_MS = 520;
const BLINK_INTERVAL_MS = 3600;

// 原数字人五套动作 -> 小墨的动画片段映射
const actionToClip: Record<AvatarAction, string> = {
  Idle: "idle", // 待机：呼吸起伏
  Wave: "jump", // 打招呼：跳跃
  Listening: "idle", // 倾听：保持待机微动
  Thinking: "shake", // 思考：摇晃
  Talking: "squish", // 讲话：挤压感
};

// 原 3D 镜头预设 -> 2D 缩放（full 全身 / portrait 半身 / close 特写）
const cameraScale: Record<CameraPreset, number> = {
  full: 1,
  portrait: 1.4,
  close: 1.9,
};

export default function XiaoMoAvatar({
  action,
  cameraPreset = "full",
  cameraRevision = 0,
  reducedMotion = false,
  active = true,
}: {
  action: AvatarAction;
  cameraPreset?: CameraPreset;
  cameraRevision?: number;
  reducedMotion?: boolean;
  active?: boolean;
}) {
  const [clip, setClip] = useState<string>(actionToClip[action]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [blinking, setBlinking] = useState(false);
  const [scale, setScale] = useState<number>(cameraScale[cameraPreset]);

  // 动作切换 -> 切换到对应动画片段
  useEffect(() => {
    setClip(actionToClip[action]);
    setFrameIndex(0);
  }, [action]);

  const clipFrames = useMemo(() => CLIP_FRAMES[clip], [clip]);

  // 帧循环
  useEffect(() => {
    if (reducedMotion || !active) return;
    const id = window.setInterval(
      () => setFrameIndex((index) => (index + 1) % clipFrames.length),
      FRAME_MS,
    );
    return () => window.clearInterval(id);
  }, [clip, clipFrames.length, reducedMotion, active]);

  // 待机时周期眨眼（叠加在 idle 上）
  useEffect(() => {
    if (reducedMotion || !active || clip !== "idle") {
      setBlinking(false);
      return;
    }
    const timer = window.setInterval(() => {
      setBlinking(true);
      window.setTimeout(() => setBlinking(false), BLINK_MS);
    }, BLINK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [clip, reducedMotion, active]);

  // 镜头预设 -> 缩放；cameraRevision 变化时重新应用
  useEffect(() => {
    setScale(cameraScale[cameraPreset]);
  }, [cameraPreset, cameraRevision]);

  const source = reducedMotion
    ? `${assetBase}${STATIC_FRAME}`
    : blinking
      ? `${assetBase}${CLIP_FRAMES.blink[Math.min(frameIndex, CLIP_FRAMES.blink.length - 1)]}`
      : `${assetBase}${clipFrames[frameIndex]}`;

  return (
    <div
      className="xiaomo-stage"
      data-avatar-action={action}
      data-camera-preset={cameraPreset}
      aria-label="小墨桌宠数字人"
    >
      <img
        className="xiaomo-sprite"
        src={source}
        alt="小墨桌宠"
        draggable={false}
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}
