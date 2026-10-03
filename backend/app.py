"""PushUp Pal backend: authentication, health checks, and workout history."""

import os
import secrets
from collections import defaultdict
from datetime import datetime, timezone

from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, url_for
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, current_user, login_required, login_user, logout_user
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, template_folder="../frontend/templates", static_folder="../frontend/static")
AI_DIRECTORY = os.path.join(os.path.dirname(app.root_path), "ai_detection")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or secrets.token_urlsafe(32)
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///users.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

allowed_origins = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5000")
CORS(app, supports_credentials=True, origins=[allowed_origins])
db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"


@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith("/api/"):
        return jsonify({"error": "login_required"}), 401
    return redirect(url_for("login", next=request.full_path))


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    workouts = db.relationship("Workout", backref="user", lazy=True, cascade="all, delete-orphan")

    @property
    def is_admin(self):
        admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
        return bool(admin_email) and self.email == admin_email


class Workout(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    repetitions = db.Column(db.Integer, nullable=False)
    duration_seconds = db.Column(db.Integer, nullable=False)
    form_score = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


with app.app_context():
    db.create_all()


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "pushup-pal"})


@app.get("/ai/<path:filename>")
def ai_asset(filename):
    return send_from_directory(AI_DIRECTORY, filename)


@app.get("/api/ping")
def ping():
    return jsonify({"message": "PushUp Pal backend is ready!"})


@app.post("/api/workouts")
@login_required
def create_workout():
    payload = request.get_json(silent=True) or {}
    try:
        repetitions = int(payload["repetitions"])
        duration_seconds = int(payload["duration_seconds"])
        form_score = float(payload["form_score"]) if payload.get("form_score") is not None else None
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "repetitions and duration_seconds must be numbers"}), 400
    if repetitions < 0 or duration_seconds < 0 or (form_score is not None and not 0 <= form_score <= 1):
        return jsonify({"error": "workout values are outside the allowed range"}), 400

    workout = Workout(
        user_id=current_user.id if current_user.is_authenticated else None,
        repetitions=repetitions,
        duration_seconds=duration_seconds,
        form_score=form_score,
    )
    db.session.add(workout)
    db.session.commit()
    return jsonify({"id": workout.id, "message": "Workout saved"}), 201


@app.get("/api/workouts")
def list_workouts():
    query = Workout.query
    if current_user.is_authenticated:
        query = query.filter_by(user_id=current_user.id)
    else:
        query = query.filter_by(user_id=None)
    workouts = query.order_by(Workout.created_at.desc()).limit(20).all()
    return jsonify([
        {
            "id": workout.id,
            "repetitions": workout.repetitions,
            "duration_seconds": workout.duration_seconds,
            "form_score": workout.form_score,
            "created_at": workout.created_at.isoformat(),
        }
        for workout in workouts
    ])


@app.get("/api/progress")
@login_required
def progress():
    workouts = Workout.query.filter_by(user_id=current_user.id).order_by(Workout.created_at.asc()).all()
    daily = defaultdict(lambda: {"workouts": 0, "repetitions": 0, "duration_seconds": 0})
    for workout in workouts:
        day = workout.created_at.date().isoformat()
        daily[day]["workouts"] += 1
        daily[day]["repetitions"] += workout.repetitions
        daily[day]["duration_seconds"] += workout.duration_seconds
    return jsonify({
        "user": current_user.email,
        "total_workouts": len(workouts),
        "total_repetitions": sum(workout.repetitions for workout in workouts),
        "days": daily,
    })


@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    error = ""
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        if not email or len(password) < 8:
            error = "Use an email and a password with at least 8 characters."
        elif User.query.filter_by(email=email).first():
            error = "That email is already registered."
        else:
            user = User(email=email, password_hash=generate_password_hash(password))
            db.session.add(user)
            db.session.commit()
            login_user(user)
            return redirect(url_for("dashboard"))
    return render_template(
        "auth.html",
        title="Create account",
        action="Register",
        autocomplete="new-password",
        error=error,
        alternate_url="/login",
        alternate_text="Already have an account?",
    )


@app.route("/login", methods=["GET", "POST"])
def login():
    error = ""
    if request.method == "POST":
        user = User.query.filter_by(email=request.form.get("email", "").strip().lower()).first()
        if user and check_password_hash(user.password_hash, request.form.get("password", "")):
            login_user(user)
            next_url = request.args.get("next")
            if next_url and next_url.startswith("/") and not next_url.startswith("//"):
                return redirect(next_url)
            return redirect(url_for("dashboard"))
        error = "Email or password is incorrect."
    return render_template(
        "auth.html",
        title="Welcome back",
        action="Log in",
        autocomplete="current-password",
        error=error,
        alternate_url="/register",
        alternate_text="Create an account",
    )


@app.get("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("home"))


@app.get("/dashboard")
@login_required
def dashboard():
    return redirect(url_for("progress_page"))


@app.get("/progress")
@login_required
def progress_page():
    return render_template("progress.html")


@app.get("/admin/users")
@login_required
def admin_users():
    if not current_user.is_admin:
        return render_template("admin_denied.html"), 403

    users = [
        {
            "id": user.id,
            "email": user.email,
            "workouts": len(user.workouts),
            "repetitions": sum(workout.repetitions for workout in user.workouts),
        }
        for user in User.query.order_by(User.id.asc()).all()
    ]
    return render_template("admin_users.html", users=users)


if __name__ == "__main__":
    app.run(
        debug=os.environ.get("FLASK_DEBUG") == "1",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "5000")),
    )
