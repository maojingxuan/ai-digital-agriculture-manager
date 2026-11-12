"""Verify that video sampling keeps the endpoints and a short changed scene."""
import os
import tempfile

import cv2
import numpy as np

from yolo_video_diagnosis import extract_key_frames


with tempfile.TemporaryDirectory(prefix="video-sampling-", dir=os.path.dirname(__file__)) as work_dir:
    video_path = os.path.join(work_dir, "sample.avi")
    writer = cv2.VideoWriter(video_path, cv2.VideoWriter_fourcc(*"MJPG"), 10, (64, 64))
    assert writer.isOpened()
    for index in range(90):
        frame = np.zeros((64, 64, 3), dtype=np.uint8)
        if 45 <= index <= 50:
            frame[:] = 255
        writer.write(frame)
    writer.release()

    frames, total, fps = extract_key_frames(video_path, max_frames=12)
    indices = [frame["index"] for frame in frames]
    assert total == 90, total
    assert len(frames) <= 12, indices
    assert indices[0] == 0 and indices[-1] == 89, indices
    assert any(45 <= index <= 51 for index in indices), indices

print("Video sampling retains endpoints and short changed scene")
