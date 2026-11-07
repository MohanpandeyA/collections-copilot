from app.domain.word_filter import check_draft


def test_clean_reminder_passes():
    ok, hits = check_draft("Dear Ramesh, your payment of Rs 50000 was due on 05 Nov. Please pay soon.")
    assert ok is True and hits == []


def test_threatening_english_is_blocked():
    ok, hits = check_draft("We will seize your shop and call your family.")
    assert ok is False
    assert "seize" in hits


def test_matching_is_case_insensitive():
    ok, _ = check_draft("PRISON will follow if you ignore this.")
    assert ok is False


def test_threatening_hindi_is_blocked():
    ok, hits = check_draft("आपको जेल भेज दिया जाएगा।")
    assert ok is False and "जेल" in hits
