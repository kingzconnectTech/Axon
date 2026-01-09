import os
from typing import Optional
import json

def spawn_user_worker(uid: str, session_id: str) -> Optional[str]:
    cluster = os.getenv("ECS_CLUSTER")
    task_def = os.getenv("WORKER_TASK_DEF")
    if not cluster or not task_def:
        return None
    try:
        import boto3
        ecs = boto3.client("ecs", region_name=os.getenv("AWS_REGION", "us-east-1"))
        resp = ecs.run_task(
            cluster=cluster,
            launchType="FARGATE",
            taskDefinition=task_def,
            count=1,
            networkConfiguration={
                "awsvpcConfiguration": {
                    "assignPublicIp": "ENABLED",
                    "subnets": os.getenv("ECS_SUBNETS", "").split(","),
                    "securityGroups": os.getenv("ECS_SECURITY_GROUPS", "").split(","),
                }
            },
            overrides={
                "containerOverrides": [
                    {
                        "name": os.getenv("WORKER_CONTAINER_NAME", "worker"),
                        "environment": [
                            {"name": "BROKER_URL", "value": os.getenv("BROKER_URL", "")},
                            {"name": "RESULT_BACKEND", "value": os.getenv("RESULT_BACKEND", "")},
                            {"name": "USER_QUEUE", "value": f"user:{uid}:{session_id}"},
                        ],
                        "command": ["celery", "-A", "app.celery_app.celery", "worker", "--loglevel=INFO", "-Q", f"user:{uid}:{session_id}"],
                    }
                ]
            },
        )
        tasks = resp.get("tasks", [])
        if tasks:
            return tasks[0].get("taskArn")
    except Exception:
        return None
    return None

def stop_user_worker(task_arn: str) -> bool:
    cluster = os.getenv("ECS_CLUSTER")
    if not cluster or not task_arn:
        return False
    try:
        import boto3
        ecs = boto3.client("ecs", region_name=os.getenv("AWS_REGION", "us-east-1"))
        ecs.stop_task(cluster=cluster, task=task_arn, reason="Session stopped")
        return True
    except Exception:
        return False

def spawn_beat() -> Optional[str]:
    cluster = os.getenv("ECS_CLUSTER")
    task_def = os.getenv("BEAT_TASK_DEF")
    if not cluster or not task_def:
        return None
    try:
        import boto3
        ecs = boto3.client("ecs", region_name=os.getenv("AWS_REGION", "us-east-1"))
        resp = ecs.run_task(
            cluster=cluster,
            launchType="FARGATE",
            taskDefinition=task_def,
            count=1,
            networkConfiguration={
                "awsvpcConfiguration": {
                    "assignPublicIp": "ENABLED",
                    "subnets": os.getenv("ECS_SUBNETS", "").split(","),
                    "securityGroups": os.getenv("ECS_SECURITY_GROUPS", "").split(","),
                }
            },
            overrides={
                "containerOverrides": [
                    {
                        "name": os.getenv("BEAT_CONTAINER_NAME", "beat"),
                        "environment": [
                            {"name": "BROKER_URL", "value": os.getenv("BROKER_URL", "")},
                            {"name": "RESULT_BACKEND", "value": os.getenv("RESULT_BACKEND", "")},
                            {"name": "REDIS_HOST", "value": os.getenv("REDIS_HOST", "")},
                            {"name": "REDIS_PORT", "value": os.getenv("REDIS_PORT", "")},
                        ],
                        "command": ["python", "-m", "backend.app.beat"],
                    }
                ]
            },
        )
        tasks = resp.get("tasks", [])
        if tasks:
            return tasks[0].get("taskArn")
    except Exception:
        return None
    return None

