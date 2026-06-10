from enum import Enum
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator


# --- Enums & Bases ---

class Categories(str, Enum):
    """Enumeration representing different categories for chat classification."""
    coding = "Coding"
    writing = "Writing"
    work = "Work"
    education = "Education"
    other = "Other"


class CategoryScore(BaseModel):
    """Represents a score assignment for a specific category."""
    category: Categories
    percentage: int = Field(description="Percentage value between 0 and 100")


# --- Helper for 100% Validation ---
class HasCategoriesMixin(BaseModel):
    """
    Mixin class that enforces category percentages to sum up to exactly 100%.
    Intended to be inherited by models that contain a list of CategoryScore.
    """
    categories: List[CategoryScore]

    @classmethod
    @field_validator('categories')
    def enforce_100_percent(cls, v: List[CategoryScore]) -> List[CategoryScore]:
        """
        Validates and normalizes the list of category scores.
        Ensures the total percentage equals 100 by normalizing or handling edge cases.

        :param v: List of CategoryScore objects.
        :return: A normalized list of CategoryScore objects summing to 100.
        """
        if not v:
            return [CategoryScore(category=Categories.other, percentage=100)]

        total = sum(item.percentage for item in v)
        if total == 100:
            return v
        if total == 0:
            return [CategoryScore(category=Categories.other, percentage=100)]

        # Normalization logic
        factor = 100.0 / total
        current_sum = 0
        new_items = []

        for i, item in enumerate(v):
            if i == len(v) - 1:
                new_val = 100 - current_sum  # Add the remainder to the last item
            else:
                new_val = int(round(item.percentage * factor))
                current_sum += new_val

            # IMPORTANT: Create a new object to respect Pydantic immutability
            new_item = item.model_copy(update={"percentage": max(0, new_val)})
            new_items.append(new_item)

        return new_items


# --- API Data Models ---

class ChatRequest(BaseModel):
    """Model representing an incoming chat request from a user."""
    session_id: Optional[str] = None
    text: str


class ChatResponse(BaseModel):
    """Model representing the response sent back to the user."""
    session_id: str
    bot_message: str


class PromptRating(BaseModel):
    """Metrics used to rate the quality of a prompt."""
    specification: float
    grammar: float
    length: float = 0.0
    token_performance: float = 0.0
    llm_response_fitting: float
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


# --- Analysis Results ---

# Inherits from Mixin -> Automatic 100% validation
class PromptAnalysisResult(HasCategoriesMixin):
    """
    Result model for prompt analysis, including quality scores and suggestions.
    Automatically validates that category scores sum to 100%.
    """
    quality_score: int
    improvement_suggestion: str
    rating_metrics: Optional[PromptRating] = None


# Inherits from Mixin as well -> Automatic 100% validation
class ResponseAnalysisResult(HasCategoriesMixin):
    """
    Result model for response analysis, including hallucination checks.
    Automatically validates that category scores sum to 100%.
    """
    match_score: int
    hallucination_status: Literal["Pass", "Warning", "Fail"]
    hallucination_reason: str
