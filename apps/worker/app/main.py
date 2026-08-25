from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .pipeline import parse_statement

app = FastAPI(title="BalanceProof worker")


class ParseRequest(BaseModel):
    path: str
    filename: str | None = None


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/parse")
def parse(request: ParseRequest):
    try:
        result = parse_statement(request.path, request.filename or request.path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"ok": True, **result}
