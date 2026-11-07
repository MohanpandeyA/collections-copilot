from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReminderTemplate(Base):
    __tablename__ = "reminder_template"
    __table_args__ = (CheckConstraint("language in ('en','hi')", name="ck_template_language"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40))
    language: Mapped[str] = mapped_column(String(2))
    body: Mapped[str] = mapped_column(Text)  # uses {name} {amount} {date}
    approved: Mapped[bool] = mapped_column(default=False)


class ReminderDraft(Base):
    __tablename__ = "reminder_draft"
    __table_args__ = (
        CheckConstraint("state in ('draft','sent','blocked')", name="ck_draft_state"),
        CheckConstraint("source in ('template','llm')", name="ck_draft_source"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[str] = mapped_column(ForeignKey("loan.loan_id"))
    officer_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    template_id: Mapped[int] = mapped_column(ForeignKey("reminder_template.id"))
    text: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(10), default="template")
    state: Mapped[str] = mapped_column(String(8), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
