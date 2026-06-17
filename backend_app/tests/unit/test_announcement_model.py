"""Unit tests for the Announcement Pydantic model."""
from datetime import datetime, timezone, timedelta

import pytest
from pydantic import ValidationError

from app.models.announcement import Announcement, AnnouncementPriority, ContentFormat


class TestAnnouncementPriority:
    """Tests for the AnnouncementPriority enum."""

    def test_priority_values(self):
        """Verify expected priority values exist."""
        assert AnnouncementPriority.LOW.value == "low"
        assert AnnouncementPriority.NORMAL.value == "normal"
        assert AnnouncementPriority.HIGH.value == "high"
        assert AnnouncementPriority.CRITICAL.value == "critical"

    def test_priority_is_string_enum(self):
        """Priority enum values should be usable as strings."""
        assert str(AnnouncementPriority.NORMAL) == "normal"


class TestContentFormat:
    """Tests for the ContentFormat enum."""

    def test_content_format_values(self):
        """Verify expected format values exist."""
        assert ContentFormat.MARKDOWN.value == "markdown"
        assert ContentFormat.PLAIN.value == "plain"

    def test_content_format_is_string_enum(self):
        """Format enum values should be usable as strings."""
        assert str(ContentFormat.MARKDOWN) == "markdown"


class TestAnnouncementDefaults:
    """Tests for default field values."""

    def test_minimal_valid_announcement(self):
        """Create announcement with only required fields."""
        announcement = Announcement(
            id="ann-123",
            title="Test Announcement",
            body="This is a test announcement body.",
        )
        assert announcement.id == "ann-123"
        assert announcement.title == "Test Announcement"
        assert announcement.body == "This is a test announcement body."

    def test_default_content_format_is_markdown(self):
        """Content format should default to markdown."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        assert announcement.content_format == ContentFormat.MARKDOWN

    def test_default_priority_is_normal(self):
        """Priority should default to normal."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        assert announcement.priority == AnnouncementPriority.NORMAL

    def test_default_is_active_true(self):
        """is_active should default to True."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        assert announcement.is_active is True

    def test_default_created_by_is_none(self):
        """created_by should default to None."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        assert announcement.created_by is None

    def test_default_target_roles_empty_list(self):
        """target_roles should default to empty list."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        assert announcement.target_roles == []

    def test_default_target_service_areas_empty_list(self):
        """target_service_areas should default to empty list."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        assert announcement.target_service_areas == []

    def test_default_start_at_is_none(self):
        """start_at should default to None."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        assert announcement.start_at is None

    def test_default_end_at_is_none(self):
        """end_at should default to None."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        assert announcement.end_at is None

    def test_created_at_defaults_to_utc_now(self):
        """created_at should default to current UTC time."""
        before = datetime.now(timezone.utc)
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        after = datetime.now(timezone.utc)
        assert before <= announcement.created_at <= after
        assert announcement.created_at.tzinfo is not None

    def test_updated_at_defaults_to_utc_now(self):
        """updated_at should default to current UTC time."""
        before = datetime.now(timezone.utc)
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        after = datetime.now(timezone.utc)
        assert before <= announcement.updated_at <= after
        assert announcement.updated_at.tzinfo is not None


class TestAnnouncementTitleValidation:
    """Tests for title field validation."""

    def test_title_cannot_be_empty(self):
        """Empty title should raise validation error."""
        with pytest.raises(ValidationError) as exc_info:
            Announcement(
                id="ann-123",
                title="",
                body="Body text",
            )
        errors = exc_info.value.errors()
        assert any("title" in str(e.get("loc", ())) for e in errors)

    def test_title_cannot_be_whitespace_only(self):
        """Whitespace-only title should raise validation error."""
        with pytest.raises(ValidationError) as exc_info:
            Announcement(
                id="ann-123",
                title="   ",
                body="Body text",
            )
        errors = exc_info.value.errors()
        assert any("title" in str(e.get("loc", ())) for e in errors)

    def test_title_max_length_255(self):
        """Title exceeding 255 characters should raise validation error."""
        long_title = "a" * 256
        with pytest.raises(ValidationError) as exc_info:
            Announcement(
                id="ann-123",
                title=long_title,
                body="Body text",
            )
        errors = exc_info.value.errors()
        assert any("title" in str(e.get("loc", ())) for e in errors)

    def test_title_exactly_255_is_valid(self):
        """Title with exactly 255 characters should be valid."""
        title = "a" * 255
        announcement = Announcement(
            id="ann-123",
            title=title,
            body="Body text",
        )
        assert len(announcement.title) == 255

    def test_title_is_stripped(self):
        """Title should have leading/trailing whitespace stripped."""
        announcement = Announcement(
            id="ann-123",
            title="  Test Title  ",
            body="Body text",
        )
        assert announcement.title == "Test Title"


class TestAnnouncementBodyValidation:
    """Tests for body field validation."""

    def test_body_max_length_50000(self):
        """Body exceeding 50000 characters should raise validation error."""
        long_body = "a" * 50001
        with pytest.raises(ValidationError) as exc_info:
            Announcement(
                id="ann-123",
                title="Test",
                body=long_body,
            )
        errors = exc_info.value.errors()
        assert any("body" in str(e.get("loc", ())) for e in errors)

    def test_body_exactly_50000_is_valid(self):
        """Body with exactly 50000 characters should be valid."""
        body = "a" * 50000
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body=body,
        )
        assert len(announcement.body) == 50000

    def test_body_supports_markdown(self):
        """Body should allow markdown content."""
        markdown_body = """
# Heading

**Bold text** and *italic text*

- List item 1
- List item 2

```python
def hello():
    return "Hello"
```
"""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body=markdown_body,
        )
        assert "# Heading" in announcement.body
        assert "**Bold text**" in announcement.body


class TestAnnouncementDateValidation:
    """Tests for start_at and end_at date validation."""

    def test_start_at_before_end_at_is_valid(self):
        """start_at before end_at should be valid."""
        start = datetime.now(timezone.utc)
        end = start + timedelta(days=7)
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
            start_at=start,
            end_at=end,
        )
        assert announcement.start_at == start
        assert announcement.end_at == end

    def test_start_at_equals_end_at_is_valid(self):
        """start_at equal to end_at should be valid."""
        same_time = datetime.now(timezone.utc)
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
            start_at=same_time,
            end_at=same_time,
        )
        assert announcement.start_at == announcement.end_at

    def test_start_at_after_end_at_raises_error(self):
        """start_at after end_at should raise validation error."""
        end = datetime.now(timezone.utc)
        start = end + timedelta(days=1)
        with pytest.raises(ValidationError) as exc_info:
            Announcement(
                id="ann-123",
                title="Test",
                body="Body text",
                start_at=start,
                end_at=end,
            )
        assert "start_at" in str(exc_info.value) or "end_at" in str(exc_info.value)

    def test_only_start_at_is_valid(self):
        """Only start_at without end_at should be valid."""
        start = datetime.now(timezone.utc)
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
            start_at=start,
        )
        assert announcement.start_at == start
        assert announcement.end_at is None

    def test_only_end_at_is_valid(self):
        """Only end_at without start_at should be valid."""
        end = datetime.now(timezone.utc)
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
            end_at=end,
        )
        assert announcement.start_at is None
        assert announcement.end_at == end


class TestAnnouncementSerialization:
    """Tests for to_dict and from_dict methods."""

    def test_to_dict_returns_dict(self):
        """to_dict should return a dictionary."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
        )
        result = announcement.to_dict()
        assert isinstance(result, dict)

    def test_to_dict_includes_all_fields(self):
        """to_dict should include all fields."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
            priority=AnnouncementPriority.HIGH,
            target_roles=["Admin", "Editor"],
        )
        result = announcement.to_dict()
        assert result["id"] == "ann-123"
        assert result["title"] == "Test"
        assert result["body"] == "Body text"
        assert result["priority"] == "high"
        assert result["target_roles"] == ["Admin", "Editor"]
        assert result["is_active"] is True
        assert result["content_format"] == "markdown"

    def test_to_dict_datetime_isoformat(self):
        """to_dict should serialize datetime as ISO format string."""
        fixed_time = datetime(2026, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
            created_at=fixed_time,
            updated_at=fixed_time,
        )
        result = announcement.to_dict()
        assert result["created_at"] == "2026-01-15T10:30:00+00:00"
        assert result["updated_at"] == "2026-01-15T10:30:00+00:00"

    def test_from_dict_creates_instance(self):
        """from_dict should create an Announcement from a dict."""
        data = {
            "id": "ann-456",
            "title": "From Dict Test",
            "body": "Created from dictionary.",
            "priority": "high",
            "is_active": False,
            "target_roles": ["Admin"],
            "content_format": "plain",
        }
        announcement = Announcement.from_dict(data)
        assert announcement.id == "ann-456"
        assert announcement.title == "From Dict Test"
        assert announcement.priority == AnnouncementPriority.HIGH
        assert announcement.is_active is False
        assert announcement.content_format == ContentFormat.PLAIN

    def test_round_trip_serialization(self):
        """Announcement should survive to_dict -> from_dict round trip."""
        original = Announcement(
            id="ann-789",
            title="Round Trip Test",
            body="Testing serialization round trip.",
            priority=AnnouncementPriority.CRITICAL,
            target_roles=["User", "Editor"],
            target_service_areas=["HR", "IT"],
            is_active=True,
            created_by="user-001",
        )
        dict_form = original.to_dict()
        recreated = Announcement.from_dict(dict_form)
        
        assert recreated.id == original.id
        assert recreated.title == original.title
        assert recreated.body == original.body
        assert recreated.priority == original.priority
        assert recreated.target_roles == original.target_roles
        assert recreated.target_service_areas == original.target_service_areas
        assert recreated.is_active == original.is_active
        assert recreated.created_by == original.created_by


class TestAnnouncementPriorityCoercion:
    """Tests for priority value coercion."""

    def test_priority_string_coercion(self):
        """Priority should accept string values."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
            priority="critical",
        )
        assert announcement.priority == AnnouncementPriority.CRITICAL

    def test_priority_enum_value(self):
        """Priority should accept enum values directly."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
            priority=AnnouncementPriority.LOW,
        )
        assert announcement.priority == AnnouncementPriority.LOW


class TestContentFormatCoercion:
    """Tests for content_format value coercion."""

    def test_content_format_string_coercion(self):
        """content_format should accept string values."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
            content_format="plain",
        )
        assert announcement.content_format == ContentFormat.PLAIN

    def test_content_format_enum_value(self):
        """content_format should accept enum values directly."""
        announcement = Announcement(
            id="ann-123",
            title="Test",
            body="Body text",
            content_format=ContentFormat.MARKDOWN,
        )
        assert announcement.content_format == ContentFormat.MARKDOWN
