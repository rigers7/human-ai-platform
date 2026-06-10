import asyncio

from langchain_core.messages import AIMessage, HumanMessage
from supabase import create_client, Client
from backend.config.setting import get_settings

settings = get_settings()

class SupabaseRepository:
    """
    Repository class for interacting with the Supabase database.
    Handles storage and retrieval of chat sessions, messages, and analysis data.
    """
    def __init__(self):
        """Initializes the Supabase client using settings configuration."""
        self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    def get_user_id_from_token(self, access_token: str) -> str | None:
        """Validates a Supabase access token and returns its user ID."""
        user_response = self.client.auth.get_user(access_token)
        if user_response and user_response.user:
            return user_response.user.id
        return None

    async def user_owns_session(self, session_id: str, user_id: str) -> bool:
        """Returns True when the given session belongs to the authenticated user."""
        res = await asyncio.to_thread(
            lambda: self.client.table("chat_sessions")
            .select("id")
            .eq("id", session_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return bool(res.data)

    async def create_session(self, session_data: dict):
        """
        Asynchronously creates a new chat session in the database.

        :param session_data: Dictionary containing session details (id, user_id, title).
        :return: The result of the insert operation.
        """
        return await asyncio.to_thread(
            lambda: self.client.table("chat_sessions").insert(session_data).execute()
        )

    async def save_message(self, message_data: dict) -> int:
        """
        Asynchronously saves a chat message to the database.

        :param message_data: Dictionary containing message details (session_id, role, content).
        :return: The ID of the inserted message, or 0 if the operation failed.
        """
        res = await asyncio.to_thread(
            lambda: self.client.table("chat_messages").insert(message_data).execute()
        )
        if res.data and len(res.data) > 0:
            return res.data[0]['id']
        return 0

    async def save_analysis(self, analysis_data: dict):
        """
        Asynchronously saves the analysis results of a chat interaction.

        :param analysis_data: Dictionary containing analysis metrics (scores, categories, suggestions).
        """
        # Currently, we only store the PROMPT categories in the DB column 'categories'.
        # If response categories need to be stored, the DB requires a new column 'response_categories'.
        await asyncio.to_thread(
            lambda: self.client.table("chat_analysis").insert(analysis_data).execute()
        )

    async def get_formatted_history(self, session_id: str, char_limit: int = 2000) -> str:
        """
        Retrieves the last messages as a formatted string.
        Useful for providing context to analysis tools that require a text block.

        :param session_id: The unique identifier for the chat session.
        :param char_limit: Maximum character length for the returned history string.
        :return: A formatted string of the conversation history.
        """
        try:
            res = await asyncio.to_thread(
                lambda: self.client.table("chat_messages")
                .select("role, content")
                .eq("session_id", session_id)
                .order("created_at", desc=True)
                .limit(10)
                .execute()
            )

            if not res.data:
                return ""

            # Reverse to get chronological order
            messages = res.data[::-1]
            full_text = "\n".join([f"{msg['role'].upper()}: {msg['content']}" for msg in messages])

            if len(full_text) > char_limit:
                return "..." + full_text[-char_limit:]
            return full_text

        except Exception as e:
            print(f"Error fetching history: {e}")
            return ""

    async def get_history_as_langchain(self, session_id: str, limit: int = 10):
        """
        Loads the recent messages and converts them directly into LangChain objects.
        Important so the Chat LLM understands the context structure.

        :param session_id: The unique identifier for the chat session.
        :param limit: The number of recent messages to retrieve.
        :return: A list of LangChain message objects (HumanMessage, AIMessage).
        """
        res = await asyncio.to_thread(
            lambda: self.client.table("chat_messages")
            .select("role, content")
            .eq("session_id", session_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        if not res.data:
            return []

        # Reverse to ensure the oldest message comes first (Chronological order)
        messages = res.data[::-1]

        langchain_msgs = []
        for msg in messages:
            if msg['role'] == 'user':
                langchain_msgs.append(HumanMessage(content=msg['content']))
            elif msg['role'] == 'bot':
                langchain_msgs.append(AIMessage(content=msg['content']))
            # We usually ignore system messages here or handle them separately

        return langchain_msgs
