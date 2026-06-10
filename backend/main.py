from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api.endpoints import router as chatbot_router
from backend.config.setting import get_settings

# Initialize the FastAPI application instance
app = FastAPI()

settings = get_settings()

# Define the list of allowed origins for Cross-Origin Resource Sharing (CORS).
# Set CORS_ORIGINS to a comma-separated list for deployed frontend domains.
origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]

# Add the CORS middleware to the application.
# This ensures that the browser allows requests from the specified origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,       # List of allowed origins
    allow_credentials=True,      # Allow cookies and authentication headers
    allow_methods=["*"],         # Allow all HTTP methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],         # Allow all HTTP headers
)

# Register the chatbot API router to the main application
app.include_router(chatbot_router)
