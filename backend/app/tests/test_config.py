from app.core.config import Settings


def test_plain_postgres_urls_get_the_psycopg_driver():
    assert Settings(database_url="postgres://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"
    assert Settings(database_url="postgresql://u:p@h/db?sslmode=require").database_url == "postgresql+psycopg://u:p@h/db?sslmode=require"


def test_a_url_that_already_names_the_driver_is_left_alone():
    url = "postgresql+psycopg://localhost/collections_copilot"
    assert Settings(database_url=url).database_url == url
