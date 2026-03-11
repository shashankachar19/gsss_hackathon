import os
import requests
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
COLLECTION_NAME = "indicators"

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
    confidence: Optional[int] = Field(default=None, ge=0, le=100)
    tags: list[str] = Field(default_factory=list)
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    meta: dict[str, Any] = Field(default_factory=dict)

class IndicatorOut(IndicatorIn):
    id: str
    created_at: datetime
    updated_at: datetime

app = FastAPI(title="Threat Intel API")

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

    # Fast lookup + dedupe.
    indicators.create_index([("type", ASCENDING), ("value", ASCENDING)], unique=True)
    indicators.create_index([("created_at", DESCENDING)])

    app.state.mongo_client = client
    app.state.indicators = indicators

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

# --- HACKATHON CORE REQUIREMENT: FEED PARSER (TURBO BATCHING + SLICING) ---
@app.post("/api/ingest", tags=["Hackathon specific"])
def ingest_feed(collection: Collection = Depends(get_indicators_collection)) -> dict[str, Any]:
    feed_url = "https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt"
    try:
        response = requests.get(feed_url, timeout=10)
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch external feed")
        
        # TANK HACK: Slice the array to only grab the first 500 records for instant live demos
        lines = response.text.split("\n")[:500] 
        now = _utcnow()
        operations = []

        for line in lines:
            if line.startswith("#") or not line.strip():
                continue
            
            ip = line.split()[0]
            doc = {
                "type": "ip",
                "value": ip,
                "source": "Ipsum_Mock_Feed",
                "created_at": now,
                "updated_at": now
            }
            
            # Batching operations
            operations.append(
                UpdateOne(
                    {"type": "ip", "value": ip},
                    {"$setOnInsert": doc},
                    upsert=True
                )
            )
            
        # Send everything to MongoDB Cloud in exactly 1 trip
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
        # TANK FIX: Changed "IP" to "ip" so it actually finds your records!
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


@app.get("/api/indicators")
def api_list_indicators(
    limit: int = 100,
    skip: int = 0,
    collection: Collection = Depends(get_indicators_collection),
):
    if limit < 1 or limit > 5000:
        raise HTTPException(status_code=400, detail="Bad limit")
    if skip < 0:
        raise HTTPException(status_code=400, detail="Bad skip")

    cursor = collection.find({}, {"_id": 0}).skip(skip).limit(limit)
    return list(cursor)

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