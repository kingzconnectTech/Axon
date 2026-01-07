import os
from celery import Celery

broker_url = os.getenv("BROKER_URL", "redis://redis:6379/0")
backend_url = os.getenv("RESULT_BACKEND", broker_url)

celery = Celery("axon", broker=broker_url, backend=backend_url)
celery.conf.task_default_queue = "control"


def user_queue(uid: str, session_id: str) -> str:
    return f"user:{uid}:{session_id}"

