from pydantic import BaseModel, Field


class OutcomeIn(BaseModel):
    """Deliberately loose types: a malformed item is rejected on its own with a
    reason, instead of failing validation for the whole batch."""

    client_id: str
    loan_id: str
    result: str
    occurred_at: str
    lat: float | None = None
    lng: float | None = None
    note: str | None = Field(default=None, max_length=500)
    promise_date: str | None = None
    promise_amount: str | None = None


class OutcomeBatchIn(BaseModel):
    items: list[OutcomeIn] = Field(max_length=50)


class ItemResult(BaseModel):
    client_id: str
    status: str  # created | duplicate | rejected
    reason: str | None = None


class OutcomeBatchOut(BaseModel):
    results: list[ItemResult]


class ContactAttemptIn(BaseModel):
    loan_id: str
    channel: str = Field(pattern="^(call|sms|whatsapp|visit)$")


class ContactAttemptOut(BaseModel):
    allowed: bool
    block_reason: str | None
