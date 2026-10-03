const $ = (id) => document.getElementById(id);
const video = $("webcam");
const canvas = $("overlay");
const startBtn = $("startBtn");
const stopBtn = $("stopBtn");
const retryBtn = $("retryBtn");
const cameraPlaceholder = $("cameraPlaceholder");
const cameraError = $("cameraError");
const cameraErrorText = $("cameraErrorText");
const cameraBadge = $("cameraBadge");
const feedbackCard = $("feedbackCard");
const feedbackTitle = $("feedbackTitle");
const feedback = $("feedback");
const feedbackIcon = $("feedbackIcon");
const stageDisplay = $("stage");
const repDisplay = $("repCount");
const timerDisplay = $("timer");
const summaryModal = $("summaryModal");

let tracker;
let stream;
let running = false;
let animationId;
let timerInterval;
let startTimeMs;
let reps = 0;

function setFeedback(title, message, tone = "neutral", icon = "👋") {
  feedbackTitle.textContent = title;
  feedback.textContent = message;
  feedbackCard.dataset.tone = tone;
  feedbackIcon.textContent = icon;
}

function setLoading(loading) {
  startBtn.disabled = loading;
  startBtn.innerHTML = loading ? "<span>⌛</span> Loading coach..." : "<span>▶</span> Start workout";
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported by this browser.");
  stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
  video.srcObject = stream;
  await new Promise((resolve) => { video.onloadedmetadata = resolve; });
}

function resetSession() {
  reps = 0;
  tracker.reset();
  repDisplay.textContent = "0";
  stageDisplay.textContent = "Calibrating";
  $("missionCount").textContent = "0";
  $("missionProgress").style.width = "0%";
  setFeedback("Get ready!", "Hold your push-up position for 3 seconds.", "warning", "⏱️");
}

function updateTimer() {
  const elapsed = Math.floor((performance.now() - startTimeMs) / 1000);
  const value = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  timerDisplay.textContent = value;
}

function handlePoseUpdate(update) {
  if (update.type === "calibration") {
    stageDisplay.textContent = `Calibrating ${update.seconds}`;
    setFeedback("Learning your movement", `Almost ready... ${update.seconds}`, "warning", "⏱️");
  } else if (update.type === "feedback") {
    setFeedback(update.title, update.message, update.tone, update.icon);
  } else if (update.type === "repetition") {
    reps = update.repetitions;
    setFeedback(
      update.valid ? "Great repetition!" : "Nearly there!",
      update.valid ? "That one counted. Keep going!" : "That rep did not count, but your next one can.",
      update.valid ? "success" : "warning",
      update.valid ? "⭐" : "💪",
    );
    repDisplay.textContent = reps;
    $("missionCount").textContent = reps;
    $("missionProgress").style.width = `${Math.min(100, reps * 5)}%`;
  } else if (update.type === "stage") {
    stageDisplay.textContent = update.stage;
  } else if (update.type === "notDetected") {
    setFeedback("Step into view", "I need to see your full body to count.", "warning", "👀");
    stageDisplay.textContent = "Not detected";
  }
}

function predictLoop() {
  if (!running) return;
  const now = performance.now();
  tracker.process(now);
  animationId = requestAnimationFrame(predictLoop);
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = undefined;
  video.srcObject = null;
}

async function saveWorkout(durationText) {
  const [minutes, seconds] = durationText.split(":").map(Number);
  try {
    const response = await fetch("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ repetitions: reps, duration_seconds: minutes * 60 + seconds }),
    });
    if (response.status === 401) {
      $("connectionStatus").innerHTML = "<span></span> Log in to save progress";
      $("connectionStatus").querySelector("span").style.background = "var(--yellow)";
      return;
    }
    if (!response.ok) throw new Error(`Workout save failed (${response.status})`);
  } catch (error) {
    console.warn("Workout history is unavailable:", error);
    $("connectionStatus").innerHTML = "<span></span> History unavailable";
    $("connectionStatus").querySelector("span").style.background = "var(--yellow)";
  }
}

function showCameraError(error) {
  running = false;
  stopCamera();
  cameraPlaceholder.hidden = true;
  cameraError.hidden = false;
  cameraErrorText.textContent = error.message || "Please allow camera access and try again.";
  cameraBadge.textContent = "Camera unavailable";
  cameraBadge.classList.remove("active");
  setFeedback("Camera needs attention", "Allow camera access, then try again.", "warning", "📷");
}

async function startWorkout() {
  setLoading(true);
  cameraError.hidden = true;
  try {
    if (!tracker) {
      const { PoseWorkoutTracker } = await import("/ai/pose_workout_tracker.js");
      tracker = new PoseWorkoutTracker(video, canvas, handlePoseUpdate);
    }
    await tracker.initialize();
    await startCamera();
    resetSession();
    running = true;
    startTimeMs = performance.now();
    timerInterval = setInterval(updateTimer, 500);
    cameraPlaceholder.hidden = true;
    cameraBadge.textContent = "Camera live";
    cameraBadge.classList.add("active");
    stopBtn.disabled = false;
    startBtn.innerHTML = "<span>●</span> Workout running";
    predictLoop();
  } catch (error) {
    showCameraError(error);
    setLoading(false);
  }
}

function finishWorkout() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(animationId);
  clearInterval(timerInterval);
  const duration = timerDisplay.textContent;
  stopCamera();
  cameraPlaceholder.hidden = false;
  cameraBadge.textContent = "Camera off";
  cameraBadge.classList.remove("active");
  startBtn.disabled = false;
  startBtn.innerHTML = "<span>▶</span> Start workout";
  stopBtn.disabled = true;
  $("summaryReps").textContent = reps;
  $("summaryTime").textContent = duration;
  if (reps > 0) {
    $("summaryIcon").textContent = "🎉";
    $("summaryTitle").textContent = "You did it!";
    $("summaryMessage").textContent = "Every rep is a win. Ready for another round?";
    setFeedback("Workout saved!", "Nice work. Every rep is a win.", "success", "🎉");
  } else {
    $("summaryIcon").textContent = "💪";
    $("summaryTitle").textContent = "Great start!";
    $("summaryMessage").textContent = "You showed up today. Try one controlled rep next time!";
    setFeedback("Keep going!", "Your first rep is waiting for you.", "warning", "💪");
  }
  saveWorkout(duration);
  summaryModal.hidden = false;
}

startBtn.addEventListener("click", startWorkout);
stopBtn.addEventListener("click", finishWorkout);
retryBtn.addEventListener("click", startWorkout);
$("againBtn").addEventListener("click", () => { summaryModal.hidden = true; startWorkout(); });
$("closeSummary").addEventListener("click", () => { summaryModal.hidden = true; });
summaryModal.addEventListener("click", (event) => { if (event.target === summaryModal) summaryModal.hidden = true; });
