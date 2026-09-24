const SUPABASE_URL = "https://hrajelqvbtqehvwtdfln.supabase.co";
const SUPABASE_KEY = "sb_publishable_RxcqgmURzFDGqnYpoPCQbQ_-YPC_1MJ";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let tasks = [];
let currentFilter = "all";


// ===============================
// DATE
// ===============================

function updateDate() {
    const now = new Date();

    document.getElementById("currentDay").textContent =
        now.toLocaleDateString("en-US", { weekday: "long" });

    document.getElementById("currentDate").textContent =
        now.toLocaleDateString("en-US", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
}

updateDate();


// ===============================
// SUPABASE: LOAD
// ===============================

async function loadTasks() {

    const { data, error } = await supabaseClient
        .from("tasks")
        .select("*");

    if (error) {
        console.error("Failed to load tasks:", error.message);
        return;
    }

    tasks = data;
    renderTasks();
}


// ===============================
// SUPABASE: REALTIME SYNC
// ===============================

function subscribeToChanges() {

    return supabaseClient
        .channel("tasks-changes")
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "tasks" },
            () => {
                loadTasks();
            }
        )
        .subscribe();
}


// ===============================
// DATE HELPERS
// ===============================

function getDeadline(task) {
    return new Date(`${task.date}T${task.time}`);
}

function formatDate(dateString) {
    const date = new Date(dateString + "T00:00");

    return date.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function isSoon(task) {
    const now = new Date();
    const deadline = getDeadline(task);
    const difference = deadline.getTime() - now.getTime();
    const hours = difference / (1000 * 60 * 60);

    return hours >= 0 && hours <= 48;
}

function isOverdue(task) {
    return !task.completed && getDeadline(task) < new Date();
}


// ===============================
// RENDER
// ===============================

function renderTasks() {

    const container = document.getElementById("taskList");
    const empty = document.getElementById("emptyState");

    container.innerHTML = "";

    let filtered = tasks.filter(task => {
        if (currentFilter === "completed") return task.completed;
        if (currentFilter === "upcoming") return !task.completed && !isOverdue(task);
        if (currentFilter === "soon") return !task.completed && isSoon(task);
        return true;
    });

    // soonest deadline first
    filtered.sort((a, b) => getDeadline(a) - getDeadline(b));

    empty.style.display = filtered.length === 0 ? "block" : "none";

    filtered.forEach(task => {

        const element = document.createElement("div");
        element.className = "task" + (task.completed ? " completed" : "");

        let deadlineClass = "";
        if (isOverdue(task)) deadlineClass = "overdue";
        else if (isSoon(task)) deadlineClass = "soon";

        element.innerHTML = `
            <button
                class="check ${task.completed ? "done" : ""}"
                onclick="toggleTask('${task.id}')"
            >
                ${task.completed ? "✓" : ""}
            </button>

            <div>
                <div class="task-title">${escapeHTML(task.title)}</div>
                <span class="subject">${escapeHTML(task.subject)}</span>
                ${
                    task.notes
                        ? `<div class="notes">${escapeHTML(task.notes)}</div>`
                        : ""
                }
            </div>

            <div class="deadline ${deadlineClass}">
                <div class="deadline-date">${formatDate(task.date)}</div>
                <div class="deadline-time">${task.time}</div>
                ${
                    isOverdue(task)
                        ? `<small>OVERDUE</small>`
                        : isSoon(task)
                        ? `<small>⚠ Due soon</small>`
                        : ""
                }
            </div>

            <div class="task-actions">
                <button class="delete-task" onclick="deleteTask('${task.id}')">×</button>
            </div>
        `;

        container.appendChild(element);
    });

    updateStats();
}


// ===============================
// STATS
// ===============================

function updateStats() {

    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const upcoming = tasks.filter(t => !t.completed && !isOverdue(t)).length;
    const soon = tasks.filter(t => !t.completed && isSoon(t)).length;

    document.getElementById("totalTasks").textContent = total;
    document.getElementById("completedTasks").textContent = completed;
    document.getElementById("upcomingTasks").textContent = upcoming;
    document.getElementById("dueSoon").textContent = soon;
}


// ===============================
// TOGGLE
// ===============================

async function toggleTask(id) {

    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Checking a task off removes it from Supabase right away,
    // instead of keeping it around as a completed row.
    const { error } = await supabaseClient
        .from("tasks")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Failed to complete task:", error.message);
        return;
    }

    await loadTasks();
}


// ===============================
// DELETE
// ===============================

async function deleteTask(id) {

    if (!confirm("Delete this assignment?")) return;

    const { error } = await supabaseClient
        .from("tasks")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Failed to delete task:", error.message);
        return;
    }

    await loadTasks();
}


// ===============================
// MODAL
// ===============================

const modal = document.getElementById("taskModal");

document.getElementById("addTaskBtn").addEventListener("click", () => {
    modal.classList.add("show");
});

document.getElementById("closeModal").addEventListener("click", () => {
    modal.classList.remove("show");
});

modal.addEventListener("click", e => {
    if (e.target === modal) modal.classList.remove("show");
});


// ===============================
// ADD TASK
// ===============================

document.getElementById("taskForm").addEventListener("submit", async e => {
    e.preventDefault();

    const newTask = {
        title: document.getElementById("taskTitle").value,
        subject: document.getElementById("taskSubject").value,
        date: document.getElementById("taskDate").value,
        time: document.getElementById("taskTime").value,
        notes: document.getElementById("taskNotes").value,
        reminder: document.getElementById("taskReminder").checked,
        completed: false
    };

    const { data, error } = await supabaseClient
        .from("tasks")
        .insert([newTask])
        .select();

    if (error) {
        console.error("Failed to add task:", error.message);
        alert("Couldn't save that task — check the console for details.");
        return;
    }

    document.getElementById("taskForm").reset();
    modal.classList.remove("show");

    if (data && data[0]) {
        scheduleReminder(data[0]);
    }

    await loadTasks();
});


// ===============================
// FILTERS
// ===============================

document.querySelectorAll(".filter").forEach(button => {
    button.addEventListener("click", () => {

        document.querySelectorAll(".filter").forEach(btn =>
            btn.classList.remove("active")
        );

        button.classList.add("active");
        currentFilter = button.dataset.filter;
        renderTasks();
    });
});


// ===============================
// NOTIFICATIONS
// ===============================

document.getElementById("notificationBtn").addEventListener("click", async () => {

    if (!("Notification" in window)) {
        alert("Your browser does not support notifications.");
        return;
    }

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
        document.getElementById("notificationBtn").textContent =
            "✓ Notifications Enabled";

        new Notification("X-Equillixerra", {
            body: "Assignment reminders are now enabled."
        });
    }
});


// ===============================
// REMINDER
// ===============================

function scheduleReminder(task) {

    if (!task.reminder) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const deadline = getDeadline(task);

    // reminder = 24 hours before
    const reminderTime = deadline.getTime() - 24 * 60 * 60 * 1000;
    const delay = reminderTime - Date.now();

    if (delay <= 0) return;

    setTimeout(() => {
        new Notification("📚 Assignment Reminder", {
            body: `${task.title} is due tomorrow at ${task.time}.`
        });
    }, delay);
}

function restoreReminders() {
    tasks.forEach(task => {
        if (!task.completed) scheduleReminder(task);
    });
}


// ===============================
// SECURITY
// ===============================

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}


// ===============================
// START
// ===============================

loadTasks().then(restoreReminders);
subscribeToChanges();
