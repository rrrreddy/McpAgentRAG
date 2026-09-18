"""Chat endpoint — the FastAPI/JWT-authenticated serving layer from D2.

One request = one full pass through the LangGraph agent graph. The route,
citations, confidence, table, and chart are all returned together so the
frontend can render one coherent answer, per D4.1's "single evidence-based
response object."
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import get_agent_graph
from app.api.schemas import ChatRequest, ChatResponse, ConversationOut, MessageOut
from app.auth.deps import CurrentUser, get_current_user
from app.config import get_settings
from app.db.models import Message
from app.db.session import get_db_session
from app.logging_config import get_logger
from app.memory.conversation_memory import append_turn, get_or_create_conversation, get_recent_turns, hydrate_from_db
from app.memory.rate_limiter import RateLimitExceeded, check_rate_limit

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = get_logger("chat_api")
settings = get_settings()


@router.post("", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ChatResponse:
    try:
        await check_rate_limit(f"user:{current_user.id}", max_requests=settings.chat_rate_limit_per_minute)
    except RateLimitExceeded as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded", headers={"Retry-After": str(exc.retry_after_seconds)}) from exc

    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())

    conversation = await get_or_create_conversation(session, user_id=uuid.UUID(current_user.id), conversation_id=payload.conversation_id)
    await session.commit()

    recent_turns = await get_recent_turns(str(conversation.id))
    if not recent_turns:
        recent_turns = await hydrate_from_db(session, conversation.id)

    user_message = Message(conversation_id=conversation.id, role="user", content=payload.question)
    session.add(user_message)
    await session.commit()
    await append_turn(str(conversation.id), "user", payload.question)

    graph = get_agent_graph()
    initial_state = {
        "question": payload.question,
        "user": current_user,
        "recent_turns": recent_turns,
        "correlation_id": correlation_id,
    }
    try:
        final_state = await graph.ainvoke(initial_state)
    except Exception as exc:  # noqa: BLE001 - never let an internal agent failure leak a stack trace to the user
        logger.error("agent_graph_failed", error=str(exc), correlation_id=correlation_id)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The assistant is temporarily unavailable. Please retry.") from exc

    answer = final_state.get("answer", "I couldn't generate an answer.")
    citations = final_state.get("citations", [])
    confidence = final_state.get("confidence", 0.0)
    route = final_state.get("route", "unknown")
    chart_spec = final_state.get("chart_spec")
    table_data = final_state.get("table_data")

    assistant_message = Message(
        conversation_id=conversation.id, role="assistant", content=answer, route=route,
        citations=citations, confidence=confidence, chart_spec=chart_spec, table_data=table_data,
    )
    session.add(assistant_message)
    if conversation.title == "New conversation":
        conversation.title = payload.question[:80]
    await session.commit()
    await session.refresh(assistant_message)
    await append_turn(str(conversation.id), "assistant", answer)

    return ChatResponse(
        conversation_id=conversation.id, message_id=assistant_message.id, route=route, answer=answer,
        citations=citations, confidence=confidence, table_data=table_data, chart_spec=chart_spec,
        correlation_id=correlation_id,
    )


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(current_user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)):
    from sqlalchemy import select

    from app.db.models import Conversation

    result = await session.execute(
        select(Conversation).where(Conversation.user_id == uuid.UUID(current_user.id)).order_by(Conversation.updated_at.desc())
    )
    return list(result.scalars().all())


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
async def get_messages(conversation_id: uuid.UUID, current_user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)):
    from sqlalchemy import select

    from app.db.models import Conversation

    conv = await session.get(Conversation, conversation_id)
    if conv is None or str(conv.user_id) != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    result = await session.execute(select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at))
    return list(result.scalars().all())
