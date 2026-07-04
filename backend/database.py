"""
Haaris (حارس) — UAE LLM Compliance Guardrail
MongoDB audit-log storage (async, via Motor).

Stores every analysis with timestamp, input hash, and full agent results
so security teams have a complete compliance history.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import PyMongoError

from backend.models import AnalysisResult, Decision, HistoryItem, Severity

logger = logging.getLogger("haaris.database")

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "haaris")
COLLECTION = "analyses"


class Database:
    """Thin async wrapper around the MongoDB audit-log collection."""

    def __init__(self) -> None:
        self._client: Optional[AsyncIOMotorClient] = None
        self._db: Optional[AsyncIOMotorDatabase] = None

    async def connect(self) -> None:
        """Open the connection pool and ensure indexes. Safe to call once at startup."""
        try:
            self._client = AsyncIOMotorClient(
                MONGODB_URL, serverSelectionTimeoutMS=5000
            )
            # Force a round-trip so misconfiguration fails fast at startup.
            await self._client.admin.command("ping")
            self._db = self._client[MONGODB_DB]
            await self._db[COLLECTION].create_index("analysis_id", unique=True)
            await self._db[COLLECTION].create_index([("created_at", -1)])
            await self._db[COLLECTION].create_index("input_hash")
            logger.info("Connected to MongoDB at %s (db=%s)", MONGODB_URL, MONGODB_DB)
        except PyMongoError as exc:
            # Do not crash the API if Mongo is down — degrade to no-audit mode
            # and surface the problem loudly in logs.
            logger.error("MongoDB connection failed: %s — audit logging disabled", exc)
            self._client = None
            self._db = None

    async def close(self) -> None:
        """Close the connection pool at shutdown."""
        if self._client is not None:
            self._client.close()
            self._client = None
            self._db = None
            logger.info("MongoDB connection closed")

    @property
    def available(self) -> bool:
        return self._db is not None

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    async def save_analysis(self, result: AnalysisResult) -> bool:
        """Persist a full analysis result. Returns True on success."""
        if self._db is None:
            logger.warning(
                "MongoDB unavailable — analysis %s not persisted", result.analysis_id
            )
            return False
        try:
            doc = result.model_dump(mode="json")
            await self._db[COLLECTION].insert_one(doc)
            return True
        except PyMongoError as exc:
            logger.error("Failed to save analysis %s: %s", result.analysis_id, exc)
            return False

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    async def get_analysis(self, analysis_id: str) -> Optional[AnalysisResult]:
        """Fetch a single full analysis by ID."""
        if self._db is None:
            return None
        try:
            doc = await self._db[COLLECTION].find_one(
                {"analysis_id": analysis_id}, {"_id": 0}
            )
            return AnalysisResult.model_validate(doc) if doc else None
        except PyMongoError as exc:
            logger.error("Failed to fetch analysis %s: %s", analysis_id, exc)
            return None

    async def get_history(self, limit: int = 50, skip: int = 0) -> list[HistoryItem]:
        """Return compact history items, newest first."""
        if self._db is None:
            return []
        try:
            cursor = (
                self._db[COLLECTION]
                .find({}, {"_id": 0})
                .sort("created_at", -1)
                .skip(skip)
                .limit(limit)
            )
            items: list[HistoryItem] = []
            async for doc in cursor:
                try:
                    result = AnalysisResult.model_validate(doc)
                    items.append(
                        HistoryItem(
                            analysis_id=result.analysis_id,
                            created_at=result.created_at,
                            input_hash=result.input_hash,
                            decision=result.decision,
                            pii_findings_count=len(result.agents.pii.findings),
                            injection_detected=result.agents.injection.injection_detected,
                            highest_severity=_overall_severity(result),
                        )
                    )
                except Exception as exc:  # malformed legacy doc — skip, don't crash
                    logger.warning("Skipping malformed history document: %s", exc)
            return items
        except PyMongoError as exc:
            logger.error("Failed to fetch history: %s", exc)
            return []

    async def count_analyses(self) -> int:
        if self._db is None:
            return 0
        try:
            return await self._db[COLLECTION].count_documents({})
        except PyMongoError as exc:
            logger.error("Failed to count analyses: %s", exc)
            return 0


def _overall_severity(result: AnalysisResult) -> Severity:
    """Highest severity across agents, for the compact history view."""
    order = [
        Severity.CRITICAL,
        Severity.HIGH,
        Severity.MEDIUM,
        Severity.LOW,
        Severity.NONE,
    ]
    candidates = [
        result.agents.pii.highest_severity,
        result.agents.injection.severity,
        result.agents.framework.highest_severity,
    ]
    for level in order:
        if level in candidates:
            return level
    return Severity.NONE


# Single shared instance used by main.py and the orchestrator.
db = Database()
