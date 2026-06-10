import logging
from typing import TypedDict, Optional, List, Dict, Any

import aiosqlite
import tiktoken
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_mistralai import ChatMistralAI
from langchain_ollama import ChatOllama
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import StateGraph, START, END
from pydantic import BaseModel, Field

from backend.config.setting import get_settings
# Importing necessary models and Enums
from backend.models.models import (
    PromptAnalysisResult, ResponseAnalysisResult, PromptRating,
    CategoryScore, Categories
)

# --- SETUP ---
logger = logging.getLogger(__name__)
settings = get_settings()

# Conditionally set LLM based on configuration
if settings.USE_OLLAMA:
    llm = ChatOllama(model=settings.ANALYSIS_MODEL, temperature=0)
else:
    llm = ChatMistralAI(
        api_key=settings.MISTRAL_API_KEY,
        model=settings.ANALYSIS_MODEL,
        temperature=0,
        timeout=120,
        max_retries=2
    )


# --- 1. Internal Models ---

class LLMPromptEval(BaseModel):
    """
    Internal model for structuring LLM prompt analysis results.
    Reflects the 5 key performance indicators (KPIs) for prompt engineering.
    """
    clarity_score: int = Field(description="Clarity & Specificity (0-100)")
    structure_score: int = Field(description="Structural Integrity (0-100)")
    constraint_score: int = Field(description="Constraint Density (0-100)")
    anchoring_score: int = Field(description="Contextual Anchoring (0-100)")
    pattern_score: int = Field(description="Pattern Density / Few-Shot (0-100)")

    categories: List[CategoryScore] = Field(description="Topics of the prompt. Sum MUST be 100%.")
    suggestion: str = Field(
        description="A concise improvement tip (max 3 sentences). Focus on the single most critical fix."
    )


class LLMResponseEval(BaseModel):
    """Internal model for structuring LLM response evaluation."""
    relevance_score: float = Field(description="Spec Score equivalent (mapped later)")
    completeness_score: float = Field(description="Fit Score equivalent")
    clarity_score: float = Field(description="Grammar Score equivalent")
    categories: List[CategoryScore] = Field(description="Intent DNA Classification weights converted to categories")
    hallucination_status: str = Field(description="Pass/Warning/Fail based on analysis")
    hallucination_reason: str
    match_score: int


# --- 2. State & Helpers ---

class AnalysisState(TypedDict):
    """
    Represents the state of the analysis graph.
    Includes input text, history context, and output results.
    """
    user_text: str
    bot_text: str
    context_history: str  # Contains the last ~2000 chars of history
    prompt_analysis: Optional[PromptAnalysisResult]
    response_analysis: Optional[ResponseAnalysisResult]


def count_tokens(text: str) -> int:
    """Estimates the token count for a given text string."""
    try:
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception as e:
        # Fallback estimation if tiktoken fails
        logger.error(e)
        return int(len(text.split()) * 1.3)


def clamp_score(score: float) -> int:
    """Ensures a score remains within the 0-100 integer range."""
    return max(0, min(100, int(round(score))))


# --- 3. Nodes ---


async def analyze_prompt_node(state: AnalysisState) -> Dict[str, Any]:
    """
    Analyzes the user's prompt based on 5 KPIs using Context Injection.

    :param state: The current graph state containing the prompt and history.
    :return: A partial state update containing the 'prompt_analysis' result.
    """
    structured_llm = llm.with_structured_output(LLMPromptEval)

    # Retrieve context from state
    history = state.get("context_history", "No history available.")

    # System Prompt: Auditor v4.0 (Original Text + Context Injection)
    sys_msg = f"""
    I. IDENTITY & MISSION
    You are a Senior AI Prompt Architect. Your mission is to provide rigorous, data-backed audits of user prompts. You evaluate queries against the 2026 industry standards for instruction following, structural clarity, and grounding.

    II. CONTEXT AWARENESS (Previous Conversation)
    The user is continuing a session. Use this context to understand references (e.g., "rewrite that", "make it shorter").
    === HISTORY START (Truncated to last 2000 chars) ===
    {history}
    === HISTORY END ===

    Prompt Categories:
    1. Education: Focuses on the acquisition of knowledge, clarification of academic concepts, or requests for tutoring. It applies when the user is trying to understand the "why" or "how" behind a subject.
    2. Writing: Targeted at the generation, refinement, or stylistic editing of creative and formal prose. It includes drafting essays, stories, or adjusting the tone and structure of existing text.
    3. Coding: Dedicated to software development, including writing syntax, debugging, and explaining programming logic. This applies whenever the prompt involves code snippets or technical software constraints.
    4. Work: Covers general professional productivity and administrative tasks like scheduling or project management. This is for business-related inquiries that aren't strictly creative writing or technical coding.
    5. Other: Serves as a catch-all category for any prompts that do not fit the specialized domains above. Use this for casual conversation, roleplay, general trivia, or ambiguous requests that lack a clear professional or academic goal.

    III. EVALUATION CRITERIA (The 5 Pillars)

    1. Clarity & Specificity (Weight: 25%) [Source: OpenAI API Guides]
    Measures the reduction of "Ambiguity Variance".
    0-30%: Ambiguous. Low economic value; intent is a "guess".
    31-60%: Broad. Task identifiable but lacks nuance.
    61-80%: Directed. Clear objective.
    81-100%: High-Fidelity. Clear Action, Persona, and Objective.

    2. Structural Integrity (Weight: 20%) [Source: Google Gemma 3 Tech Report]
    Measures data-instruction separation.
    0-30%: Monolithic wall of text.
    31-60%: Basic line breaks.
    61-80%: Markdown Compliant (### Headers).
    81-100%: Advanced Tagging (XML-style delimiters like <context>).

    3. Constraint Density (Weight: 20%) [Source: Anthropic Docs]
    Measures "Guardrails" and negative constraints.
    0-30%: Open-Ended/Unconstrained.
    31-60%: Minimal (e.g., "short").
    61-80%: Parameter-Driven (Tone, format).
    81-100%: Zero-Waste. Explicit Negative Constraints & Output Schema.

    4. Contextual Anchoring (Weight: 20%) [Source: Perplexity Research]
    Measures "Signal-to-Noise" and grounding.
    0-30%: Floating/Isolated.
    31-60%: Thin context.
    61-80%: Adequate data to ground response.
    81-100%: Densely Anchored. Rich source material & definitions.

    5. Pattern Density / Few-Shot (Weight: 15%) [Source: Google DeepMind]
    Measures "Logic Examples" for reasoning efficiency.
    0-30%: Zero-Shot / Instruction-Only.
    31-60%: Template-Only (describes format).
    61-80%: One-Shot (Single example).
    81-100%: Pattern-Master (Multiple diverse examples).

    IV. RESPONSE PROTOCOL (Mandatory Output)
    Your output will directly educate users on improving their prompting skills. Be pedagogical and actionable.
    You must provide the scores for the fields and a text suggestion formatted EXACTLY as follows:

    # 🔍 Prompt Quality Audit: [Calculated Score]/100

    ### 📊 KPI Breakdown
    - **Clarity & Specificity:** [Score]/25 — *[1-sentence diagnostic with specific example from their prompt]*
    - **Structural Integrity:** [Score]/20 — *[1-sentence diagnostic showing what they're missing]*
    - **Contextual Anchoring:** [Score]/20 — *[1-sentence diagnostic about grounding gaps]*
    - **Constraint Density:** [Score]/20 — *[1-sentence diagnostic about missing guardrails]*
    - **Pattern Density:** [Score]/15 — *[1-sentence diagnostic about example usage]*

    ---

    ### 💡 Improvement Strategy (STRICTLY MAX 4 SENTENCES - Be Specific & Actionable)
    **Your prompt's biggest bottleneck is:** [Identify the single weakest KPI and explain WHY it's hurting quality in 1 concrete sentence with specific examples from their prompt].
    **Quick Win:** [Provide ONE specific, copy-pasteable technique they can apply immediately. Example: "Add this line: 'Output Format: JSON with keys X, Y, Z'" or "Start with: 'You are a [specific role]'"].
    **How to apply it:** [Give a concrete before/after example showing exactly where to insert the fix in their prompt].
    **Long-term Impact:** [Explain what mastering this skill will unlock for them and how it applies to future prompts in 1 sentence].
    ---

    ### 🎯 Learning Takeaway
    Remember: [One universal prompting principle they should internalize from this audit - make it memorable and applicable to future prompts].

    V. OPERATIONAL RULES
    1. Calculate the Score First: (Clarity*0.25) + (Structure*0.20) + (Constraint*0.20) + (Anchoring*0.20) + (Pattern*0.15).
    2. Be SPECIFIC in your recommendations - reference exact parts of their prompt, not generic advice.
    3. Prioritize teaching TRANSFERABLE skills over one-time fixes.
    4. Your suggestions should enable users to consistently score 90+ on similar prompts.
    """

    try:
        res = await structured_llm.ainvoke([
            SystemMessage(content=sys_msg),
            HumanMessage(content=state["user_text"])
        ])

        if res is None:
            logger.error("Prompt analysis returned None")
            return {"prompt_analysis": None}

        in_tok = count_tokens(state["user_text"])
        out_tok = count_tokens(state["bot_text"])

        # Exact calculation using the new formula
        final_score = (
                (res.clarity_score * 0.25) +
                (res.structure_score * 0.20) +
                (res.constraint_score * 0.20) +
                (res.anchoring_score * 0.20) +
                (res.pattern_score * 0.15)
        )

        metrics = PromptRating(
            specification=float(res.clarity_score),
            grammar=float(res.structure_score),
            length=float(res.constraint_score),
            token_performance=float(res.anchoring_score),
            llm_response_fitting=float(res.pattern_score),
            input_tokens=in_tok,
            output_tokens=out_tok,
            total_tokens=in_tok + out_tok
        )

        return {"prompt_analysis": PromptAnalysisResult(
            categories=res.categories,
            quality_score=clamp_score(final_score),
            improvement_suggestion=res.suggestion,
            rating_metrics=metrics
        )}
    except Exception as e:
        logger.error(f"Prompt Node Error: {e}", exc_info=True)
        return {"prompt_analysis": None}


async def evaluate_response_node(state: AnalysisState) -> Dict[str, Any]:
    """
    Analyzes the response using the 'Lead AI Interaction Analyst' system prompt.
    Includes context injection to verify hallucination status.

    :param state: The current graph state.
    :return: A partial state update containing the 'response_analysis' result.
    """

    # Helper models for the internal chain structure
    class DetailedAudit(BaseModel):
        spec_score: float
        gram_score: float
        fit_score: float

    class Classification(BaseModel):
        coding: float
        writing: float
        work: float
        education: float
        other: float

    class ComplexResponseEval(BaseModel):
        # Structure to fill out the LLM
        reasoning_intent: str
        classification_weights: Classification
        technical_audit: DetailedAudit

    structured_llm = llm.with_structured_output(ComplexResponseEval)

    history = state.get("context_history", "No history available.")

    sys_msg = f"""
    ### ROLE
    You are the **Lead AI Interaction Analyst** for the HAI P9 Meta-Learning platform. Your objective is to deconstruct user prompts into two dimensions: **Intent DNA (Categorization)** and **Structural Integrity (Technical Metrics)**.

    ### CONTEXT (Background Info)
    The user conversation so far (last 2000 chars):
    === HISTORY START ===
    {history}
    === HISTORY END ===

    ### TASK 1: HYBRID INTENT CLASSIFICATION
    Analyze the prompt's purpose across five domains. Assign a weight (0.0 to 1.0) to each category based on the user's intent. The total must sum to 1.0.
    1. Education: Focuses on the acquisition of knowledge, clarification of academic concepts, or requests for tutoring. It applies when the user is trying to understand the "why" or "how" behind a subject.
    2. Writing: Targeted at the generation, refinement, or stylistic editing of creative and formal prose. It includes drafting essays, stories, or adjusting the tone and structure of existing text.
    3. Coding: Dedicated to software development, including writing syntax, debugging, and explaining programming logic. This applies whenever the prompt involves code snippets or technical software constraints.
    4. Work: Covers general professional productivity and administrative tasks like scheduling or project management. This is for business-related inquiries that aren't strictly creative writing or technical coding.
    5. Other: Serves as a catch-all category for any prompts that do not fit the specialized domains above. Use this for casual conversation, roleplay, general trivia, or ambiguous requests that lack a clear professional or academic goal.

    ### TASK 2: TECHNICAL QUALITY AUDIT
    1. Clarity & Specificity (Weight: 25%) [Source: OpenAI API Guides]
    Measures the reduction of "Ambiguity Variance".
    0-30%: Ambiguous. Low economic value; intent is a "guess".
    31-60%: Broad. Task identifiable but lacks nuance.
    61-80%: Directed. Clear objective.
    81-100%: High-Fidelity. Clear Action, Persona, and Objective.

    2. Structural Integrity (Weight: 20%) [Source: Google Gemma 3 Tech Report]
    Measures data-instruction separation.
    0-30%: Monolithic wall of text.
    31-60%: Basic line breaks.
    61-80%: Markdown Compliant (### Headers).
    81-100%: Advanced Tagging (XML-style delimiters like <context>).

    3. Constraint Density (Weight: 20%) [Source: Anthropic Docs]
    Measures "Guardrails" and negative constraints.
    0-30%: Open-Ended/Unconstrained.
    31-60%: Minimal (e.g., "short").
    61-80%: Parameter-Driven (Tone, format).
    81-100%: Zero-Waste. Explicit Negative Constraints & Output Schema.

    4. Contextual Anchoring (Weight: 20%) [Source: Perplexity Research]
    Measures "Signal-to-Noise" and grounding.
    0-30%: Floating/Isolated.
    31-60%: Thin context.
    61-80%: Adequate data to ground response.
    81-100%: Densely Anchored. Rich source material & definitions.

    5. Pattern Density / Few-Shot (Weight: 15%) [Source: Google DeepMind]
    Measures "Logic Examples" for reasoning efficiency.
    0-30%: Zero-Shot / Instruction-Only.
    31-60%: Template-Only (describes format).
    61-80%: One-Shot (Single example).
    81-100%: Pattern-Master (Multiple diverse examples).

    ### JSON OUTPUT SCHEMA
    You must map your analysis to this structure:
    {{
      "reasoning_intent": "string",
      "classification_weights": {{
        "education": 0.0, "writing": 0.0, "coding": 0.0, "work": 0.0, "other": 0.0
      }},
      "technical_audit": {{
        "spec_score": 0.0, "gram_score": 0.0, "fit_score": 0.0
      }}
    }}
    """

    input_text = f"USER: {state['user_text']}\nAI: {state['bot_text']}"

    try:
        res = await structured_llm.ainvoke([
            SystemMessage(content=sys_msg),
            HumanMessage(content=input_text)
        ])

        if res is None:
            logger.error("Response analysis returned None")
            return {"response_analysis": None}

        # Conversion of weights to CategoryScore list
        # FIX: Using Enum 'Categories' instead of strings to satisfy strict type checking
        cats = []
        w = res.classification_weights
        if w.education > 0:
            cats.append(CategoryScore(category=Categories.education, percentage=int(w.education * 100)))
        if w.writing > 0:
            cats.append(CategoryScore(category=Categories.writing, percentage=int(w.writing * 100)))
        if w.coding > 0:
            cats.append(CategoryScore(category=Categories.coding, percentage=int(w.coding * 100)))
        if w.work > 0:
            cats.append(CategoryScore(category=Categories.work, percentage=int(w.work * 100)))

        if not cats:
            cats = [CategoryScore(category=Categories.other, percentage=100)]

        # Score Calculation
        match_val = (res.technical_audit.spec_score * 0.4 +
                     res.technical_audit.gram_score * 0.3 +
                     res.technical_audit.fit_score * 0.3) * 100

        return {"response_analysis": ResponseAnalysisResult(
            categories=cats,
            match_score=clamp_score(match_val),
            hallucination_status="Pass",
            hallucination_reason=res.reasoning_intent
        )}
    except Exception as e:
        logger.error(f"Response Node Error: {e}", exc_info=True)
        return {"response_analysis": None}


# --- 4. Graph Construction (LAZY LOADING / SINGLETON) ---

builder = StateGraph(AnalysisState)

# Nodes
builder.add_node("analyze_prompt", analyze_prompt_node)
builder.add_node("evaluate_response", evaluate_response_node)

# Edges: Start -> Context -> Analysis -> End
# Note: Both nodes run in parallel starting from START
builder.add_edge(START, "analyze_prompt")
builder.add_edge(START, "evaluate_response")
builder.add_edge("analyze_prompt", END)
builder.add_edge("evaluate_response", END)

# Default in-memory checkpointer (fallback)
checkpointer = InMemorySaver()
analysis_graph = builder.compile(checkpointer=checkpointer)

_graph_instance = None
_db_conn = None


async def get_analysis_graph():
    """
    Initializes and returns the singleton instance of the analysis graph.
    Uses AsyncSqliteSaver for persistent checkpointing.
    """
    global _graph_instance, _db_conn
    if _graph_instance is not None:
        return _graph_instance

    logger.info("🔌 Initializing Async SQLite Checkpointer...")
    _db_conn = await aiosqlite.connect(settings.CHECKPOINT_DB_PATH)
    checkpointer_sqlite = AsyncSqliteSaver(_db_conn)
    await checkpointer_sqlite.setup()

    _graph_instance = builder.compile(checkpointer=checkpointer_sqlite)
    return _graph_instance