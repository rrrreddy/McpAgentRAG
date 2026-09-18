import pytest

from app.auth.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.auth.rbac import role_can_use_agent


def test_password_hash_roundtrip():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed)
    assert not verify_password("wrong password", hashed)


def test_access_token_roundtrip():
    token = create_access_token(user_id="u1", email="a@b.com", role="analyst", security_groups=["G1"])
    payload = decode_token(token, expected_type="access")
    assert payload["sub"] == "u1"
    assert payload["role"] == "analyst"
    assert payload["groups"] == ["G1"]


def test_refresh_token_type_mismatch_rejected():
    access = create_access_token(user_id="u1", email="a@b.com", role="analyst", security_groups=[])
    with pytest.raises(TokenError):
        decode_token(access, expected_type="refresh")


def test_refresh_token_roundtrip():
    token, jti, expires_at = create_refresh_token(user_id="u1")
    payload = decode_token(token, expected_type="refresh")
    assert payload["jti"] == jti
    assert payload["sub"] == "u1"


def test_tampered_token_rejected():
    token = create_access_token(user_id="u1", email="a@b.com", role="analyst", security_groups=[])
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    with pytest.raises(TokenError):
        decode_token(tampered, expected_type="access")


@pytest.mark.parametrize(
    "role,agent,expected",
    [
        ("analyst", "knowledge", True),
        ("analyst", "governance", False),
        ("data_steward", "governance", True),
        ("admin", "admin", True),
        ("analyst", "admin", False),
    ],
)
def test_role_can_use_agent(role, agent, expected):
    assert role_can_use_agent(role, agent) is expected
