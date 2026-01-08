import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

broker_url = os.getenv("BROKER_URL", "redis://localhost:6379/0")
backend_url = os.getenv("RESULT_BACKEND", broker_url)

celery = Celery("axon", broker=broker_url, backend=backend_url, include=['app.tasks'])
celery.conf.task_default_queue = "control"


def user_queue(uid: str, session_id: str) -> str:
    # In local development (no ECS), route all tasks to the 'control' queue
    # so the single local worker can pick them up.
    if not os.getenv("ECS_CLUSTER"):
        return "control"
    return f"user:{uid}:{session_id}"

