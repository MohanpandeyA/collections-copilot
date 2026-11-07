import pytest

from app.domain.reminder_text import render_template, verify_draft
from app.services.messaging import MockGateway, get_gateway

FACTS = dict(name="Asha Rao", amount="1,50,000", date="5 Nov 2026")


def test_render_fills_all_fields():
    out = render_template("Dear {name}, pay Rs {amount} by {date}.", **FACTS)
    assert out == "Dear Asha Rao, pay Rs 1,50,000 by 5 Nov 2026."


def test_clean_draft_passes():
    ok, reason = verify_draft("Dear Asha Rao, please pay Rs 1,50,000 by 5 Nov 2026.", **FACTS)
    assert ok and reason is None


def test_threat_is_blocked():
    ok, reason = verify_draft("Asha Rao, pay Rs 1,50,000 by 5 Nov 2026 or police will come.", **FACTS)
    assert not ok and "police" in reason


def test_missing_amount_or_date_or_name_is_blocked():
    assert not verify_draft("Dear Asha Rao, pay by 5 Nov 2026.", **FACTS)[0]
    assert not verify_draft("Dear Asha Rao, pay Rs 1,50,000 soon.", **FACTS)[0]
    assert not verify_draft("Dear customer, pay Rs 1,50,000 by 5 Nov 2026.", **FACTS)[0]


def test_invented_number_is_blocked():
    ok, reason = verify_draft("Dear Asha Rao, pay Rs 1,50,000 by 5 Nov 2026, plus Rs 5,000 fee.", **FACTS)
    assert not ok and "number" in reason


def test_overlong_draft_is_blocked():
    text = "Dear Asha Rao, pay Rs 1,50,000 by 5 Nov 2026. " + "Please. " * 80
    assert not verify_draft(text, **FACTS)[0]


def test_mock_gateway_returns_message_id_and_remembers_sends():
    g = MockGateway()
    mid = g.send("9000000001", "hello", "sms")
    assert mid.startswith("mock-") and g.sent == [("9000000001", "hello", "sms")]


def test_factory_default_is_mock_and_unknown_provider_fails():
    assert isinstance(get_gateway("mock"), MockGateway)
    with pytest.raises(ValueError):
        get_gateway("carrier-pigeon")
