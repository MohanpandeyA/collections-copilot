from pydantic import BaseModel


class RejectedOut(BaseModel):
    row_number: int
    loan_id: str
    reason: str


class ImportSummary(BaseModel):
    batch_id: int
    loaded: int
    assigned: int
    fallback_count: int
    rejected_count: int
    closed: int = 0
    rejected: list[RejectedOut]
