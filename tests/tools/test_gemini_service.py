"""Unit tests for the GeminiService class."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from tools.youtube_cli.config import Config
from tools.youtube_cli.gemini_service import GeminiService


class TestGeminiService:
    """Test suite validating Gemini configuration, rate limit retries, and throttling."""

    def test_configure_sets_api_key_when_provided(self) -> None:
        """Verify configure initializes genai.Client with supplied API key."""
        service = GeminiService(api_key="test-api-key")
        with patch("google.genai.Client") as mock_client_cls:
            client = service.configure()
            assert client == mock_client_cls.return_value
            mock_client_cls.assert_called_once_with(api_key="test-api-key")

    def test_configure_raises_value_error_when_no_key_available(self) -> None:
        """Verify configure raises ValueError when neither param nor env var has key."""
        mock_client = MagicMock()
        service = GeminiService(api_key=None, client=mock_client)
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="GEMINI_API_KEY environment variable is not set"):
                service.configure()

    def test_call_with_retry_succeeds_first_attempt(self) -> None:
        """Verify call_with_retry invokes generate_content and returns response."""
        mock_client = MagicMock()
        mock_response = MagicMock(text='{"result": "ok"}')
        mock_client.models.generate_content.return_value = mock_response

        service = GeminiService(api_key="key", delay_seconds=0.0, client=mock_client)
        model = Config.get_default_model()
        res = service.call_with_retry(model, "test prompt")

        assert res.text == '{"result": "ok"}'
        mock_client.models.generate_content.assert_called_once()

    def test_call_with_retry_retries_on_rate_limit_and_succeeds(self) -> None:
        """Verify call_with_retry catches 429 error and succeeds on subsequent try."""
        mock_client = MagicMock()
        mock_response = MagicMock(text='{"result": "ok"}')
        mock_client.models.generate_content.side_effect = [
            Exception("429 ResourceExhausted: quota exceeded"),
            mock_response,
        ]

        service = GeminiService(api_key="key", delay_seconds=0.0, client=mock_client)
        model = Config.get_default_model()
        with patch("time.sleep"):
            res = service.call_with_retry(model, "prompt", max_retries=2)

        assert res.text == '{"result": "ok"}'
        assert mock_client.models.generate_content.call_count == 2

    def test_call_with_retry_raises_non_rate_limit_errors_immediately(self) -> None:
        """Verify non-retryable exceptions are raised without exhausting retries."""
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = ValueError("Invalid prompt format")

        service = GeminiService(api_key="key", delay_seconds=0.0, client=mock_client)
        model = Config.get_default_model()
        with pytest.raises(ValueError, match="Invalid prompt format"):
            service.call_with_retry(model, "prompt", max_retries=3)

        assert mock_client.models.generate_content.call_count == 1

    def test_throttle_requests_sleeps_when_interval_not_elapsed(self) -> None:
        """Verify _throttle_requests executes sleep when elapsed time is below delay threshold."""
        service = GeminiService(api_key="key", delay_seconds=5.0)
        service._last_call_timestamp = 100.0

        with patch("time.time", return_value=102.0), patch("time.sleep") as mock_sleep:
            service._throttle_requests()
            mock_sleep.assert_called_once_with(3.0)

    def test_call_with_retry_succeeds_with_modern_client(self) -> None:
        """Verify call_with_retry converts dict config to GenerateContentConfig."""
        mock_client = MagicMock()
        mock_response = MagicMock(text='{"result": "ok"}')
        mock_client.models.generate_content.return_value = mock_response

        service = GeminiService(api_key="key", delay_seconds=0.0, client=mock_client)
        model = Config.get_default_model()
        res = service.call_with_retry(
            model, "test prompt", config={"response_mime_type": "application/json"}
        )

        assert res.text == '{"result": "ok"}'
        mock_client.models.generate_content.assert_called_once()

    def test_generate_content_raises_attribute_error_on_unsupported_client(self) -> None:
        """Verify _generate_content raises AttributeError when client lacks expected methods."""
        service = GeminiService(api_key="key", client=object())
        with pytest.raises(AttributeError, match="Provided client does not support"):
            service.call_with_retry("gemini-test", "prompt")

    def test_build_generate_content_config_disables_afc_by_default(self) -> None:
        """Verify _build_generate_content_config sets automatic_function_calling.disable to True."""
        service = GeminiService(api_key="key")
        cfg_none = service._build_generate_content_config(None)
        assert cfg_none.automatic_function_calling is not None
        assert cfg_none.automatic_function_calling.disable is True

        cfg_dict = service._build_generate_content_config(
            {"response_mime_type": "application/json"}
        )
        assert cfg_dict.automatic_function_calling is not None
        assert cfg_dict.automatic_function_calling.disable is True

    def test_call_with_retry_retries_on_503_unavailable_and_succeeds(self) -> None:
        """Verify call_with_retry auto-retries on 503 unavailable temporary demand errors."""
        mock_client = MagicMock()
        mock_response = MagicMock(text='{"result": "ok"}')
        mock_client.models.generate_content.side_effect = [
            Exception("503 UNAVAILABLE. {'error': {'message': 'High demand'}}"),
            mock_response,
        ]

        service = GeminiService(api_key="key", delay_seconds=0.0, client=mock_client)
        model = Config.get_default_model()
        with patch("time.sleep"):
            res = service.call_with_retry(model, "prompt", max_retries=2)

        assert res.text == '{"result": "ok"}'
        assert mock_client.models.generate_content.call_count == 2

    def test_call_with_retry_does_not_retry_daily_quota_error(self) -> None:
        """Verify daily quota exhaustion errors are NOT auto-retried."""
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception(
            "429 RESOURCE_EXHAUSTED. requests per day limit exceeded on Free Tier"
        )

        service = GeminiService(api_key="key", delay_seconds=0.0, client=mock_client)
        model = Config.get_default_model()
        with pytest.raises(Exception, match="limit exceeded on Free Tier"):
            service.call_with_retry(model, "prompt", max_retries=3)

        assert mock_client.models.generate_content.call_count == 1

    def test_call_with_retry_triggers_on_retry_callback(self) -> None:
        """Verify on_retry callback receives attempt count, error object, and backoff delay."""
        mock_client = MagicMock()
        mock_response = MagicMock(text='{"result": "ok"}')
        mock_client.models.generate_content.side_effect = [
            Exception("503 UNAVAILABLE"),
            mock_response,
        ]

        service = GeminiService(api_key="key", delay_seconds=0.0, client=mock_client)
        model = Config.get_default_model()
        retry_events = []

        def callback(attempt: int, err: Exception, backoff: float) -> None:
            retry_events.append((attempt, str(err), backoff))

        with patch("time.sleep"):
            service.call_with_retry(model, "prompt", max_retries=2, on_retry=callback)

        assert len(retry_events) == 1
        assert retry_events[0][0] == 1
        assert "503 UNAVAILABLE" in retry_events[0][1]


