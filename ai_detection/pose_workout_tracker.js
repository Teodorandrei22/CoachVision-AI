import { DrawingUtils, FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const CALIBRATION_MS = 3000;
const BODY_ALIGN_MIN = 150;
const POINTS = { shoulder: 12, elbow: 14, wrist: 16, hip: 24, ankle: 28 };

function angle3D(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1.reduce((sum, value, i) => sum + value * v2[i], 0);
  const magnitude = Math.hypot(...v1) * Math.hypot(...v2);
  if (!magnitude) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / magnitude))) * (180 / Math.PI);
}

export class PoseWorkoutTracker {
  constructor(video, canvas, onUpdate) {
    this.video = video;
    this.ctx = canvas.getContext("2d");
    this.onUpdate = onUpdate;
    this.landmarker = undefined;
    this.sessionStartMs = 0;
    this.repetitions = 0;
    this.stage = null;
    this.currentRepValid = true;
    this.calibrationAngles = [];
    this.downThreshold = undefined;
    this.upThreshold = undefined;
  }

  async initialize() {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }

  reset() {
    this.repetitions = 0;
    this.stage = null;
    this.currentRepValid = true;
    this.calibrationAngles = [];
    this.downThreshold = undefined;
    this.upThreshold = undefined;
    this.sessionStartMs = performance.now();
  }

  process(now) {
    const result = this.landmarker.detectForVideo(this.video, now);
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    if (result.landmarks?.length) {
      const drawer = new DrawingUtils(this.ctx);
      drawer.drawLandmarks(result.landmarks[0], { radius: 4, color: "#ffcf5a" });
      drawer.drawConnectors(result.landmarks[0], PoseLandmarker.POSE_CONNECTIONS, { color: "#8c75ff", lineWidth: 3 });
    }
    if (!result.worldLandmarks?.length) {
      this.onUpdate({ type: "notDetected" });
      return;
    }

    const points = result.worldLandmarks[0];
    const elbowAngle = angle3D(points[POINTS.shoulder], points[POINTS.elbow], points[POINTS.wrist]);
    const bodyAngle = angle3D(points[POINTS.shoulder], points[POINTS.hip], points[POINTS.ankle]);
    const elapsed = now - this.sessionStartMs;
    if (elapsed < CALIBRATION_MS) {
      this.calibrationAngles.push(elbowAngle);
      this.onUpdate({
        type: "calibration",
        seconds: Math.ceil((CALIBRATION_MS - elapsed) / 1000),
      });
      return;
    }

    if (this.downThreshold === undefined) {
      const low = Math.min(...this.calibrationAngles);
      const high = Math.max(...this.calibrationAngles);
      const span = high - low;
      [this.downThreshold, this.upThreshold] = span < 20 ? [100, 150] : [low + span * .25, high - span * .25];
    }
    if (bodyAngle < BODY_ALIGN_MIN) {
      this.currentRepValid = false;
      this.onUpdate({ type: "feedback", title: "Keep your body straight", message: "Try to make one long line from shoulders to feet.", tone: "warning", icon: "💡" });
    }
    if (elbowAngle < this.downThreshold) {
      this.stage = "down";
      if (bodyAngle >= BODY_ALIGN_MIN) {
        this.onUpdate({ type: "feedback", title: "Nice and low!", message: "Push back up when you are ready.", tone: "neutral", icon: "⬇️" });
      }
    }
    if (elbowAngle > this.upThreshold && this.stage === "down") {
      const valid = this.currentRepValid;
      if (valid) this.repetitions += 1;
      this.onUpdate({ type: "repetition", valid, repetitions: this.repetitions });
      this.stage = "up";
      this.currentRepValid = true;
    }
    this.onUpdate({ type: "stage", stage: this.stage || "Ready" });
  }
}
