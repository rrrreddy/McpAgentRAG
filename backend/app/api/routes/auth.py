"""Authentication endpoints: register, token (login), refresh, revoke.

Implements the "User -> API: JWT/OAuth2 authentication" boundary from D3.
Passwords are bcrypt-hashed (never stored/logged in plaintext). Refresh
tokens are tracked server-side (RefreshToken table) so they can be
revoked on logout — a stolen refresh token isn't valid forever just
because its JWT signature checks out.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import RefreshRequest, RegisterRequest, TokenResponse, UserOut
from app.auth.deps import get_current_user, CurrentUser
from app.auth.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.config import get_settings
from app.db.models import RefreshToken, User
from app.db.session import get_db_session

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, session: AsyncSession = Depends(get_db_session)) -> UserOut:
    existing = await session.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name,
        role="analyst",
        security_groups=[],  # entitlements are granted explicitly by a data steward/admin, never self-assigned
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return UserOut(id=user.id, email=user.email, display_name=user.display_name, role=user.role, security_groups=user.security_groups)


async def _issue_tokens(session: AsyncSession, user: User) -> TokenResponse:
    access_token = create_access_token(user_id=str(user.id), email=user.email, role=user.role, security_groups=user.security_groups)
    refresh_token, jti, expires_at = create_refresh_token(user_id=str(user.id))
    session.add(RefreshToken(user_id=user.id, token_jti=jti, expires_at=expires_at))
    await session.commit()
    return TokenResponse(
        access_token=access_token, refresh_token=refresh_token, expires_in=settings.access_token_expire_minutes * 60
    )


@router.post("/token", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(get_db_session)) -> TokenResponse:
    result = await session.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(form_data.password, user.hashed_password):
        # Deliberately identical error for "no such user" and "wrong password" — don't leak which one it was.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    return await _issue_tokens(session, user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, session: AsyncSession = Depends(get_db_session)) -> TokenResponse:
    try:
        token_payload = decode_token(payload.refresh_token, expected_type="refresh")
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid refresh token: {exc}") from exc

    result = await session.execute(select(RefreshToken).where(RefreshToken.token_jti == token_payload["jti"]))
    stored = result.scalar_one_or_none()
    if stored is None or stored.revoked or stored.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked or expired")

    user = await session.get(User, uuid.UUID(token_payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is no longer active")

    # Rotate: revoke the used refresh token and issue a fresh pair.
    stored.revoked = True
    await session.commit()
    return await _issue_tokens(session, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest, session: AsyncSession = Depends(get_db_session)) -> None:
    try:
        token_payload = decode_token(payload.refresh_token, expected_type="refresh")
    except TokenError:
        return  # already invalid; logout is idempotent
    result = await session.execute(select(RefreshToken).where(RefreshToken.token_jti == token_payload["jti"]))
    stored = result.scalar_one_or_none()
    if stored is not None:
        stored.revoked = True
        await session.commit()


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser = Depends(get_current_user)) -> UserOut:
    return UserOut(
        id=uuid.UUID(current_user.id), email=current_user.email, display_name=current_user.email,
        role=current_user.role, security_groups=current_user.security_groups,
    )
