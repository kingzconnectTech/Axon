import os
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///axon.db")
engine = create_engine(DATABASE_URL, future=True)
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    email = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Session(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True)
    mode = Column(String, index=True)
    status = Column(String, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    stopped_at = Column(DateTime, nullable=True)
    profit = Column(Float, default=0.0)
    trades = Column(Integer, default=0)


class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, index=True)
    session_id = Column(String, index=True)
    pair = Column(String, index=True)
    direction = Column(String)
    amount = Column(Float)
    expiry = Column(Integer)
    order_id = Column(String, index=True)
    status = Column(String, index=True)
    result = Column(String, index=True)
    pnl = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class IQCredential(Base):
    __tablename__ = "iq_credentials"
    user_id = Column(String, primary_key=True)
    username = Column(String)
    password_enc = Column(String)
    updated_at = Column(DateTime, default=datetime.utcnow)

