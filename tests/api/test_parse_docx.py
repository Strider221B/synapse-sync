"""Unit tests for the ParseDocx endpoint handler."""

from __future__ import annotations

import io
import json
import zipfile
from email.message import Message
from typing import ClassVar
from unittest.mock import patch

from api.parse_docx import ParseDocx


class TestParseDocx:
    """Test suite verifying behavior of the ParseDocx API handler."""

    _HEADER_CONTENT_TYPE: ClassVar[str] = "Content-Type"
    _HEADER_CONTENT_LENGTH: ClassVar[str] = "Content-Length"
    _MIME_JSON: ClassVar[str] = "application/json"
    _MULTIPART_HEADER: ClassVar[str] = "multipart/form-data; boundary=----WebKitFormBoundaryXYZ"
    _ENCODING: ClassVar[str] = "utf-8"
    _HTTP_OK: ClassVar[int] = 200
    _HTTP_BAD_REQUEST: ClassVar[int] = 400
    _HTTP_METHOD_NOT_ALLOWED: ClassVar[int] = 405
    _HTTP_INTERNAL_ERROR: ClassVar[int] = 500

    def test_extract_docx_text_extracts_paragraphs_and_metadata(self) -> None:
        """Verify that extract_docx_text correctly parses paragraphs and computes stats."""
        docx_bytes = self._create_sample_docx(["First paragraph text.", "Second paragraph text."])
        instance = self._create_uninitialized_handler()

        result = instance.extract_docx_text(docx_bytes)

        assert "First paragraph text." in result["text"]
        assert "Second paragraph text." in result["text"]
        assert result["metadata"]["paragraphCount"] == 2
        assert result["metadata"]["wordCount"] == 6
        assert result["metadata"]["estimatedReadTimeMinutes"] == 1

    def test_extract_docx_text_raises_when_document_xml_missing(self) -> None:
        """Verify ValueError is raised when zip does not contain word/document.xml."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("other.txt", "content")
        instance = self._create_uninitialized_handler()

        try:
            instance.extract_docx_text(buffer.getvalue())
            assert False, "Expected ValueError"
        except ValueError as err:
            assert "Archive is missing word/document.xml" in str(err)

    def test_do_get_returns_405_method_not_allowed(self) -> None:
        """Verify that GET requests receive a 405 Method Not Allowed response."""
        instance = self._create_uninitialized_handler()
        instance.wfile = io.BytesIO()

        with (
            patch.object(instance, "send_response") as mock_send_resp,
            patch.object(instance, "send_header") as mock_send_header,
            patch.object(instance, "end_headers") as mock_end_headers,
        ):
            instance.do_GET()
            mock_send_resp.assert_called_once_with(self._HTTP_METHOD_NOT_ALLOWED)
            mock_send_header.assert_called_once_with(self._HEADER_CONTENT_TYPE, self._MIME_JSON)
            mock_end_headers.assert_called_once()

        response_data = json.loads(instance.wfile.getvalue().decode(self._ENCODING))
        assert response_data["error"]["code"] == "METHOD_NOT_ALLOWED"

    def test_do_post_successful_with_multipart_upload(self) -> None:
        """Verify do_POST extracts docx text when submitted as multipart/form-data."""
        docx_bytes = self._create_sample_docx(["Sample syllabus content."])
        content_type_line = (
            b"Content-Type: "
            b"application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n"
        )
        multipart_body = (
            b"------WebKitFormBoundaryXYZ\r\n"
            b'Content-Disposition: form-data; name="file"; filename="syllabus.docx"\r\n'
            + content_type_line
            + docx_bytes
            + b"\r\n------WebKitFormBoundaryXYZ--\r\n"
        )

        instance = self._create_uninitialized_handler()
        instance.headers = self._create_headers(str(len(multipart_body)), self._MULTIPART_HEADER)
        instance.rfile = io.BytesIO(multipart_body)
        instance.wfile = io.BytesIO()

        with (
            patch.object(instance, "send_response") as mock_send_resp,
            patch.object(instance, "send_header"),
            patch.object(instance, "end_headers"),
        ):
            instance.do_POST()
            mock_send_resp.assert_called_once_with(self._HTTP_OK)

        response_data = json.loads(instance.wfile.getvalue().decode(self._ENCODING))
        assert response_data["text"] == "Sample syllabus content."
        assert response_data["metadata"]["paragraphCount"] == 1

    def test_do_post_returns_400_when_no_file_uploaded(self) -> None:
        """Verify do_POST returns 400 Bad Request if request body is empty."""
        instance = self._create_uninitialized_handler()
        instance.headers = self._create_headers("0")
        instance.rfile = io.BytesIO(b"")
        instance.wfile = io.BytesIO()

        with (
            patch.object(instance, "send_response") as mock_send_resp,
            patch.object(instance, "send_header"),
            patch.object(instance, "end_headers"),
        ):
            instance.do_POST()
            mock_send_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        response_data = json.loads(instance.wfile.getvalue().decode(self._ENCODING))
        assert response_data["error"]["code"] == "MISSING_FILE"

    def test_do_post_returns_400_on_corrupted_file(self) -> None:
        """Verify do_POST returns 400 when uploaded data is not a valid docx archive."""
        corrupted_bytes = b"PK\x03\x04corrupted-not-a-valid-zip-file-data"
        instance = self._create_uninitialized_handler()
        instance.headers = self._create_headers(str(len(corrupted_bytes)))
        instance.rfile = io.BytesIO(corrupted_bytes)
        instance.wfile = io.BytesIO()

        with (
            patch.object(instance, "send_response") as mock_send_resp,
            patch.object(instance, "send_header"),
            patch.object(instance, "end_headers"),
        ):
            instance.do_POST()
            mock_send_resp.assert_called_once_with(self._HTTP_BAD_REQUEST)

        response_data = json.loads(instance.wfile.getvalue().decode(self._ENCODING))
        assert response_data["error"]["code"] == "INVALID_FILE_FORMAT"

    def test_do_post_returns_500_on_unexpected_internal_error(self) -> None:
        """Verify do_POST returns 500 when an unexpected exception is raised."""
        docx_bytes = self._create_sample_docx(["Paragraph"])
        instance = self._create_uninitialized_handler()
        instance.headers = self._create_headers(str(len(docx_bytes)))
        instance.rfile = io.BytesIO(docx_bytes)
        instance.wfile = io.BytesIO()

        error_side_effect = RuntimeError("Unexpected error")
        with (
            patch.object(instance, "extract_docx_text", side_effect=error_side_effect),
            patch.object(instance, "send_response") as mock_send_resp,
            patch.object(instance, "send_header"),
            patch.object(instance, "end_headers"),
        ):
            instance.do_POST()
            mock_send_resp.assert_called_once_with(self._HTTP_INTERNAL_ERROR)

        response_data = json.loads(instance.wfile.getvalue().decode(self._ENCODING))
        assert response_data["error"]["code"] == "PARSE_FAILED"

    def _create_uninitialized_handler(self) -> ParseDocx:
        """Create handler instance without calling socket base initializer."""
        instance = ParseDocx.__new__(ParseDocx)
        instance.headers = self._create_headers("0")
        return instance

    def _create_headers(self, content_length: str, content_type: str = "") -> Message:
        """Create email Message instance mimicking HTTP headers."""
        headers = Message()
        headers[self._HEADER_CONTENT_LENGTH] = content_length
        if content_type:
            headers[self._HEADER_CONTENT_TYPE] = content_type
        return headers

    def _create_sample_docx(self, paragraphs: list[str]) -> bytes:
        """Generate binary bytes for a minimal valid .docx archive."""
        xml_paras = "".join(
            f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs
        )
        document_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body>{xml_paras}</w:body>"
            "</w:document>"
        )

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("word/document.xml", document_xml)
        return buffer.getvalue()
