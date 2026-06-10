from typing import Optional
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application configuration settings using Pydantic.

    This class defines the schema for environment variables and configuration options.
    It automatically loads values from .env files or system environment variables.
    """
    # Required configuration parameters
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # Optional configuration with default values
    CHAT_MODEL: str = "mistral-small-latest"  # Model identifier used for the main chat interface
    ANALYSIS_MODEL: str = "mistral-medium-latest"  # Model identifier used for structured analysis tasks
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "http://localhost:5173"
    OPENAI_API_KEY: Optional[str] = None
    MISTRAL_API_KEY: Optional[str] = None  # API Key for accessing Mistral AI services
    USE_OLLAMA: bool = False  # Toggle to switch between local Ollama instance and remote APIs

    # Checkpoint DB Path (New for persistence)
    CHECKPOINT_DB_PATH: str = "checkpoints.sqlite"

    model_config = SettingsConfigDict(
        env_file=[".env", ".env.local"],
        env_file_encoding="utf-8",
        extra="ignore"
    )


@lru_cache()
def get_settings():
    """
    Creates and caches a singleton instance of the Settings class.

    Using lru_cache ensures that the settings are loaded from the environment
    only once, improving performance.

    :return: An instance of the Settings class containing application configuration.
    """
    return Settings()
