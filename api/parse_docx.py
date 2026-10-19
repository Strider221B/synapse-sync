"""Serverless endpoint handler for parsing .docx documents and extracting plain text."""

from __future__ import annotations

import email
import email.policy
import io
import json
import xml.etree.ElementTree as ET
import zipfile
from http.server import BaseHTTPRequestHandler
from typing import Any, ClassVar


class ParseDocx(BaseHTTPRequestHandler):
    """HTTP request handler for extracting text and metadata from Word .docx files."""

    _WORD_NS: ClassVar[str] = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    _DOCUMENT_XML_PATH: ClassVar[str] = "word/document.xml"
    _HEADER_CONTENT_TYPE: ClassVar[str] = "Content-Type"
    _HEADER_CONTENT_LENGTH: ClassVar[str] = "Content-Length"
    _MIME_JSON: ClassVar[str] = "application/json"
    _MULTIPART_PREFIX: ClassVar[str] = "multipart/form-data"
    _FIELD_FILE: ClassVar[str] = "file"
    _HEADER_CONTENT_DISPOSITION: ClassVar[str] = "content-disposition"
    _PARAM_NAME: ClassVar[str] = "name"
    _TAG_PARAGRAPH: ClassVar[str] = "p"
    _TAG_TEXT: ClassVar[str] = "t"
    _ENCODING: ClassVar[str] = "utf-8"
    _WORDS_PER_MINUTE: ClassVar[int] = 250
    _DEFAULT_MIN_READ_TIME: ClassVar[int] = 1
    _ZIP_MAGIC: ClassVar[bytes] = b"PK\x03\x04"
    _HTTP_OK: ClassVar[int] = 200
    _HTTP_BAD_REQUEST: ClassVar[int] = 400
    _HTTP_METHOD_NOT_ALLOWED: ClassVar[int] = 405
    _HTTP_INTERNAL_ERROR: ClassVar[int] = 500
    _ERR_METHOD_NOT_ALLOWED: ClassVar[str] = "METHOD_NOT_ALLOWED"
    _ERR_MISSING_FILE: ClassVar[str] = "MISSING_FILE"
    _ERR_INVALID_FILE: ClassVar[str] = "INVALID_FILE_FORMAT"
    _ERR_PARSE_FAILED: ClassVar[str] = "PARSE_FAILED"

    def do_POST(self) -> None:
        """Handle POST requests for extracting text from uploaded .docx files."""
        try:
            file_bytes = self._extract_file_bytes()
            if not file_bytes:
                self._send_error_response(
                    self._HTTP_BAD_REQUEST,
                    self._ERR_MISSING_FILE,
                    "No file uploaded or file is empty",
                )
                return
            result = self.extract_docx_text(file_bytes)
            self._send_json_response(self._HTTP_OK, result)
        except (zipfile.BadZipFile, ET.ParseError, ValueError) as err:
            self._send_error_response(
                self._HTTP_BAD_REQUEST,
                self._ERR_INVALID_FILE,
                str(err),
            )
        except Exception as err:
            self._send_error_response(
                self._HTTP_INTERNAL_ERROR,
                self._ERR_PARSE_FAILED,
                str(err),
            )

    def do_GET(self) -> None:
        """Reject GET requests with 405 Method Not Allowed."""
        self._send_error_response(
            self._HTTP_METHOD_NOT_ALLOWED,
            self._ERR_METHOD_NOT_ALLOWED,
            "Use POST with multipart/form-data or binary docx",
        )

    def extract_docx_text(self, file_bytes: bytes) -> dict[str, Any]:
        """Extract paragraph text and calculate metadata from docx binary bytes."""
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as doc_archive:
            if self._DOCUMENT_XML_PATH not in doc_archive.namelist():
                raise ValueError("Archive is missing word/document.xml")
            xml_content = doc_archive.read(self._DOCUMENT_XML_PATH)

        paragraphs = self._extract_paragraphs(xml_content)
        full_text = "\n\n".join(paragraphs)
        word_count = len(full_text.split()) if full_text else 0
        read_time = (
            max(self._DEFAULT_MIN_READ_TIME, word_count // self._WORDS_PER_MINUTE)
            if word_count > 0
            else 0
        )
        return self._build_success_payload(full_text, len(paragraphs), word_count, read_time)

    def _extract_file_bytes(self) -> bytes:
        """Read and extract document bytes from HTTP request body."""
        content_length_header = self.headers.get(self._HEADER_CONTENT_LENGTH, "0")
        try:
            content_length = int(content_length_header)
        except ValueError:
            return b""
        if content_length <= 0:
            return b""

        body = self.rfile.read(content_length)
        content_type = self.headers.get(self._HEADER_CONTENT_TYPE, "")
        if content_type.startswith(self._MULTIPART_PREFIX):
            return self._parse_multipart_file(body, content_type)
        if body.startswith(self._ZIP_MAGIC):
            return body
        return b""

    def _parse_multipart_file(self, body: bytes, content_type: str) -> bytes:
        """Parse multipart/form-data body and extract file field bytes."""
        header_bytes = f"{self._HEADER_CONTENT_TYPE}: {content_type}\r\n\r\n".encode(self._ENCODING)
        message = email.message_from_bytes(header_bytes + body, policy=email.policy.default)
        for part in message.iter_parts():
            part_name = part.get_param(self._PARAM_NAME, header=self._HEADER_CONTENT_DISPOSITION)
            if part_name == self._FIELD_FILE or part.get_filename():
                payload = part.get_payload(decode=True)
                if isinstance(payload, bytes):
                    return payload
        return b""

    def _extract_paragraphs(self, xml_content: bytes) -> list[str]:
        """Parse Word XML and extract list of paragraph strings."""
        tree = ET.fromstring(xml_content)
        tag_p = f"{self._WORD_NS}{self._TAG_PARAGRAPH}"
        tag_t = f"{self._WORD_NS}{self._TAG_TEXT}"
        paragraphs: list[str] = []

        for para in tree.iter(tag_p):
            runs = [node.text for node in para.iter(tag_t) if node.text]
            if runs:
                combined = "".join(runs).strip()
                if combined:
                    paragraphs.append(combined)
        return paragraphs

    def _build_success_payload(
        self, text: str, paragraph_count: int, word_count: int, read_time: int
    ) -> dict[str, Any]:
        """Construct the response dictionary with text and computed metadata."""
        return {
            "text": text,
            "metadata": {
                "paragraphCount": paragraph_count,
                "wordCount": word_count,
                "estimatedReadTimeMinutes": read_time,
            },
        }

    def _send_json_response(self, status_code: int, data: dict[str, Any]) -> None:
        """Write JSON encoded response with status code and headers."""
        payload_bytes = json.dumps(data).encode(self._ENCODING)
        self.send_response(status_code)
        self.send_header(self._HEADER_CONTENT_TYPE, self._MIME_JSON)
        self.end_headers()
        self.wfile.write(payload_bytes)

    def _send_error_response(self, status_code: int, code: str, message: str) -> None:
        """Write structured error response conforming to API specifications."""
        error_payload = {
            "error": {
                "code": code,
                "message": message,
            }
        }
        self._send_json_response(status_code, error_payload)


handler = ParseDocx
