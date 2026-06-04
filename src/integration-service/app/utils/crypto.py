"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: Credential encryption and decryption utilities using Fernet
symmetric encryption. The encryption key is read from the ENCRYPTION_KEY
environment variable.
"""

import logging
import os

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
