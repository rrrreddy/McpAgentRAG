"""FastAPI dependencies for authentication and authorization."""
from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.auth.security import TokenError, decode_token
from app.auth.rbac import role_can_use_agent

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


@dataclass
class CurrentUser:
    id: str
    email: str
    role: str
    security_groups: list[str] = field(default_factory=list)

    def can_use_agent(self, agent_name: str) -> bool:
        return role_can_use_agent(self.role, agent_name)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    try:
        payload = decode_token(token, expected_type="access")
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    return CurrentUser(
        id=payload["sub"],
        email=payload["email"],
        role=payload["role"],
        security_groups=payload.get("groups", []),
    )


def require_role(*allowed_roles: str):
    async def _dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role for this operation")
        return user

    return _dep
