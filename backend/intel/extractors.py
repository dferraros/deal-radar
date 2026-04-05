"""
LLM extraction layer for Tech Bet Intelligence Engine.

Two extractors:
  1. extract_profile()    → company summary, JTBD, inputs/outputs
  2. extract_primitives() → technical primitive inference with evidence

Both use Claude Haiku, return strict JSON, never raise on LLM failure.
"""
import json
import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_PROFILE_SYSTEM = (
    "You are a product analyst. Extract only what the company likely does in practice. "
    "Return strict JSON only — no markdown, no explanation. "
    "If evidence is weak, set confidence below 0.4."
)

_PROFILE_USER = """\
Given the text below, identify:
1. company_summary (1-2 sentences, practical — not marketing)
2. target_user (array of user types, e.g. ["logistics operators", "health systems"])
3. operational_workflow (array of steps in order)
4. system_inputs (array, e.g. ["delivery request", "GPS coordinates"])
5. system_outputs (array, e.g. ["completed delivery", "tracking data"])
6. claimed_differentiators (array)
7. core_job_to_be_done (one sentence format: "When X needs to Y, they use this to Z under constraint W.")
8. confidence_0_to_1

Return JSON with these exact keys:
{{
  "company_summary": "",
  "target_user": [],
  "operational_workflow": [],
  "system_inputs": [],
  "system_outputs": [],
  "claimed_differentiators": [],
  "core_job_to_be_done": "",
  "confidence_0_to_1": 0.0
}}

TEXT:
{source_text}
"""

_PRIMITIVES_SYSTEM = (
    "You are a technical due diligence analyst. "
    "Infer technical primitives from product evidence. "
    "Return strict JSON only — no markdown, no explanation. "
    "Separate explicit claims from inferred. Use low confidence when evidence is thin. "
    "Prefer primitives at engineering decision level — what engineers actually choose."
)

_PRIMITIVES_USER = """\
Given the company profile and evidence text, identify likely technical primitives.

Return JSON with these exact keys:
{{
  "domain": [],
  "system_classes": [],
  "primitives": [
    {{
      "name": "",
      "layer": "model|application_logic|infra|interface|hardware",
      "explicit_vs_inferred": "explicit|inferred",
      "confidence_0_to_1": 0.0,
      "evidence_snippets": [""]
    }}
  ]
}}

Rules:
- domain: coarse categories like "AI", "Robotics", "Biotech", "Infra", "Logistics" (max 3)
- system_classes: e.g. "Computer vision", "Foundation models", "Control systems" (max 5)
- primitives: specific engineering choices — not industry labels
- Do not claim proprietary certainty — infer from product constraints and language
- Max 10 primitives

COMPANY_PROFILE:
{profile_json}

EVIDENCE_TEXT:
{source_text}
"""

_MODEL = "claude-haiku-4-5-20251001"
_MAX_TOKENS = 1200


@dataclass
class IntelProfile:
    summary: str = ""
    target_user: list = field(default_factory=list)
    workflow: list = field(default_factory=list)
    inputs: list = field(default_factory=list)
    outputs: list = field(default_factory=list)
    claimed_differentiators: list = field(default_factory=list)
    jtbd: str = ""
    confidence: float = 0.0


@dataclass
class IntelPrimitive:
    name: str = ""
    layer: str = ""
    explicit_vs_inferred: str = "inferred"
    confidence: float = 0.0
    evidence_snippets: list = field(default_factory=list)


class IntelExtractor:
    """LLM-based extractor for company profiles and technical primitives."""

    def __init__(self):
        self._api_key = os.environ.get("ANTHROPIC_API_KEY", "")

    async def _call_llm(self, system: str, user: str) -> dict:
        """Call Claude Haiku and parse JSON response. Raises on failure."""
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        message = await client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = message.content[0].text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)

    async def extract_profile(self, source_text: str) -> IntelProfile:
        """Extract company profile from concatenated source text. Never raises."""
        text_truncated = source_text[:8000]
        try:
            data = await self._call_llm(
                _PROFILE_SYSTEM,
                _PROFILE_USER.format(source_text=text_truncated),
            )
            return IntelProfile(
                summary=data.get("company_summary", ""),
                target_user=data.get("target_user", []),
                workflow=data.get("operational_workflow", []),
                inputs=data.get("system_inputs", []),
                outputs=data.get("system_outputs", []),
                claimed_differentiators=data.get("claimed_differentiators", []),
                jtbd=data.get("core_job_to_be_done", ""),
                confidence=float(data.get("confidence_0_to_1", 0.0)),
            )
        except Exception as exc:
            logger.error("[IntelExtractor] Profile extraction failed: %s", exc)
            return IntelProfile(jtbd="Extraction failed", confidence=0.1)

    async def extract_primitives(self, profile: IntelProfile, source_text: str) -> list[IntelPrimitive]:
        """Extract technical primitives from profile + source evidence. Never raises."""
        text_truncated = source_text[:6000]
        profile_json = json.dumps({
            "summary": profile.summary,
            "jtbd": profile.jtbd,
            "inputs": profile.inputs,
            "outputs": profile.outputs,
        })
        try:
            data = await self._call_llm(
                _PRIMITIVES_SYSTEM,
                _PRIMITIVES_USER.format(profile_json=profile_json, source_text=text_truncated),
            )
            primitives = []
            for p in data.get("primitives", []):
                primitives.append(IntelPrimitive(
                    name=str(p.get("name", "")),
                    layer=str(p.get("layer", "model")),
                    explicit_vs_inferred=str(p.get("explicit_vs_inferred", "inferred")),
                    confidence=float(p.get("confidence_0_to_1", 0.0)),
                    evidence_snippets=p.get("evidence_snippets", []),
                ))
            return primitives
        except Exception as exc:
            logger.error("[IntelExtractor] Primitive extraction failed: %s", exc)
            return []
