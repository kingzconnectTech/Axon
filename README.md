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
