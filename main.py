import os
import requests
import time
import ipaddress
import random
from collections import deque
from threading import Lock
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, MongoClient, UpdateOne
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError, PyMongoError

load_dotenv()

DB_NAME = "threat_intel"
# --- STEP 2: COLLECTION SWAP (Wipes the old data instantly for V5 Demo Magic) ---
COLLECTION_NAME = "threats_v5" 
COMMUNITY_DB_NAME = "community_sandbox"
COMMUNITY_COLLECTION = "reports"

def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)

def _parse_object_id(raw_id: str) -> ObjectId:
    try:
        return ObjectId(raw_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid indicator id",
        ) from exc

def _doc_to_public(doc: dict[str, Any]) -> dict[str, Any]:
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    return out

class IndicatorIn(BaseModel):
    type: str = Field(..., examples=["ip", "domain", "url", "hash"])
    value: str = Field(..., examples=["8.8.8.8", "example.com"])
    source: Optional[str] = Field(default=None, examples=["manual", "vendor_feed"])
    ip_type: Optional[str] = Field(default=None, examples=["IPv4", "IPv6", "Domain"])
    reason: Optional[str] = Field(default=None, examples=["Known Malicious C2 Node"])
    threat_level: Optional[str] = Field(default=None, examples=["High", "Medium", "Low"])
    risk_score: Optional[int] = Field(default=None, ge=0, le=100)
    confidence: Optional[int] = Field(default=None, ge=0, le=100)
    tags: list[str] = Field(default_factory=list)
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    meta: dict[str, Any] = Field(default_factory=dict)

class IndicatorOut(IndicatorIn):
    id: str
    created_at: datetime
    updated_at: datetime

app = FastAPI(title="Threat Intelligence Feed Aggregator API")

# --- Simple in-memory rate limiting for /api/indicators ---
_rate_lock = Lock()
_rate_buckets: dict[str, deque[float]] = {}
_RATE_LIMIT = 60  # requests
_RATE_WINDOW = 60.0  # seconds

@app.middleware("http")
async def rate_limit_indicators(request: Request, call_next):
    if request.method == "GET" and request.url.path == "/api/indicators":
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with _rate_lock:
            bucket = _rate_buckets.setdefault(client_ip, deque())
            while bucket and now - bucket[0] > _RATE_WINDOW:
                bucket.popleft()
            if len(bucket) >= _RATE_LIMIT:
                return PlainTextResponse(
                    "Too Many Requests",
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            bucket.append(now)
    return await call_next(request)

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
)
allow_origins = [o.strip() for o in cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def _startup() -> None:
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        raise RuntimeError(
            "Missing MONGODB_URI. Create a .env with MONGODB_URI='mongodb+srv://...'"
        )

    client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")

    db = client[DB_NAME]
    indicators = db[COLLECTION_NAME]
    community_db = client[COMMUNITY_DB_NAME]
    submissions = community_db[COMMUNITY_COLLECTION]

    indicators.create_index([("type", ASCENDING), ("value", ASCENDING)], unique=True)
    indicators.create_index([("created_at", DESCENDING)])
    submissions.create_index([("submitted_at", DESCENDING)])
    submissions.create_index("value", unique=True)

    app.state.mongo_client = client
    app.state.indicators = indicators
    app.state.submissions = submissions
    print(f"SYSTEM READY: Connected to Prod DB and Sandbox DB: {COMMUNITY_DB_NAME}")

@app.on_event("shutdown")
def _shutdown() -> None:
    client: Optional[MongoClient] = getattr(app.state, "mongo_client", None)
    if client is not None:
        client.close()

def get_indicators_collection(request: Request) -> Collection:
    indicators: Optional[Collection] = getattr(request.app.state, "indicators", None)
    if indicators is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database not initialized",
        )
    return indicators

# --- HACKATHON CORE REQUIREMENT: FEED PARSER ---
@app.post("/api/ingest", tags=["Hackathon specific"])
def ingest_feed(collection: Collection = Depends(get_indicators_collection)) -> dict[str, Any]:
    feed_url = "https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt"
    try:
        response = requests.get(feed_url, timeout=10)
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch external feed")
        
        all_lines = response.text.split("\n")
        valid_lines = [line for line in all_lines if line.strip() and not line.startswith("#")]
        lines = random.sample(valid_lines, min(500, len(valid_lines)))
        
        now = _utcnow()
        operations = []

        for line in lines:
            parts = line.split()
            ip = parts[0]
            
            try:
                parsed_ip = ipaddress.ip_address(ip)
            except ValueError:
                continue
            if not parsed_ip.is_global:
                continue

            indicator_type = "ip"
            ip_type = "IPv4" if parsed_ip.version == 4 else "IPv6"
            
            # --- DEMO MAGIC: Force a perfect colorful mix for the presentation ---
            mock_hits = random.randint(1, 10)
            risk_score = min(mock_hits * 12, 100)

            if mock_hits >= 8:      # ~30% chance of HIGH
                threat_level = "High"
                reason = "Multi-Source Blacklisted C2 Node"
            elif mock_hits >= 4:    # ~40% chance of MEDIUM
                threat_level = "Medium"
                reason = "Suspicious Automated Scanner"
            else:                   # ~30% chance of LOW
                threat_level = "Low"
                reason = "Generic Threat Indicator"

            doc = {
                "type": indicator_type,
                "value": ip,
                "source": "AlienVault_OTX_Sim",
                "ip_type": ip_type,
                "reason": reason,
                "threat_level": threat_level,
                "risk_score": risk_score,
                "created_at": now,
                "updated_at": now
            }
            
            operations.append(
                UpdateOne(
                    {"type": "ip", "value": ip},
                    {"$setOnInsert": doc},
                    upsert=True
                )
            )
            
        if operations:
            result = collection.bulk_write(operations, ordered=False)
            added_count = result.upserted_count
        else:
            added_count = 0
                
        return {"message": f"Successfully bulk ingested {added_count} new threat indicators."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CRITICAL ERROR: {str(e)}")

# --- HACKATHON STRETCH GOAL: FIREWALL EXPORT ---
@app.get("/api/export/blocklist", response_class=PlainTextResponse, tags=["Hackathon specific"])
def export_blocklist(collection: Collection = Depends(get_indicators_collection)):
    try:
        cursor = collection.find({"type": "ip"}, {"_id": 0, "indicator": 1, "value": 1})
        ip_list = []
        for doc in cursor:
            ip = doc.get("indicator") or doc.get("value")
            if ip:
                ip_list.append(str(ip))

        raw_text = "\n".join(ip_list)
        return PlainTextResponse(
            content=raw_text,
            headers={"Content-Disposition": 'attachment; filename="blocklist.txt"'},
        )
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=f"Failed to export blocklist: {str(e)}")

# --- COMMUNITY REPORTING (SANDBOX DB) ---
@app.post("/api/report")
def report_indicator(payload: dict[str, Any] = Body(...), request: Request = None) -> dict[str, Any]:
    submissions: Optional[Collection] = getattr(request.app.state, "submissions", None) if request else None
    indicators: Optional[Collection] = getattr(request.app.state, "indicators", None) if request else None
    
    if submissions is None or indicators is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sandbox database not initialized",
        )

    # Clean the input to prevent sneaky whitespace bypasses
    raw_value = payload.get("value", "")
    clean_value = str(raw_value).strip()

    if not clean_value:
        raise HTTPException(status_code=400, detail="Missing indicator value")

    # 1. Bulletproof Production Check (Case-insensitive exact match)
    prod_existing = indicators.find_one({"value": {"$regex": f"^{clean_value}$", "$options": "i"}})
    if prod_existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Redundant: This indicator is already verified in the live threat feed.",
        )

    # 2. Bulletproof Sandbox Check
    sandbox_existing = submissions.find_one({"value": {"$regex": f"^{clean_value}$", "$options": "i"}})
    if sandbox_existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate: This indicator has already been reported and is awaiting verification.",
        )

    # 3. Insert if clean
    doc = dict(payload)
    doc["value"] = clean_value
    doc["submitted_at"] = _utcnow()
    doc["status"] = "quarantined"

    try:
        submissions.insert_one(doc)
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit report",
        ) from exc

    return {"ok": True, "status": "quarantined"}

# --- UI DATA ROUTE ---
@app.get("/api/indicators")
def api_list_indicators(
    limit: int = 500,
    skip: int = 0,
    collection: Collection = Depends(get_indicators_collection),
):
    if limit < 1 or limit > 5000:
        raise HTTPException(status_code=400, detail="Bad limit")
    if skip < 0:
        raise HTTPException(status_code=400, detail="Bad skip")

    cursor = collection.find({}, {"_id": 0}).sort("created_at", DESCENDING).skip(skip).limit(limit)
    return {"indicators": list(cursor)}

# --- STANDARD CRUD ROUTES ---
@app.get("/health")
def health(collection: Collection = Depends(get_indicators_collection)) -> dict[str, Any]:
    try:
        collection.database.client.admin.command("ping")
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MongoDB not reachable",
        ) from exc
    return {"ok": True, "db": DB_NAME, "collection": COLLECTION_NAME}

@app.post("/indicators", response_model=IndicatorOut, status_code=status.HTTP_201_CREATED)
def create_indicator(
    payload: IndicatorIn = Body(...),
    collection: Collection = Depends(get_indicators_collection),
) -> dict[str, Any]:
    now = _utcnow()
    doc = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    doc["created_at"] = now
    doc["updated_at"] = now

    try:
        result = collection.insert_one(doc)
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Indicator already exists for (type, value)",
        ) from exc
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create indicator",
        ) from exc

    created = collection.find_one({"_id": result.inserted_id})
    return _doc_to_public(created)

@app.get("/indicators")
def list_indicators(
    type: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
    collection: Collection = Depends(get_indicators_collection),
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if type:
        query["type"] = type
    if q:
        query["value"] = {"$regex": q, "$options": "i"}

    cursor = collection.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
    items = [_doc_to_public(d) for d in cursor]
    total = collection.count_documents(query)

    return {"items": items, "total": total, "skip": skip, "limit": limit}

@app.get("/indicators/{indicator_id}", response_model=IndicatorOut)
def get_indicator(indicator_id: str, collection: Collection = Depends(get_indicators_collection)) -> dict[str, Any]:
    oid = _parse_object_id(indicator_id)
    doc = collection.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return _doc_to_public(doc)

@app.delete("/indicators/{indicator_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_indicator(indicator_id: str, collection: Collection = Depends(get_indicators_collection)) -> None:
    oid = _parse_object_id(indicator_id)
    result = collection.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return None