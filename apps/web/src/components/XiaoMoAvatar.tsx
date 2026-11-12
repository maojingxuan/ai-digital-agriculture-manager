import { useEffect, useMemo, useState } from "react";
import type { AvatarAction } from "./avatarActions";
import type { CameraPreset } from "../assistant/assistantContext";

const assetBase = `${import.meta.env.BASE_URL}xiaomo/`;

// 新桌宠 v2 动作片段（来自 app.asar 内 character 配置）
const CLIP_FRAMES: Record<string, { frames: string[]; ms: number; loop: boolean }> = {
  idle: {
    frames: ["idle-01.png", "idle-02.png", "idle-03.png", "idle-04.png", "idle-05.png", "idle-06.png"],
    ms: 250,
    loop: true,
  },
  blink: {
    frames: ["blink-01.png", "blink-02.png", "blink-03.png", "blink-04.png", "blink-05.png"],
    ms: 70,
    loop: false,
  },
  wave: {
    frames: ["wave-01.png", "wave-02.png", "wave-03.png", "wave-04.png", "wave-05.png", "wave-06.png"],
    ms: 110,
    loop: true,
  },
  "open-mouth": {
    frames: ["open-mouth-01.png", "open-mouth-02.png", "open-mouth-03.png", "open-mouth-04.png", "open-mouth-05.png", "open-mouth-06.png"],
    ms: 110,
    loop: true,
  },
  "nod-yes": {
    frames: ["nod-yes-01.png", "nod-yes-02.png", "nod-yes-03.png", "nod-yes-04.png", "nod-yes-05.png", "nod-yes-06.png"],
    ms: 110,
    loop: true,
  },
  "shake-no": {
    frames: ["shake-no-01.png", "shake-no-02.png", "shake-no-03.png", "shake-no-04.png", "shake-no-05.png", "shake-no-06.png"],
    ms: 100,
    loop: true,
  },
};
const STATIC_FRAME = "core-ip.png";
const BLINK_INTERVAL_MS = 3800;

// 原数字人五套动作 -> 新桌宠 v2 片段映射
const actionToClip: Record<AvatarAction, string> = {
  Idle: "idle",         // 待机：呼吸起伏
  Wave: "wave",         // 打招呼：挥手
  Listening: "idle",    // 倾听：保持待机微动
  Thinking: "nod-yes",  // 思考：点头（像在琢磨）
  Talking: "open-mouth",// 讲话：张嘴说话
};

// 镜头预设 -> 2D 缩放
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

  const clipDef = useMemo(() => CLIP_FRAMES[clip], [clip]);
  const clipFrames = clipDef.frames;

  // 帧循环
  useEffect(() => {
    if (reducedMotion || !active) return;
    const id = window.setInterval(
      () => setFrameIndex((index) => (index + 1) % clipFrames.length),
      clipDef.ms,
    );
    return () => window.clearInterval(id);
  }, [clip, clipFrames.length, clipDef.ms, reducedMotion, active]);

  // 待机时周期眨眼（叠加在 idle 上）
  useEffect(() => {
    if (reducedMotion || !active || clip !== "idle") {
      setBlinking(false);
      return;
    }
    const timer = window.setInterval(() => {
      setBlinking(true);
      window.setTimeout(() => setBlinking(false), CLIP_FRAMES.blink.frames.length * CLIP_FRAMES.blink.ms);
    }, BLINK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [clip, reducedMotion, active]);

  // 镜头预设 -> 缩放
  useEffect(() => {
    setScale(cameraScale[cameraPreset]);
  }, [cameraPreset, cameraRevision]);

  const source = reducedMotion
    ? `${assetBase}${STATIC_FRAME}`
    : blinking
      ? `${assetBase}${CLIP_FRAMES.blink.frames[Math.min(frameIndex, CLIP_FRAMES.blink.frames.length - 1)]}`
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
