import asyncio
import json
import logging
from uuid import uuid4
from fastapi import APIRouter, Depends, BackgroundTasks, Header, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from langchain_mistralai import ChatMistralAI

from backend.config.setting import get_settings
from backend.models.models import ChatRequest
from backend.repositories.chat import SupabaseRepository
from backend.services.analysis import analysis_graph

router = APIRouter()
logger = logging.getLogger("enterprise_chat")
settings = get_settings()


def get_repo():
    """Dependency provider for the Supabase repository."""
    return SupabaseRepository()


async def get_authenticated_user_id(
        authorization: str | None = Header(default=None),
        repo: SupabaseRepository = Depends(get_repo)
) -> str:
    """Validates the Supabase bearer token and returns the authenticated user ID."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    access_token = authorization.split(" ", 1)[1].strip()
    if not access_token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        user_id = await asyncio.to_thread(repo.get_user_id_from_token, access_token)
    except Exception:
        logger.warning("Supabase auth token validation failed", exc_info=True)
        raise HTTPException(status_code=401, detail="Invalid bearer token")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    return user_id


# Initialize the Chat LLM based on configuration settings.
# Conditionally use Mistral or Ollama for chat.
if settings.USE_OLLAMA:
    chat_llm = ChatOllama(model=settings.CHAT_MODEL, temperature=0.7)
else:
    chat_llm = ChatMistralAI(api_key=settings.MISTRAL_API_KEY, model=settings.CHAT_MODEL, temperature=0.7)


async def background_analysis_task(
        session_id: str,
        message_id: int,
        user_id: str,
        user_text: str,
        bot_text: str,
        repo: SupabaseRepository
):
    """
    Performs asynchronous analysis of the chat interaction using a LangGraph workflow.

    This function runs in the background to avoid blocking the user response stream.
    It evaluates the prompt quality and response accuracy/safety.

    :param session_id: The unique identifier for the chat session.
    :param message_id: The ID of the bot message being analyzed.
    :param user_id: The ID of the user.
    :param user_text: The input text provided by the user.
    :param bot_text: The generated response text from the bot.
    :param repo: The database repository instance used for fetching history and saving results.
    """
    history_str = await repo.get_formatted_history(session_id)
    inputs = {"user_text": user_text, "bot_text": bot_text, "history_str": history_str}

    # IMPORTANT: Use Session ID for persistence (LangGraph checkpointing)
    config = {"configurable": {"thread_id": session_id}}

    try:
        # Invoke the analysis graph using the provided configuration
        result = await analysis_graph.ainvoke(inputs, config=config)

        p_res = result.get("prompt_analysis")
        r_res = result.get("response_analysis")

        if p_res and r_res:
            db_data = {
                "session_id": session_id,
                "message_id": message_id,
                "user_id": user_id,
                # Map and save prompt categories to the database format
                "categories": [{"tag": c.category.value, "score": c.percentage / 100.0} for c in p_res.categories],
                "prompt_quality_score": p_res.quality_score,
                "prompt_improvement_suggestion": p_res.improvement_suggestion,
                "response_match_score": r_res.match_score,
                "hallucination_check": r_res.hallucination_status,
                "hallucination_details": r_res.hallucination_reason,
                "rating_metrics": p_res.rating_metrics.model_dump()
            }
            await repo.save_analysis(db_data)
            logger.info(f"Analysis saved for {message_id}")

    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)


async def generate_chat_stream(
        req: ChatRequest,
        user_id: str,
        repo: SupabaseRepository,
        background_tasks: BackgroundTasks
):
    """
    Generates a streaming response for the chat interface.

    Handles session management, message persistence, context retrieval,
    LLM generation, and triggers background analysis tasks.

    :param req: The chat request object containing user input and session details.
    :param repo: The database repository instance.
    :param background_tasks: FastAPI background task handler for non-blocking operations.
    :yield: JSON-formatted strings (NDJSON) representing stream events.
    """
    session_id = req.session_id or str(uuid4())

    # 1. Initialize session (if new)
    if req.session_id is None:
        title = req.text[:50] if req.text else "New Chat"
        yield json.dumps({"type": "session_init", "session_id": session_id}) + "\n"
        await repo.create_session({"id": session_id, "user_id": user_id, "title": title})
    elif not await repo.user_owns_session(session_id, user_id):
        yield json.dumps({"type": "error", "content": "Chat session not found"}) + "\n"
        return

    # 2. Save user message to database
    user_msg_id = await repo.save_message(
        {"session_id": session_id, "user_id": user_id, "role": "user", "content": req.text})
    yield json.dumps({"type": "user_msg_id", "message_id": user_msg_id}) + "\n"

    # --- CONTEXT ASSEMBLY LOGIC ---

    # A. Load conversation context from DB (The Memory)
    history_messages = await repo.get_history_as_langchain(session_id)

    # B. Define System Prompt (Optional, but good for establishing Persona)
    system_prompt = [SystemMessage(content="You are a helpful AI assistant inside an enterprise chat environment.")]

    # C. Append the current user message
    current_message = [HumanMessage(content=req.text)]

    # D. Assemble the full conversation: System Instructions + History + New Question
    full_conversation = system_prompt + history_messages + current_message

    full_response = ""
    bot_msg_id = None
    stream_error = False

    try:
        # E. Stream the entire conversation history to the LLM
        async for chunk in chat_llm.astream(full_conversation):
            if chunk.content:
                full_response += chunk.content
                yield json.dumps({"type": "token", "content": chunk.content}) + "\n"
    except Exception as e:
        stream_error = True
        yield json.dumps({"type": "error", "content": str(e)}) + "\n"
        return
    finally:
        # 3. Persist the bot response even if the client disconnected mid-stream
        #    (GeneratorExit / CancelledError). This ensures the message and its
        #    analysis are not lost when users navigate away during generation.
        if full_response and bot_msg_id is None and not stream_error:
            try:
                # asyncio.shield protects the save from being cancelled by
                # CancelledError when the ASGI server tears down the generator
                # (e.g. browser tab closed). Without shield, `await` inside
                # finally re-raises CancelledError and the save is skipped.
                bot_msg_id = await asyncio.shield(repo.save_message({
                    "session_id": session_id, "user_id": user_id,
                    "role": "bot", "content": full_response
                }))
                if bot_msg_id:
                    background_tasks.add_task(
                        background_analysis_task,
                        session_id, bot_msg_id, user_id, req.text, full_response, repo
                    )
                    logger.info(f"Bot message {bot_msg_id} saved for session {session_id}")
            except BaseException as save_err:
                # Catch BaseException (including CancelledError) to log all failures
                logger.error(f"Failed to save bot response: {save_err}", exc_info=True)

    # 4. Signal completion — only reached when the client is still connected
    if bot_msg_id:
        yield json.dumps({"type": "done", "message_id": bot_msg_id}) + "\n"


@router.post("/chat")
async def chat_endpoint(
        req: ChatRequest,
        bg_tasks: BackgroundTasks,
        user_id: str = Depends(get_authenticated_user_id),
        repo: SupabaseRepository = Depends(get_repo)
):
    """
    API Endpoint to handle chat requests.

    :param req: The incoming request model containing user text.
    :param bg_tasks: FastAPI background tasks handler.
    :param repo: Database repository dependency.
    :return: A StreamingResponse providing an NDJSON stream of the chat generation.
    """
    return StreamingResponse(generate_chat_stream(req, user_id, repo, bg_tasks), media_type="application/x-ndjson")
