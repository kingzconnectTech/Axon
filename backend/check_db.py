from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, IQCredential

DATABASE_URL = "sqlite:///C:/Users/prosp/Desktop/Axon/axon.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
session = SessionLocal()

uid = "yeeCMAfNgaeF0Icw21GeBH7p7EB2"
cred = session.query(IQCredential).filter_by(user_id=uid).first()
if cred:
    print(f"Found target credential: {cred.user_id}")
else:
    print(f"Target credential {uid} NOT found")

creds = session.query(IQCredential).all()
print(f"Found {len(creds)} credentials:")
for c in creds:
    print(f"UID: {c.user_id}, Username: {c.username}")
