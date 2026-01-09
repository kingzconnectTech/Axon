from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, IQCredential

DATABASE_URL = "sqlite:///./axon.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
session = SessionLocal()

creds = session.query(IQCredential).all()
print(f"Found {len(creds)} credentials in ./axon.db:")
for c in creds:
    print(f"UID: {c.user_id}, Username: {c.username}")
