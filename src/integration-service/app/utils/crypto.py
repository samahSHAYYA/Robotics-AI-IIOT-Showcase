"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: Credential encryption and decryption utilities using Fernet
symmetric encryption. The encryption key is read from the ENCRYPTION_KEY
environment variable. Also provides key rotation and credential re-encryption.
"""

import logging
import os

from typing import Any

from cryptography.fernet import Fernet

logger: logging.Logger = logging.getLogger(__name__)

_KEY: bytes | str = os.getenv('ENCRYPTION_KEY', Fernet.generate_key())
if isinstance(_KEY, str):
    _KEY = _KEY.encode()


def encrypt(plain_text: str) -> str:
    """
    Encrypt a plain-text string using Fernet symmetric encryption.

    @param plain_text: The string to encrypt.
    @return: The encrypted (cipher) text as a string.
    """
    f = Fernet(_KEY)
    return f.encrypt(plain_text.encode()).decode()


def decrypt(cipher_text: str) -> str:
    """
    Decrypt a Fernet-encrypted string back to plain text.

    @param cipher_text: The encrypted string to decrypt.
    @return: The decrypted plain-text string.
    """
    f = Fernet(_KEY)
    return f.decrypt(cipher_text.encode()).decode()


def rotate_key() -> bytes:
    """
    Generate a new Fernet encryption key and set it as the active global key.

    @return: The new key bytes.
    """
    global _KEY
    _KEY = Fernet.generate_key()
    logger.info('Encryption key rotated globally.')
    return _KEY


def encrypt_credentials(
    auth_config: dict[str, Any],
    key: bytes | None = None,
) -> dict[str, Any]:
    """
    Encrypt all string values in the auth_config dict using Fernet.

    Uses the provided key, or falls back to the global _KEY.

    @param auth_config: The credentials dict to encrypt.
    @param key: Optional Fernet key bytes. Uses global _KEY if None.
    @return: A new dict with all string values encrypted.
    """
    f = Fernet(key or _KEY)
    encrypted: dict[str, Any] = {}
    for k, v in auth_config.items():
        if isinstance(v, str):
            encrypted[k] = f.encrypt(v.encode()).decode()
        else:
            encrypted[k] = v
    logger.debug('Encrypted %d credential fields.', len(encrypted))
    return encrypted
