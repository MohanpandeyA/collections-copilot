from pydantic import BaseModel


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    language: str


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    branch_id: int
    language: str

    model_config = {"from_attributes": True}
