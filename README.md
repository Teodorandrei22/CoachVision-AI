# PushUp Pal

<div align="center">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python" />
  <img alt="Flask" src="https://img.shields.io/badge/Flask-3.1-000000?style=for-the-badge&logo=flask" />
  <img alt="MediaPipe" src="https://img.shields.io/badge/MediaPipe-Pose-FE4B4B?style=for-the-badge" />
  <img alt="Frontend" src="https://img.shields.io/badge/Frontend-Browser%20Vision-5A67D8?style=for-the-badge" />
</div>

PushUp Pal is a browser-based fitness application that uses computer vision to
count push-ups and provide real-time form feedback. Pose detection runs in the
browser with MediaPipe, while the Flask backend manages authentication and
optional workout history.

> **Project status:** functional MVP for local development and demonstrations.

## ✨ Highlights

- 🎯 Real-time push-up counting and form feedback
- 🧠 Pose estimation directly in the browser
- 📈 Workout history and daily progress tracking
- 🔒 Optional authentication and protected admin access

## Features

- Browser-based push-up counting with MediaPipe Pose Landmarker
- Real-time body-alignment feedback and skeleton overlay
- Three-second movement calibration
- Workout timer, valid-repetition counter, and completion summary
- Encouraging feedback for both completed reps and zero-rep attempts
- Optional accounts and private workout history
- Progress calendar with daily workout totals, repetitions, and duration
- Responsive interface for desktop and mobile browsers
- Camera frames processed locally in the browser; they are not uploaded for
  pose detection

## Architecture

The Flask application serves the frontend and backend from one process. You do
not need to start separate frontend and backend servers.

```text
PushUp Pal
├── frontend/
│   ├── templates/          HTML templates served by Flask
│   └── static/             Browser JavaScript and CSS
├── backend/
│   ├── app.py              Flask app, authentication, API, and database models
│   ├── requirements.txt    Python dependencies
│   └── instance/           Local SQLite database (ignored by Git)
├── ai_detection/
│   └── pose_workout_tracker.js
│                           Browser pose detection and rep-counting logic
└── .gitignore
```

### Request flow

1. Flask serves the HTML, CSS, and browser JavaScript.
2. The browser imports the pose-tracking module from `/ai/pose_workout_tracker.js`.
3. The browser requests camera access and processes video frames locally.
4. When an authenticated workout finishes, the browser sends its summary to
   `POST /api/workouts`.
5. Flask stores account and workout data in a local SQLite database.

The MediaPipe package and WASM runtime are loaded from jsDelivr at runtime, so
an internet connection is required for pose detection unless those assets are
hosted locally.

## Requirements

- Python 3.10 or newer
- A modern browser with camera support
- A camera positioned so the user's full body is visible from the side
- Internet access for the MediaPipe CDN assets
- HTTPS for camera access on most phones; `localhost` is permitted for local
  desktop testing

## Installation

Clone the repository and enter the project directory:

```bash
git clone <your-repository-url>
cd ai_pose_estimation
```

Create and activate a virtual environment inside `backend/`:

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## Configuration

The backend reads configuration from environment variables. For a local
session, export the values in the same terminal before starting Flask:

```bash
export SECRET_KEY="replace-with-a-long-random-secret"
export ADMIN_EMAIL="admin@example.com"
export HOST="0.0.0.0"
export PORT="5000"
export FRONTEND_ORIGIN="http://localhost:5000"
```

You can use [backend/.env.example](./backend/.env.example) as a reference.
The application does not automatically load a `.env` file, so either export
the variables as shown above or configure them through your deployment
platform.

### Configuration variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `SECRET_KEY` | Signs Flask sessions. Use a stable random value outside development. | Random per process |
| `ADMIN_EMAIL` | Grants access to `/admin/users` to the matching account. | Disabled |
| `HOST` | Network interface used by Flask. | `0.0.0.0` |
| `PORT` | Port used by Flask. | `5000` |
| `FRONTEND_ORIGIN` | Allowed CORS origin when credentials are used. | `http://localhost:5000` |
| `DATABASE_URL` | SQLAlchemy database URL. | `sqlite:///users.db` |
| `FLASK_DEBUG` | Enables Flask debug mode only when set to `1`. | Disabled |

Never commit real secrets, `.env` files, SQLite databases, or password
credentials to GitHub.

## Run the application

From the `backend/` directory, with the virtual environment active:

```bash
python app.py
```

The terminal is expected to remain occupied while Flask is running. Open:

- Application: <http://localhost:5000>
- Health check: <http://localhost:5000/api/health>

Stop the server with `Ctrl+C`.

Only one process can use port `5000` at a time. If Flask reports
`Address already in use`, stop the existing server or choose another port:

```bash
PORT=5001 python app.py
```

If you change the port, open `http://localhost:5001` and update
`FRONTEND_ORIGIN` if cross-origin requests are involved.

## Use the app

1. Open the application in a supported browser.
2. Select **Log in** or create an account with **Register**.
3. Return to the workout page and select **Start workout**.
4. Grant camera permission when prompted.
5. Place the camera to the side and keep your shoulders, hips, knees, and feet
   visible.
6. Hold the starting position during the three-second calibration.
7. Perform controlled push-ups while following the live form feedback.
8. Select **Finish workout** to view the summary.
9. Select **Progress** to view saved workouts and the activity calendar.

Guest workouts can be performed, but workout history is associated with an
account only after logging in.

## Test on a phone

Your phone cannot use the laptop's `localhost` address. Both devices can use
the laptop's local network address, but camera permissions generally require a
secure context. A convenient option for development is LocalTunnel.

In one terminal, start Flask:

```bash
cd backend
. .venv/bin/activate
python app.py
```

In a second terminal, create an HTTPS tunnel:

```bash
npx localtunnel --port 5000
```

Open the generated `https://...loca.lt` URL on the phone and allow camera
access. Use the same tunnel hostname for registration, login, and workouts;
cookies from `localhost` are not shared with the LocalTunnel hostname.

## Administrator access

The normal interface does not display an Admin button. An administrator can
still access the protected page directly:

1. Set `ADMIN_EMAIL` before starting Flask.
2. Register or log in with that exact email address.
3. Open `/admin/users`, for example:
   <http://localhost:5000/admin/users>

The page displays account emails and aggregate workout statistics. Passwords
and password hashes are never displayed. Non-administrator accounts receive
`403 Forbidden`.

## API overview

| Method | Endpoint | Authentication | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | Service health check |
| `GET` | `/api/ping` | No | Backend availability check |
| `POST` | `/api/workouts` | Yes | Save a workout summary |
| `GET` | `/api/workouts` | No | List recent workouts for the current user or guest records |
| `GET` | `/api/progress` | Yes | Return authenticated progress totals and daily activity |
| `GET` | `/ai/<filename>` | No | Serve the browser pose-tracking module |

The workout creation endpoint accepts JSON with:

```json
{
  "repetitions": 12,
  "duration_seconds": 90,
  "form_score": 0.92
}
```

`duration_seconds` must be an integer.

## Privacy and security notes

- Camera frames are processed in the browser by the pose-tracking module.
- Account passwords are stored as Werkzeug password hashes, not plaintext.
- The local SQLite database is ignored by Git.
- Use a strong, stable `SECRET_KEY` for persistent sessions.
- The built-in Flask server is intended for development, not production.
- A production deployment should use HTTPS, a production WSGI server,
  database backups, rate limiting, CSRF protection, and managed secrets.

## Development

Useful checks:

```bash
# From the project root
backend/.venv/bin/python -m py_compile backend/app.py

# Check the backend health endpoint while Flask is running
curl http://127.0.0.1:5000/api/health
```

There are currently no automated browser tests. Manual testing should include
registration, login persistence, camera permission handling, zero-rep
completion, successful rep counting, progress history, and mobile access.

## Roadmap

- Add automated API and browser tests
- Add achievements, streaks, and progress charts
- Improve deployment configuration
- Replace SQLite with a managed production database when needed

## License

This project is licensed under the [MIT License](./LICENSE).

Permission is granted to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the software, provided that the copyright
notice and permission notice are included in all copies or substantial portions
of the software.
