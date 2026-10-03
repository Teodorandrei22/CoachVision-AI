const $ = (id) => document.getElementById(id);
let dailyData = {};
let visibleMonth = new Date();

function renderCalendar() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  $("calendarTitle").textContent = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < mondayOffset; i += 1) cells.push("<span class=\"calendar-day empty\"></span>");
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const activity = dailyData[date];
    const reps = activity?.repetitions || 0;
    const level = reps === 0 ? 0 : reps < 10 ? 1 : reps < 20 ? 2 : 3;
    const label = activity ? `${reps} push-ups in ${activity.workouts} workout${activity.workouts === 1 ? "" : "s"}` : "Rest day";
    cells.push(`<span class="calendar-day level-${level}" title="${label}">${day}</span>`);
  }
  $("calendarGrid").innerHTML = cells.join("");
}

async function loadProgress() {
  try {
    const response = await fetch("/api/progress", { credentials: "include" });
    if (response.status === 401 || response.redirected) throw new Error("login");
    if (!response.ok) throw new Error("server");
    const data = await response.json();
    dailyData = data.days;
    $("welcomeMessage").textContent = `Welcome back, ${data.user}. Keep your movement adventure going!`;
    $("totalWorkouts").textContent = data.total_workouts;
    $("totalReps").textContent = data.total_repetitions;
    $("activeDays").textContent = Object.keys(data.days).length;
    $("progressContent").hidden = false;
    renderCalendar();
  } catch (error) {
    console.warn("Progress could not be loaded:", error);
    $("progressError").hidden = false;
  }
}

$("previousMonth").addEventListener("click", () => { visibleMonth.setMonth(visibleMonth.getMonth() - 1); renderCalendar(); });
$("nextMonth").addEventListener("click", () => { visibleMonth.setMonth(visibleMonth.getMonth() + 1); renderCalendar(); });
loadProgress();
