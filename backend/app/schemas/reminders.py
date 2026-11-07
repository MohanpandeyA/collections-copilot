from pydantic import BaseModel, Field


class DraftIn(BaseModel):
    loan_id: str
    language: str = Field(pattern="^(en|hi)$")
    use_ai: bool = False


class DraftOut(BaseModel):
    id: int
    loan_id: str
    language: str
    text: str
    source: str  # template | llm
    state: str
    note: str | None = None  # why the AI draft was not used, when it was not


class SendIn(BaseModel):
    channel: str = Field(pattern="^(sms|whatsapp)$")


class SendOut(BaseModel):
    id: int
    state: str
    message_id: str
