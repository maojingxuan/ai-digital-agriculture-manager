# -*- coding: utf-8 -*-
"""YOLO 视频关键帧病虫害诊断。

工作流程：
1. 用 OpenCV 打开上传的视频，按「均匀采样 + 场景变化加权」抽取最多 max_frames 个关键帧；
2. 对每个关键帧复用 yolo_inference.infer_image() 做 YOLO 目标检测并生成标注图；
3. 按类别跨帧聚合（每类保留置信度最高的一次检出），输出结构化 JSON。
"""
import argparse
import json
import os
import sys

# Keep Ultralytics runtime settings inside the project (same as yolo_inference.py).
PROJECT_CONFIG_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".ultralytics"))
os.environ.setdefault("YOLO_CONFIG_DIR", PROJECT_CONFIG_DIR)
os.makedirs(os.environ["YOLO_CONFIG_DIR"], exist_ok=True)

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

# Reuse the detection / translation logic from the single-image script.
# Script dir is prepended to sys.path when invoked directly, so this import works.
from yolo_inference import infer_image  # noqa: E402


def extract_key_frames(video_path, max_frames):
    """抽取关键帧。

    Returns:
        list of dicts: [{index, timeSec, frame}] 按时间顺序排列，
        最多 max_frames 个；策略为均匀采样保证全程覆盖，
        同时按帧间灰度差（场景变化）加权，优先保留画面变化显著的帧。

    注意：部分 MediaRecorder 录制的 webm 的帧数/fps 元数据异常，
    且 FFmpeg 后端按帧号 seek 后 read 会失败（seek 不可靠）。
    因此采用「两遍顺序读取」：第一遍扫描并选出候选帧索引，
    第二遍从头顺序读取、按索引取帧，完全不依赖 seek。
    """
    import cv2

    def open_cap():
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"无法打开视频文件: {video_path}")
        return cap

    cap = open_cap()
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        if not fps or fps <= 0 or fps != fps or fps > 120:  # NaN / 异常值兜底
            fps = 30.0

        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if total <= 0 or total > 2_000_000:  # 元数据缺失/异常时退化为逐帧扫描
            total = 0

        scan_step = max(1, total // (max_frames * 8)) if total > 0 else 1

        sampled = []  # (index, gray_small, diff_score)
        prev_gray = None
        index = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if index % scan_step == 0:
                small = cv2.resize(frame, (128, 128))
                gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
                score = 0.0
                if prev_gray is not None:
                    score = float(cv2.absdiff(prev_gray, gray).mean())
                sampled.append((index, gray, score))
                prev_gray = gray
            index += 1

        if index == 0:
            raise RuntimeError("视频没有任何可读取的帧")

        # 均匀采样索引（保证时间覆盖）
        uniform = set()
        if max_frames > 0:
            for i in range(max_frames):
                uniform.add(int(round((index - 1) * i / max_frames)))
        # 场景变化最大的索引（保证关键帧强调）
        scene = sorted(
            (item[2], item[0]) for item in sampled
        )
        scene_top = {item[1] for item in scene[-max_frames:]}

        candidates = sorted(uniform | scene_top)
        # 若候选超出上限，按时间均匀压缩
        if len(candidates) > max_frames:
            step = len(candidates) / max_frames
            candidates = [candidates[int(i * step)] for i in range(max_frames)]

        # 第二遍：从头顺序读取，按索引取帧（不 seek）
        target_set = set(candidates)
        frames = []
        cap.release()
        cap = open_cap()
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx in target_set:
                frames.append({
                    "index": idx,
                    "timeSec": round(idx / fps, 2),
                    "frame": frame,
                })
                if len(frames) >= len(candidates):
                    break
            idx += 1
        return frames, index, fps
    finally:
        cap.release()


def main():
    parser = argparse.ArgumentParser(description="YOLO Video Key-frame Disease Diagnosis")
    parser.add_argument("--video", required=True, help="Path to input crop video")
    parser.add_argument("--model", required=True, help="Path to YOLO model .pt file")
    parser.add_argument("--output-dir", required=True, help="Directory to save original & annotated key frames")
    parser.add_argument("--conf", type=float, default=0.10, help="Confidence threshold")
    parser.add_argument("--max-frames", type=int, default=6, help="Max key frames to analyze")
    args = parser.parse_args()

    if not os.path.exists(args.video):
        print(json.dumps({"success": False, "error": f"Video not found: {args.video}"}, ensure_ascii=False))
        sys.exit(1)
    if not os.path.exists(args.model):
        print(json.dumps({"success": False, "error": f"Model not found: {args.model}"}, ensure_ascii=False))
        sys.exit(1)

    try:
        from ultralytics import YOLO

        os.makedirs(args.output_dir, exist_ok=True)

        key_frames, total_frames, fps = extract_key_frames(args.video, max_frames=args.max_frames)
        if not key_frames:
            raise RuntimeError("未从视频中抽取到任何关键帧")

        model = YOLO(args.model)

        frame_results = []
        all_detections = {}  # classId -> best detection (max confidence across frames)
        any_annotated = False

        for i, kf in enumerate(key_frames):
            frame_path = os.path.join(args.output_dir, f"frame_{i + 1:04d}.jpg")
            annotated_path = os.path.join(args.output_dir, f"frame_{i + 1:04d}_annotated.jpg")
            # 原帧落盘（标注图由 infer_image 绘制）
            cv2_ok = None
            import cv2
            cv2_ok = cv2.imwrite(frame_path, kf["frame"])
            if not cv2_ok:
                raise RuntimeError(f"关键帧保存失败: {frame_path}")

            res = infer_image(model, frame_path, annotated_path, conf=args.conf)

            dets = res.get("detections") or []
            if res.get("annotatedSaved"):
                any_annotated = True
            for det in dets:
                cls_id = det["classId"]
                prev = all_detections.get(cls_id)
                if prev is None or det["confidence"] > prev["confidence"]:
                    det = dict(det)
                    det["frameIndex"] = kf["index"]
                    det["timeSec"] = kf["timeSec"]
                    all_detections[cls_id] = det

            frame_results.append({
                "index": kf["index"],
                "timeSec": kf["timeSec"],
                "imagePath": frame_path,
                "annotatedPath": annotated_path if res.get("annotatedSaved") else None,
                "detectionsCount": len(dets),
                "topDisease": res.get("topDisease"),
                "confidence": res.get("confidence"),
                "riskLevel": res.get("riskLevel"),
            })

        aggregated = sorted(all_detections.values(), key=lambda d: d["confidence"], reverse=True)

        if aggregated:
            detected = True
            top_detection = aggregated[0]
            top_disease = top_detection["labelZh"]
            top_confidence = top_detection["confidence"]
            overall_risk = "high" if any(d["riskLevel"] == "high" for d in aggregated) else top_detection["riskLevel"]
        else:
            detected = False
            top_disease = "未检出显著病害或处于健康状态"
            top_confidence = 0.0
            overall_risk = "low"

        response = {
            "success": True,
            "detected": detected,
            "modelName": os.path.basename(args.model),
            "videoName": os.path.basename(args.video),
            "framesAnalyzed": len(frame_results),
            "frameCount": total_frames,
            "fps": round(fps, 2),
            "keyFrames": frame_results,
            "detections": aggregated,
            "detectionsCount": len(aggregated),
            "topDisease": top_disease,
            "confidence": top_confidence,
            "riskLevel": overall_risk,
            "annotatedSaved": any_annotated,
        }

        print("__YOLO_RESULT_START__")
        print(json.dumps(response, ensure_ascii=False))
        print("__YOLO_RESULT_END__")

    except Exception as e:
        err_res = {
            "success": False,
            "error": str(e)
        }
        print("__YOLO_RESULT_START__")
        print(json.dumps(err_res, ensure_ascii=False))
        print("__YOLO_RESULT_END__")
        sys.exit(1)


if __name__ == "__main__":
    main()
