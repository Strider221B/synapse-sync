"""Unit tests for the Config class."""

from __future__ import annotations

from unittest.mock import patch

from tools.youtube_cli.config import Config


class TestConfig:
    """Test suite validating configuration defaults and environment variable overrides."""

    def test_default_values_match_specifications(self) -> None:
        """Verify Config returns expected hardcoded defaults when no environment vars set."""
        with patch.dict("os.environ", {}, clear=True):
            config = Config()
            assert config.get_model_name() == Config.get_default_model()
            assert Config.get_default_model() == "gemini-3.8-flash"
            assert config.get_delay_seconds() == 4.0
            assert config.get_max_retries() == 3
            assert config.get_language() == "en"
            assert config.get_server_url() == "http://localhost:3000"
            assert config.get_drive_folder() == "SynapseSync"
            assert config.get_drive_token() is None
            assert config.get_gemini_api_key() is None
            assert config.get_youtube_notes_api_key() is None

    def test_environment_variable_overrides(self) -> None:
        """Verify Config reads custom settings from environment variables."""
        mock_env = {
            "GEMINI_MODEL": "gemini-custom-model",
            "GEMINI_API_KEY": "gemini-custom-key",
            "YOUTUBE_NOTES_API_KEY": "yt-notes-secret",
            "SYNAPSE_SERVER_URL": "https://synapse-sync.vercel.app",
            "GOOGLE_DRIVE_ACCESS_TOKEN": "gdrive-token-123",
            "GOOGLE_DRIVE_FOLDER_NAME": "MyStudyDrive",
        }
        with patch.dict("os.environ", mock_env, clear=True):
            config = Config()
            assert config.get_model_name() == "gemini-custom-model"
            assert Config.get_default_model() == "gemini-custom-model"
            assert config.get_gemini_api_key() == "gemini-custom-key"
            assert config.get_youtube_notes_api_key() == "yt-notes-secret"
            assert config.get_server_url() == "https://synapse-sync.vercel.app"
            assert config.get_drive_token() == "gdrive-token-123"
            assert config.get_drive_folder() == "MyStudyDrive"

    def test_throttle_speed_environment_overrides(self) -> None:
        """Verify THROTTLE_SPEED environment variable toggles delay seconds."""
        with patch.dict("os.environ", {"THROTTLE_SPEED": "low"}, clear=True):
            assert Config().get_delay_seconds() == 0.0

        with patch.dict("os.environ", {"THROTTLE_SPEED": "high"}, clear=True):
            assert Config().get_delay_seconds() == 4.0

    def test_get_backup_api_keys_single_and_delimited(self) -> None:
        """Verify get_backup_api_keys parses single and comma/semicolon delimited keys."""
        mock_env = {
            "GEMINI_API_KEY": "primary-key",
            "GEMINI_API_KEY_BACKUP": "backup-key-1, backup-key-2; backup-key-3",
        }
        with patch.dict("os.environ", mock_env, clear=True):
            config = Config()
            backups = config.get_gemini_backup_api_keys()
            assert backups == ["backup-key-1", "backup-key-2", "backup-key-3"]
            all_keys = config.get_all_api_keys()
            assert all_keys == ["primary-key", "backup-key-1", "backup-key-2", "backup-key-3"]

    def test_get_backup_api_keys_numbered_fallbacks(self) -> None:
        """Verify numbered GEMINI_API_KEY_BACKUP_<N> environment variables are sorted."""
        mock_env = {
            "GEMINI_API_KEY": "primary",
            "GEMINI_API_KEY_BACKUP": "backup-zero",
            "GEMINI_API_KEY_BACKUP_2": "backup-two",
            "GEMINI_API_KEY_BACKUP_1": "backup-one",
        }
        with patch.dict("os.environ", mock_env, clear=True):
            backups = Config.get_backup_api_keys()
            assert backups == ["backup-zero", "backup-one", "backup-two"]
            assert Config.get_all_gemini_api_keys() == [
                "primary",
                "backup-zero",
                "backup-one",
                "backup-two",
            ]

    def test_get_backup_api_keys_deduplicates_primary_and_empty(self) -> None:
        """Verify get_backup_api_keys filters out empty values and keys equal to primary."""
        mock_env = {
            "GEMINI_API_KEY": "primary-key",
            "GEMINI_API_KEY_BACKUP": "primary-key, , backup-unique",
        }
        with patch.dict("os.environ", mock_env, clear=True):
            backups = Config.get_backup_api_keys()
            assert backups == ["backup-unique"]

