"""MindPulse API: derived sleep events only. Raw audio is never accepted or stored."""
import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from enum import Enum

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mindpulse.db")
JWT_SECRET = os.getenv("JWT_SECRET", "local-development-secret-change-me")
JWT_ALGORITHM = "HS256"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False)
bearer = HTTPBearer()

class Base(DeclarativeBase): pass
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True); email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255)); created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    babies: Mapped[list["Baby"]] = relationship(back_populates="user", cascade="all, delete-orphan")
class Baby(Base):
    __tablename__ = "babies"
    id: Mapped[int] = mapped_column(primary_key=True); user_id: Mapped[int] = mapped_column(ForeignKey("users.id")); name: Mapped[str] = mapped_column(String(100)); birth_month: Mapped[str | None] = mapped_column(String(7), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)); user: Mapped[User] = relationship(back_populates="babies")
    nights: Mapped[list["NightSession"]] = relationship(back_populates="baby", cascade="all, delete-orphan")
class NightSession(Base):
    __tablename__ = "night_sessions"
    id: Mapped[int] = mapped_column(primary_key=True); baby_id: Mapped[int] = mapped_column(ForeignKey("babies.id")); started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)); ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True); sleep_quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    baby: Mapped[Baby] = relationship(back_populates="nights"); events: Mapped[list["SleepEvent"]] = relationship(back_populates="night", cascade="all, delete-orphan")
class SleepEvent(Base):
    __tablename__ = "sleep_events"
    id: Mapped[int] = mapped_column(primary_key=True); night_session_id: Mapped[int] = mapped_column(ForeignKey("night_sessions.id")); event_type: Mapped[str] = mapped_column(String(32)); started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True)); ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True); sound_response: Mapped[str] = mapped_column(String(32))
    night: Mapped[NightSession] = relationship(back_populates="events"); outcomes: Mapped[list["SoundOutcome"]] = relationship(back_populates="event", cascade="all, delete-orphan")
class SoundOutcome(Base):
    __tablename__ = "sound_outcomes"
    id: Mapped[int] = mapped_column(primary_key=True); sleep_event_id: Mapped[int] = mapped_column(ForeignKey("sleep_events.id")); sound_response: Mapped[str] = mapped_column(String(32)); resettle_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event: Mapped[SleepEvent] = relationship(back_populates="outcomes")
class TrainingContribution(Base):
    __tablename__ = "training_contributions"
    id: Mapped[int] = mapped_column(primary_key=True); baby_id: Mapped[int] = mapped_column(ForeignKey("babies.id")); activity_spike: Mapped[float] = mapped_column(Float); rustle_density: Mapped[float] = mapped_column(Float); ambient_floor: Mapped[float] = mapped_column(Float); sleep_state: Mapped[str] = mapped_column(String(32)); parent_correction: Mapped[str | None] = mapped_column(String(32), nullable=True); created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Credentials(BaseModel): email: EmailStr; password: str = Field(min_length=8, max_length=128)
class BabyIn(BaseModel): name: str = Field(min_length=1, max_length=100); birth_month: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
class NightIn(BaseModel): baby_id: int
class EventIn(BaseModel): event_type: str = Field(pattern="^(deep_sleep|restless|active_disturbance|wake)$"); started_at: datetime; ended_at: datetime | None = None; sound_response: str = Field(pattern="^(none|white|pink|brown|lullaby)$"); resettle_seconds: int | None = Field(default=None, ge=0)
class EventBatch(BaseModel): events: list[EventIn] = Field(max_length=100)
class EndNight(BaseModel): sleep_quality_score: float = Field(ge=0, le=100)
class ContributionIn(BaseModel): activity_spike: float = Field(ge=0, le=1); rustle_density: float = Field(ge=0, le=1); ambient_floor: float = Field(ge=0, le=1); sleep_state: str = Field(pattern="^(deep_sleep|restless|active_disturbance)$"); parent_correction: str | None = None

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16); digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000); return f"{base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"
def verify_password(password: str, encoded: str) -> bool:
    salt, digest = encoded.split("$"); actual = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), 310_000); return hmac.compare_digest(actual, base64.b64decode(digest))
def token_for(user: User) -> str: return jwt.encode({"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(days=14)}, JWT_SECRET, algorithm=JWT_ALGORITHM)
def db_session():
    with SessionLocal() as db: yield db
def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(db_session)) -> User:
    try: user_id = int(jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])["sub"])
    except (JWTError, KeyError, ValueError): raise HTTPException(status_code=401, detail="Invalid session")
    user = db.get(User, user_id)
    if not user: raise HTTPException(status_code=401, detail="Invalid session")
    return user
def owned_baby(baby_id: int, user: User, db: Session) -> Baby:
    baby = db.get(Baby, baby_id)
    if not baby or baby.user_id != user.id: raise HTTPException(status_code=404, detail="Baby profile not found")
    return baby
def owned_night(night_id: int, user: User, db: Session) -> NightSession:
    night = db.get(NightSession, night_id)
    if not night: raise HTTPException(status_code=404, detail="Night session not found")
    owned_baby(night.baby_id, user, db); return night

app = FastAPI(title="MindPulse API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
@app.on_event("startup")
def create_tables(): Base.metadata.create_all(engine)
@app.get("/health")
def health(): return {"status": "ok", "audio_storage": "never"}
@app.post("/api/auth/signup")
def signup(payload: Credentials, db: Session = Depends(db_session)):
    if db.scalar(select(User).where(User.email == payload.email.lower())): raise HTTPException(status_code=409, detail="Email is already registered")
    user = User(email=payload.email.lower(), password_hash=hash_password(payload.password)); db.add(user); db.commit(); db.refresh(user); return {"token": token_for(user)}
@app.post("/api/auth/login")
def login(payload: Credentials, db: Session = Depends(db_session)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash): raise HTTPException(status_code=401, detail="Email or password is incorrect")
    return {"token": token_for(user)}
@app.get("/api/babies")
def list_babies(user: User = Depends(current_user), db: Session = Depends(db_session)): return [{"id": baby.id, "name": baby.name, "birth_month": baby.birth_month} for baby in user.babies]
@app.post("/api/babies")
def create_baby(payload: BabyIn, user: User = Depends(current_user), db: Session = Depends(db_session)):
    baby = Baby(user_id=user.id, **payload.model_dump()); db.add(baby); db.commit(); db.refresh(baby); return {"id": baby.id, "name": baby.name, "birth_month": baby.birth_month}
@app.post("/api/nights")
def start_night(payload: NightIn, user: User = Depends(current_user), db: Session = Depends(db_session)):
    owned_baby(payload.baby_id, user, db); night = NightSession(baby_id=payload.baby_id); db.add(night); db.commit(); db.refresh(night); return {"night_session_id": night.id}
@app.post("/api/nights/{night_id}/events")
def append_events(night_id: int, payload: EventBatch, user: User = Depends(current_user), db: Session = Depends(db_session)):
    night = owned_night(night_id, user, db)
    for item in payload.events:
        event = SleepEvent(night_session_id=night.id, event_type=item.event_type, started_at=item.started_at, ended_at=item.ended_at, sound_response=item.sound_response); db.add(event); db.flush()
        if item.resettle_seconds is not None: db.add(SoundOutcome(sleep_event_id=event.id, sound_response=item.sound_response, resettle_seconds=item.resettle_seconds))
    db.commit(); return {"accepted": len(payload.events)}
@app.post("/api/nights/{night_id}/end")
def end_night(night_id: int, payload: EndNight, user: User = Depends(current_user), db: Session = Depends(db_session)):
    night = owned_night(night_id, user, db); night.ended_at = datetime.now(timezone.utc); night.sleep_quality_score = payload.sleep_quality_score; db.commit(); return {"night_session_id": night.id, "sleep_quality_score": night.sleep_quality_score}
@app.get("/api/babies/{baby_id}/progress")
def progress(baby_id: int, user: User = Depends(current_user), db: Session = Depends(db_session)):
    owned_baby(baby_id, user, db); since_30 = datetime.now(timezone.utc) - timedelta(days=30)
    nights = list(db.scalars(select(NightSession).where(NightSession.baby_id == baby_id, NightSession.started_at >= since_30, NightSession.ended_at.is_not(None)).order_by(NightSession.started_at)))
    wake_count = db.scalar(select(func.count(SleepEvent.id)).join(NightSession).where(NightSession.baby_id == baby_id, SleepEvent.event_type == "wake", NightSession.started_at >= since_30)) or 0
    outcomes = db.execute(select(SoundOutcome.sound_response, func.avg(SoundOutcome.resettle_seconds)).join(SleepEvent).join(NightSession).where(NightSession.baby_id == baby_id, SoundOutcome.resettle_seconds.is_not(None)).group_by(SoundOutcome.sound_response).order_by(func.avg(SoundOutcome.resettle_seconds))).first()
    def window(days):
        selected = [n.sleep_quality_score for n in nights if n.started_at >= datetime.now(timezone.utc) - timedelta(days=days) and n.sleep_quality_score is not None]; return round(sum(selected) / len(selected), 1) if selected else None
    total_minutes = sum((n.ended_at - n.started_at).total_seconds() / 60 for n in nights if n.ended_at)
    return {"sessions": [{"date": n.started_at.date(), "quality": n.sleep_quality_score} for n in nights], "rolling_quality": {"days_7": window(7), "days_30": window(30)}, "wake_events_30d": wake_count, "total_sleep_minutes_30d": round(total_minutes), "best_noise": {"sound_response": outcomes[0], "average_resettle_seconds": round(outcomes[1])} if outcomes else None}
@app.post("/api/babies/{baby_id}/training-contributions", status_code=status.HTTP_202_ACCEPTED)
def contribute_features(baby_id: int, payload: ContributionIn, user: User = Depends(current_user), db: Session = Depends(db_session)):
    owned_baby(baby_id, user, db); db.add(TrainingContribution(baby_id=baby_id, **payload.model_dump())); db.commit(); return {"accepted": True, "note": "Derived feature data only; raw audio is never accepted."}
