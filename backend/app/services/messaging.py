"""Messaging gateway behind one interface. Only the mock exists, as the brief allows.

A real SMS or WhatsApp provider is one new class plus one line in get_gateway,
and nothing else in the app changes (Factory pattern).
"""
import uuid
from typing import Protocol

from app.core.config import settings


class Gateway(Protocol):
    def send(self, phone: str, text: str, channel: str) -> str: ...


class MockGateway:
    """Pretends to send. Keeps what it was given so tests can check it."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    def send(self, phone: str, text: str, channel: str) -> str:
        self.sent.append((phone, text, channel))
        return f"mock-{uuid.uuid4().hex[:12]}"


def get_gateway(provider: str) -> Gateway:
    if provider == "mock":
        return MockGateway()
    raise ValueError(f"Unknown messaging provider: {provider}")


def gateway_dep() -> Gateway:
    return get_gateway(settings.messaging_provider)
