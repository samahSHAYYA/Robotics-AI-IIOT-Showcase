"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: JWT token creation / verification, password hashing utilities,
and API key management for multi-tenant RBAC.
"""

import os
import secrets

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY: str = os.getenv('JWT_SECRET', 'super-secret-key-change-in-production')
ALGORITHM: str = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv('JWT_EXPIRE_MINUTES', '480'))

pwd_context = CryptContext(schemes = ['bcrypt'], deprecated = 'auto')


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """
    Create a JWT access token with the given claims.

    Expected payload keys:
      - 'sub': username
      - 'role': user role string
      - 'tenant_id': int or None
      - 'factory_id': int or None
      - 'scope': computed scope string (optional)

    @param data: Claims to encode in the JWT.
    @param expires_delta: Optional custom expiry duration.
    @return: Encoded JWT string.
    """
    to_encode: dict[str, Any] = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes = ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({'exp': expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm = ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload: dict[str, Any] = jwt.decode(token, SECRET_KEY, algorithms = [ALGORITHM])
        return payload
    except JWTError:
        return None


# ── API Key Management ──────────────────────────────────────────────────────


def create_api_key() -> tuple[str, str]:
    """
    Generate a new API key and return (plain_key, hashed_key).

    The plain key is prefixed with 'ak_' for easy identification and is
    suitable for one-time display. Store only the hashed version.

    @return: Tuple of (plain_text_key, bcrypt_hash).
    """
    api_key: str = f'ak_{secrets.token_urlsafe(32)}'
    hashed: str = pwd_context.hash(api_key)
    return api_key, hashed


def verify_api_key(plain_key: str, hashed_key: str) -> bool:
    """
    Verify a plain-text API key against its stored bcrypt hash.

    @param plain_key: The plain-text API key to verify.
    @param hashed_key: The stored bcrypt hash.
    @return: True if the key matches, False otherwise.
    """
    return pwd_context.verify(plain_key, hashed_key)
