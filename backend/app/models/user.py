from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Branch(Base):
    __tablename__ = "branch"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)


class User(Base):
    __tablename__ = "app_user"
    __table_args__ = (
        CheckConstraint("role in ('officer','manager')", name="ck_user_role"),
        CheckConstraint("language in ('en','hi')", name="ck_user_language"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10))
    branch_id: Mapped[int] = mapped_column(ForeignKey("branch.id"), index=True)
    language: Mapped[str] = mapped_column(String(2), default="en")
    # Pincodes an officer covers; used by auto-assignment (officers only).
    pincodes: Mapped[list[str]] = mapped_column(ARRAY(String(6)), default=list)

    branch: Mapped[Branch] = relationship()
