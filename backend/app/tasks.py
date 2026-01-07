from typing import Dict, Any
from .celery_app import celery, user_queue


@celery.task(name="axon.analyze_market")
def analyze_market(uid: str, session_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    return {"uid": uid, "session_id": session_id, "processed": True}


def start_user_session(uid: str, session_id: str, config: Dict[str, Any]) -> None:
    analyze_market.apply_async(args=[uid, session_id, config], queue=user_queue(uid, session_id))

