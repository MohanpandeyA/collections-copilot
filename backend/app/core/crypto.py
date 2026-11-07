"""Field-level encryption for borrower PII (DPDP Act 2023).

Fernet = AES-128-CBC + HMAC, so values are encrypted and tamper-evident.
The key comes from FIELD_ENC_KEY; lose it and the data is unreadable.
"""
from cryptography.fernet import Fernet

from app.core.config import settings


def _fernet() -> Fernet:
    if not settings.field_enc_key:
        raise RuntimeError("FIELD_ENC_KEY is not set")
    return Fernet(settings.field_enc_key.encode())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
