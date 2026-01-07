Axon Trading App

Stack
- Backend Python FastAPI, Celery, Redis
- Mobile React Native via Expo
- AWS Terraform placeholders

Development
- Backend: docker compose in backend directory
- Mobile: from mobile run npm install then expo start

Backend Services
- API port 8000
- Redis port 6379
- Celery worker uses Redis broker

Terraform
- Configure AWS credentials and region before apply

Database
- Uses SQLite by default, stored in axon.db in project root
- No Postgres required; tables are auto-created on API startup
- Optional: set DATABASE_URL to switch databases (e.g., Postgres) later

Firebase Auth
- Web config in mobile/firebase.js connects the app to your Firebase project
- Sign-in retrieves ID token and calls /auth/verify-token on backend
- Backend verifies ID tokens with Firebase Admin
- For production, set FIREBASE_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS to your service account JSON
