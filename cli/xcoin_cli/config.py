"""
Configuration management for xcoin-cli
Handles API keys, user settings, and local configuration
"""

import os
import yaml
from pathlib import Path
from typing import Optional, Dict, Any
from cryptography.fernet import Fernet
from rich.console import Console

console = Console()

CONFIG_DIR = Path.home() / ".xcoin"
CONFIG_FILE = CONFIG_DIR / "config.yml"
KEY_FILE = CONFIG_DIR / ".key"


class ConfigManager:
    """Manages xcoin-cli configuration"""

    def __init__(self):
        self.config_dir = CONFIG_DIR
        self.config_file = CONFIG_FILE
        self.key_file = KEY_FILE
        self._ensure_config_dir()
        self._ensure_encryption_key()

    def _ensure_config_dir(self):
        """Create config directory if it doesn't exist"""
        self.config_dir.mkdir(parents=True, exist_ok=True)

    def _ensure_encryption_key(self):
        """Create encryption key if it doesn't exist"""
        if not self.key_file.exists():
            key = Fernet.generate_key()
            self.key_file.write_bytes(key)
            os.chmod(self.key_file, 0o600)  # Read/write for owner only

    def _get_cipher(self) -> Fernet:
        """Get Fernet cipher for encryption/decryption"""
        key = self.key_file.read_bytes()
        return Fernet(key)

    def _encrypt(self, value: str) -> str:
        """Encrypt a string value"""
        cipher = self._get_cipher()
        return cipher.encrypt(value.encode()).decode()

    def _decrypt(self, encrypted: str) -> str:
        """Decrypt an encrypted value"""
        cipher = self._get_cipher()
        return cipher.decrypt(encrypted.encode()).decode()

    def load(self) -> Dict[str, Any]:
        """Load configuration from file"""
        if not self.config_file.exists():
            return {}

        with open(self.config_file, "r") as f:
            config = yaml.safe_load(f) or {}

        # Decrypt API key if present
        if "api_key" in config and config["api_key"]:
            try:
                config["api_key"] = self._decrypt(config["api_key"])
            except Exception:
                console.print("[yellow]Warning: Could not decrypt API key[/]")
                config["api_key"] = None

        return config

    def save(self, config: Dict[str, Any]):
        """Save configuration to file"""
        # Encrypt API key before saving
        config_to_save = config.copy()
        if "api_key" in config_to_save and config_to_save["api_key"]:
            config_to_save["api_key"] = self._encrypt(config_to_save["api_key"])

        with open(self.config_file, "w") as f:
            yaml.dump(config_to_save, f, default_flow_style=False)

        os.chmod(self.config_file, 0o600)  # Read/write for owner only

    def get(self, key: str, default: Any = None) -> Any:
        """Get a configuration value"""
        config = self.load()
        return config.get(key, default)

    def set(self, key: str, value: Any):
        """Set a configuration value"""
        config = self.load()
        config[key] = value
        self.save(config)

    def get_api_key(self) -> Optional[str]:
        """Get API key"""
        return self.get("api_key")

    def set_api_key(self, api_key: str):
        """Set API key"""
        self.set("api_key", api_key)

    def get_api_url(self) -> str:
        """Get API URL"""
        return self.get("api_url", "https://xcoinalgo.com")

    def set_api_url(self, api_url: str):
        """Set API URL"""
        self.set("api_url", api_url)

    def get_user_info(self) -> Optional[Dict[str, Any]]:
        """Get user information"""
        return self.get("user")

    def set_user_info(self, user_info: Dict[str, Any]):
        """Set user information"""
        self.set("user", user_info)

    def is_authenticated(self) -> bool:
        """Check if user is authenticated"""
        return self.get_api_key() is not None

    def clear(self):
        """Clear all configuration"""
        if self.config_file.exists():
            self.config_file.unlink()


class LocalConfig:
    """Manages local project configuration (.xcoin/config.yml in project root)"""

    def __init__(self, project_dir: Optional[Path] = None):
        self.project_dir = project_dir or Path.cwd()
        self.config_dir = self.project_dir / ".xcoin"
        self.config_file = self.config_dir / "config.yml"

    def _ensure_config_dir(self):
        """Create local config directory if it doesn't exist"""
        self.config_dir.mkdir(parents=True, exist_ok=True)

    def load(self) -> Dict[str, Any]:
        """Load local configuration"""
        if not self.config_file.exists():
            return {}

        with open(self.config_file, "r") as f:
            return yaml.safe_load(f) or {}

    def save(self, config: Dict[str, Any]):
        """Save local configuration"""
        self._ensure_config_dir()
        with open(self.config_file, "w") as f:
            yaml.dump(config, f, default_flow_style=False)

    def get(self, key: str, default: Any = None) -> Any:
        """Get a configuration value"""
        config = self.load()
        return config.get(key, default)

    def set(self, key: str, value: Any):
        """Set a configuration value"""
        config = self.load()
        config[key] = value
        self.save(config)

    def get_strategy_id(self) -> Optional[str]:
        """Get strategy ID"""
        return self.get("strategy_id")

    def set_strategy_id(self, strategy_id: str):
        """Set strategy ID"""
        self.set("strategy_id", strategy_id)

    def get_git_repo(self) -> Optional[str]:
        """Get git repository URL"""
        return self.get("git_repo")

    def set_git_repo(self, repo_url: str):
        """Set git repository URL"""
        self.set("git_repo", repo_url)

    def exists(self) -> bool:
        """Check if local config exists"""
        return self.config_file.exists()


# Global config instance
config = ConfigManager()
