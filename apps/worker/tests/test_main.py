"""Unit tests for main.py functions (non-API tests).

These cover helper functions that are not directly tested via HTTP endpoints.
"""

from __future__ import annotations

import secrets
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import main as worker_main
from app.main import JobStore, assert_is_pdf_bytes, confine_path, require_key


class TestRequireKey:
    """Tests for the require_key authorization helper."""

    def test_allows_request_without_api_key_when_disabled(self):
        """When WORKER_API_KEY is empty, any request passes."""
        require_key(None)
        require_key("")
        require_key("anything")

    def test_allows_request_with_valid_api_key(self, monkeypatch):
        """When configured, correct API key passes."""
        monkeypatch.setattr(worker_main, "WORKER_API_KEY", "mysecret")
        require_key("mysecret")

    def test_rejects_request_with_invalid_api_key(self, monkeypatch):
        """When configured, wrong API key raises 401."""
        monkeypatch.setattr(worker_main, "WORKER_API_KEY", "mysecret")
        with pytest.raises(worker_main.HTTPException) as exc:
            require_key("wrong")
        assert exc.value.status_code == 401

    def test_rejects_missing_api_key_when_required(self, monkeypatch):
        """When configured, missing header raises 401."""
        monkeypatch.setattr(worker_main, "WORKER_API_KEY", "mysecret")
        with pytest.raises(worker_main.HTTPException) as exc:
            require_key(None)
        assert exc.value.status_code == 401


class TestAssertIsPdfBytes:
    """Tests for PDF magic byte validation."""

    def test_accepts_valid_pdf_magic_bytes(self):
        """Valid PDF header passes."""
        assert_is_pdf_bytes(b"%PDF-1.4")
        assert_is_pdf_bytes(b"%PDF-2.0")

    def test_rejects_non_pdf_bytes(self):
        """Non-PDF content raises 415."""
        with pytest.raises(worker_main.HTTPException) as exc:
            assert_is_pdf_bytes(b"#!/bin/sh")
        assert exc.value.status_code == 415

    def test_rejects_empty_bytes(self):
        """Empty content raises 415."""
        with pytest.raises(worker_main.HTTPException) as exc:
            assert_is_pdf_bytes(b"")
        assert exc.value.status_code == 415

    def test_rejects_too_short_bytes(self):
        """Bytes shorter than 5 raise 415."""
        with pytest.raises(worker_main.HTTPException) as exc:
            assert_is_pdf_bytes(b"%PD")
        assert exc.value.status_code == 415


class TestConfinePath:
    """Tests for path confinement security."""

    def test_allows_valid_relative_path(self, tmp_path, monkeypatch):
        """Valid relative paths inside STORAGE_DIR pass."""
        monkeypatch.setattr(worker_main, "STORAGE_DIR", tmp_path)
        test_file = tmp_path / "test.pdf"
        test_file.write_bytes(b"%PDF-")
        result = confine_path("test.pdf")
        assert result == test_file

    def test_allows_valid_absolute_path_inside_storage(self, tmp_path, monkeypatch):
        """Valid absolute paths inside STORAGE_DIR pass."""
        monkeypatch.setattr(worker_main, "STORAGE_DIR", tmp_path)
        test_file = tmp_path / "test.pdf"
        test_file.write_bytes(b"%PDF-")
        result = confine_path(str(test_file))
        assert result == test_file

    def test_blocks_path_traversal_attempts(self, tmp_path, monkeypatch):
        """Path traversal attempts are blocked."""
        monkeypatch.setattr(worker_main, "STORAGE_DIR", tmp_path)
        for hostile in [
            "../../../../etc/passwd",
            "../..",
            "subdir/../../../etc/passwd",
        ]:
            with pytest.raises(worker_main.HTTPException) as exc:
                confine_path(hostile)
            assert exc.value.status_code == 403

    def test_blocks_absolute_paths_outside_storage(self, tmp_path, monkeypatch):
        """Absolute paths outside STORAGE_DIR are blocked."""
        monkeypatch.setattr(worker_main, "STORAGE_DIR", tmp_path)
        with pytest.raises(worker_main.HTTPException) as exc:
            confine_path("/etc/passwd")
        assert exc.value.status_code == 403

    def test_blocks_symlink_escape(self, tmp_path, monkeypatch):
        """Symlinks pointing outside STORAGE_DIR are blocked."""
        monkeypatch.setattr(worker_main, "STORAGE_DIR", tmp_path)
        outside = tmp_path.parent / "outside.pdf"
        outside.write_bytes(b"%PDF-")
        link = tmp_path / "link.pdf"
        link.symlink_to(outside)
        try:
            with pytest.raises(worker_main.HTTPException) as exc:
                confine_path(str(link))
            assert exc.value.status_code == 403
        finally:
            link.unlink(missing_ok=True)
            outside.unlink(missing_ok=True)

    def test_blocks_null_byte_injection(self, tmp_path, monkeypatch):
        """Null bytes in paths are rejected."""
        monkeypatch.setattr(worker_main, "STORAGE_DIR", tmp_path)
        with pytest.raises(worker_main.HTTPException) as exc:
            confine_path("test.pdf\x00")
        assert exc.value.status_code == 400

    def test_blocks_empty_path(self, tmp_path, monkeypatch):
        """Empty paths are rejected."""
        monkeypatch.setattr(worker_main, "STORAGE_DIR", tmp_path)
        with pytest.raises(worker_main.HTTPException) as exc:
            confine_path("")
        assert exc.value.status_code == 400

    def test_returns_404_for_missing_file(self, tmp_path, monkeypatch):
        """Existing files return 404."""
        monkeypatch.setattr(worker_main, "STORAGE_DIR", tmp_path)
        with pytest.raises(worker_main.HTTPException) as exc:
            confine_path("nonexistent.pdf")
        assert exc.value.status_code == 404


class TestJobStore:
    """Tests for the in-memory job store."""

    def test_creates_job_with_expected_fields(self):
        """Jobs are created with all expected fields."""
        store = JobStore()
        job_id = store.create("test.pdf")
        job = store.get(job_id)
        assert job is not None
        assert job["id"] == job_id
        assert job["filename"] == "test.pdf"
        assert job["status"] == "queued"
        assert "created_at" in job
        assert job["result"] is None
        assert job["error"] is None
        assert job["stage"] == "queued"

    def test_updates_job_fields(self):
        """Job fields can be updated."""
        store = JobStore()
        job_id = store.create("test.pdf")
        store.update(job_id, status="done", result={"test": "data"})
        job = store.get(job_id)
        assert job["status"] == "done"
        assert job["result"] == {"test": "data"}

    def test_returns_none_for_unknown_job(self):
        """Unknown job IDs return None."""
        store = JobStore()
        assert store.get("unknown") is None

    def test_handles_concurrent_access_safely(self):
        """Job operations are thread-safe."""
        import threading
        import time

        store = JobStore()
        results = []

        def create_job(name):
            job_id = store.create(name)
            results.append(store.get(job_id))

        threads = [threading.Thread(target=create_job, args=(f"job{i}.pdf",)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(results) == 10
        # Just verify all filenames exist, order is non-deterministic
        filenames = [r["filename"] for r in results]
        assert all(f"job{i}.pdf" in filenames for i in range(10))

    def test_evicts_stale_jobs(self, monkeypatch):
        """Older than TTL are cleaned up."""
        store = JobStore()
        # Create a job
        job_id = store.create("test.pdf")
        assert store.get(job_id) is not None

        # Monkeypatch time to simulate old jobs (use a counter to avoid recursion)
        import time as time_module
        _original_time = time_module.time
        _call_count = [0]
        def mock_time():
            _call_count[0] += 1
            return _original_time() + 25200  # 7 hours > TTL of 6 hours
        monkeypatch.setattr(time_module, "time", mock_time)

        # Trigger eviction
        store._evict()
        assert store.get(job_id) is None
