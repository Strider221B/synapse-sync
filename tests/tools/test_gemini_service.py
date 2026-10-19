"""Unit tests for the GeminiService class."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from tools.youtube_cli.gemini_service import GeminiService


class TestGeminiService:
    """Test suite validating Gemini configuration, rate limit retries, and throttling."""

    def test_configure_sets_api_key_when_provided(self) -> None:
        """Verify configure calls genai.configure with supplied API key."""
        mock_genai = MagicMock()
        service = GeminiService(api_key="test-api-key", genai_module=mock_genai)
        service.configure()
        mock_genai.configure.assert_called_once_with(api_key="test-api-key")

    def test_configure_raises_value_error_when_no_key_available(self) -> None:
        """Verify configure raises ValueError when neither param nor env var has key."""
        mock_genai = MagicMock()
        service = GeminiService(api_key=None, genai_module=mock_genai)
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="GEMINI_API_KEY environment variable is not set"):
                service.configure()

    def test_call_with_retry_succeeds_first_attempt(self) -> None:
        """Verify call_with_retry invokes generate_content and returns response."""
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_response = MagicMock(text='{"result": "ok"}')
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        service = GeminiService(api_key="key", delay_seconds=0.0, genai_module=mock_genai)
        res = service.call_with_retry("gemini-2.0-flash", "test prompt")

        assert res.text == '{"result": "ok"}'
        mock_genai.GenerativeModel.assert_called_once_with(model_name="gemini-2.0-flash")

    def test_call_with_retry_retries_on_rate_limit_and_succeeds(self) -> None:
        """Verify call_with_retry catches 429 error and succeeds on subsequent try."""
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_response = MagicMock(text='{"result": "ok"}')
        mock_model.generate_content.side_effect = [
            Exception("429 ResourceExhausted: quota exceeded"),
            mock_response,
        ]
        mock_genai.GenerativeModel.return_value = mock_model

        service = GeminiService(api_key="key", delay_seconds=0.0, genai_module=mock_genai)
        with patch("time.sleep"):
            res = service.call_with_retry("gemini-2.0-flash", "prompt", max_retries=2)

        assert res.text == '{"result": "ok"}'
        assert mock_model.generate_content.call_count == 2

    def test_call_with_retry_raises_non_rate_limit_errors_immediately(self) -> None:
        """Verify non-retryable exceptions are raised without exhausting retries."""
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_model.generate_content.side_effect = ValueError("Invalid prompt format")
        mock_genai.GenerativeModel.return_value = mock_model

        service = GeminiService(api_key="key", delay_seconds=0.0, genai_module=mock_genai)
        with pytest.raises(ValueError, match="Invalid prompt format"):
            service.call_with_retry("gemini-2.0-flash", "prompt", max_retries=3)

        assert mock_model.generate_content.call_count == 1

    def test_throttle_requests_sleeps_when_interval_not_elapsed(self) -> None:
        """Verify _throttle_requests executes sleep when elapsed time is below delay threshold."""
        service = GeminiService(api_key="key", delay_seconds=5.0)
        service._last_call_timestamp = 100.0

        with patch("time.time", return_value=102.0), patch("time.sleep") as mock_sleep:
            service._throttle_requests()
            mock_sleep.assert_called_once_with(3.0)
