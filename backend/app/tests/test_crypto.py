import pytest
from cryptography.fernet import InvalidToken

from app.core.crypto import decrypt, encrypt


def test_round_trip():
    assert decrypt(encrypt("Rahul Chouhan")) == "Rahul Chouhan"


def test_ciphertext_hides_plaintext():
    assert "9876543210" not in encrypt("9876543210")


def test_same_value_encrypts_differently():
    assert encrypt("x") != encrypt("x")


def test_tampered_token_is_rejected():
    token = encrypt("secret")
    with pytest.raises(InvalidToken):
        decrypt(token[:-4] + "AAAA")
