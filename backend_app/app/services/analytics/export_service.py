import io
import asyncio
import csv
import tempfile
import os
from datetime import UTC, datetime, timedelta
from typing import Dict, Any, List, Optional, Set, TYPE_CHECKING, AsyncIterator
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from azure.cosmos.exceptions import CosmosHttpResponseError

from ...core.logging import get_logger
from ...repositories.analytics import (
    AnalyticsPromptExportRepository,
    AnalyticsPromptRepository,
    AnalyticsReadRepository,
)
from ...repositories.users import UserRepository
from .analytics_service import resolve_prompt_category_ids_for_business_units

logger = get_logger(__name__)

EXPORT_SERVICE_ERRORS = (CosmosHttpResponseError, RuntimeError, OSError, ValueError, TypeError)
EXPORT_RENDER_ERRORS = (TypeError, ValueError, KeyError)

if TYPE_CHECKING:
    from .analytics_service import AnalyticsService
    from ..prompts.prompt_service import PromptService


class ExportService:
    """Service for exporting analytics and user data to CSV/PDF formats."""
    
    def __init__(
        self,
        analytics_service: "AnalyticsService",
        prompt_service: Optional["PromptService"] = None,
        user_repository: UserRepository | None = None,
        analytics_repository: AnalyticsReadRepository | None = None,
        prompt_export_repository: AnalyticsPromptExportRepository | None = None,
        prompt_repository: AnalyticsPromptRepository | None = None,
    ):
        if user_repository is None or analytics_repository is None or prompt_export_repository is None or prompt_repository is None:
            raise RuntimeError("ExportService requires explicit repository dependencies")

        self.user_repository = user_repository
        self.analytics_repository = analytics_repository
        self.prompt_export_repository = prompt_export_repository
        self.prompt_repository = prompt_repository
        self.logger = logger
        self.analytics_service = analytics_service
        self.prompt_service = prompt_service

    async def export_users_csv(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        try:
            users_result = await self.user_repository.list()
            users = users_result.get("items", [])
            
            if filters:
                users = self._apply_user_filters(users, filters)
            
            temp_file = tempfile.NamedTemporaryFile(
                mode='w', 
                suffix='.csv', 
                delete=False,
                newline='',
                encoding='utf-8'
            )
            
            writer = csv.writer(temp_file)
            
            headers = [
                'ID', 'Email', 'Full Name', 'Permission', 'Source',
                'Microsoft OID', 'Tenant ID', 'Created At', 'Last Login',
                'Is Active', 'Permission Changed At', 'Permission Changed By'
            ]
            writer.writerow(headers)
            
            for user in users:
                row = [
                    user.get('id', ''),
                    user.get('email', ''),
                    user.get('full_name', ''),
                    user.get('permission', ''),
                    user.get('source', ''),
                    user.get('microsoft_oid', ''),
                    user.get('tenant_id', ''),
                    user.get('created_at', ''),
                    user.get('last_login', ''),
                    str(user.get('is_active', False)),
                    user.get('permission_changed_at', ''),
                    user.get('permission_changed_by', '')
                ]
                writer.writerow(row)
            
            temp_file.close()

            # We wrote one header + N rows
            record_count = 0
            try:
                with open(temp_file.name, 'r', encoding='utf-8') as rf:
                    # skip header
                    reader = csv.reader(rf)
                    rows = list(reader)
                    record_count = max(0, len(rows) - 1)
            except OSError as exc:
                self.logger.debug(
                    "export_users_recount_failed",
                    exc_info=True,
                    temp_file=temp_file.name,
                    error=str(exc),
                )
                record_count = len(users)

            timestamp = datetime.now(UTC).strftime('%Y%m%d_%H%M%S')
            filename = f'community-brief-users-{timestamp}.csv'

            return {
                'status': 'success',
                'file_path': temp_file.name,
                'filename': filename,
                'content_type': 'text/csv',
                'record_count': record_count,
            }
        except EXPORT_SERVICE_ERRORS as e:
            self.logger.error(
                "export_users_csv_failed",
                exc_info=True,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {
                'status': 'error',
                'message': str(e)
            }

    async def stream_users_csv(self, filters: Optional[Dict[str, Any]] = None) -> AsyncIterator[str]:
        """
        Stream all users as CSV data
        
        Args:
            filters: Optional filters to apply
            
        Yields:
            CSV formatted strings (rows)
        """
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header row
        headers = [
            'ID', 'Email', 'Full Name', 'Permission', 'Source',
            'Microsoft OID', 'Tenant ID', 'Created At', 'Last Login',
            'Is Active', 'Permission Changed At', 'Permission Changed By'
        ]
        writer.writerow(headers)
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)
        
        # Stream users
        async for user in self.user_repository.iter_all():
            # Apply filters
            if filters and not self._check_user_matches_filters(user, filters):
                continue
                
            row = [
                user.get('id', ''),
                user.get('email', ''),
                user.get('full_name', ''),
                user.get('permission', ''),
                user.get('source', ''),
                user.get('microsoft_oid', ''),
                user.get('tenant_id', ''),
                user.get('created_at', ''),
                user.get('last_login', ''),
                str(user.get('is_active', False)),
                user.get('permission_changed_at', ''),
                user.get('permission_changed_by', '')
            ]
            writer.writerow(row)
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    def _check_user_matches_filters(self, user: Dict[str, Any], filters: Dict[str, Any]) -> bool:
        """Check if user matches the provided filters"""
        # Re-use logic from _apply_user_filters but for single user
        # Since _apply_user_filters operates on list, we implement single check here
        
        if 'permission' in filters and filters['permission']:
            if user.get('permission') != filters['permission']:
                return False
                
        if 'is_active' in filters and filters['is_active'] is not None:
            if user.get('is_active') != filters['is_active']:
                return False
                
        if 'date_from' in filters and filters['date_from']:
            created_at = user.get('created_at')
            if not created_at or created_at < filters['date_from']:
                return False
                
        if 'date_to' in filters and filters['date_to']:
            created_at = user.get('created_at')
            if not created_at or created_at > filters['date_to']:
                return False
                
        return True

    def _apply_user_filters(self, users: List[Dict[str, Any]], filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Apply filters to user list"""
        filtered_users = users
        
        # Filter by permission
        if 'permission' in filters and filters['permission']:
            filtered_users = [u for u in filtered_users if u.get('permission') == filters['permission']]
        
        # Filter by active status
        if 'is_active' in filters:
            filtered_users = [u for u in filtered_users if u.get('is_active') == filters['is_active']]
        
        # Filter by date range
        if 'date_range' in filters and filters['date_range']:
            date_range = filters['date_range']
            start_date = date_range.get('start')
            end_date = date_range.get('end')
            
            if start_date or end_date:
                filtered_users = self._filter_by_date_range(filtered_users, start_date, end_date)
        
        return filtered_users

    def _filter_by_date_range(self, users: List[Dict[str, Any]], start_date: str, end_date: str) -> List[Dict[str, Any]]:
        """Filter users by date range"""
        filtered = []
        
        for user in users:
            created_at = user.get('created_at')
            if not created_at:
                continue
                
            try:
                user_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                
                if start_date:
                    start_dt = datetime.fromisoformat(start_date)
                    if user_date < start_dt:
                        continue
                
                if end_date:
                    end_dt = datetime.fromisoformat(end_date)
                    if user_date > end_dt:
                        continue
                
                filtered.append(user)
                
            except (ValueError, TypeError) as exc:
                self.logger.debug(
                    "export_user_filter_invalid_created_at",
                    exc_info=True,
                    user_id=user.get('id'),
                    created_at=created_at,
                    error=str(exc),
                )
                continue
        
        return filtered

    def _format_datetime(self, dt_string: Optional[str]) -> str:
        """Format datetime string for display"""
        if not dt_string:
            return 'N/A'
        
        try:
            dt = datetime.fromisoformat(dt_string.replace('Z', '+00:00'))
            return dt.strftime('%Y-%m-%d %H:%M:%S UTC')
        except (ValueError, TypeError) as exc:
            self.logger.debug(
                "export_datetime_format_failed",
                exc_info=True,
                value=dt_string,
                error=str(exc),
            )
            return dt_string

    async def cleanup_temp_file(self, file_path: str):
        """Clean up temporary export file"""
        try:
            if os.path.exists(file_path):
                os.unlink(file_path)
        except EXPORT_SERVICE_ERRORS as e:
            self.logger.error(
                "export_temp_file_cleanup_failed",
                file_path=file_path,
                error=str(e),
                error_type=type(e).__name__,
            )

    async def export_user_details_pdf(self, user_id: str, include_analytics: bool = True, days: int = 30) -> Dict[str, Any]:
        """Create a PDF describing a user's details and optional analytics summary.

        Returns a dict with keys: status, file_path, filename, content_type or status:error + message
        """
        try:
            user = await self.user_repository.get_by_id(user_id)
            if not user:
                return {'status': 'error', 'message': 'User not found'}

            # Optional analytics
            analytics = None
            minutes_records = None
            if include_analytics:
                try:
                    analytics_result = await self.analytics_service.get_user_analytics(user_id, days=days)
                    analytics = analytics_result
                    minutes_records = await self.analytics_service.get_user_minutes_records(user_id, days=days)
                except EXPORT_SERVICE_ERRORS as e:
                    self.logger.warning(
                        "export_user_pdf_analytics_load_failed",
                        user_id=user_id,
                        error=str(e),
                        error_type=type(e).__name__,
                    )

            # Build PDF
            temp_file = tempfile.NamedTemporaryFile(mode='wb', suffix='.pdf', delete=False)
            temp_file.close()

            doc = SimpleDocTemplate(temp_file.name, pagesize=letter)
            styles = getSampleStyleSheet()
            story = []

            story.append(Paragraph(f"User Details - {user.get('full_name','')} ({user.get('email','')})", styles['Title']))
            story.append(Spacer(1, 0.2 * inch))

            # Basic info
            info_rows = [
                ['ID', user.get('id', '')],
                ['Email', user.get('email', '')],
                ['Full Name', user.get('full_name', '')],
                ['Permission', user.get('permission', '')],
                ['Source', user.get('source', '')],
                ['Created At', self._format_datetime(user.get('created_at'))],
                ['Last Login', self._format_datetime(user.get('last_login'))],
            ]

            table = Table(info_rows, hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.whitesmoke), ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)]))
            story.append(table)
            story.append(Spacer(1, 0.2 * inch))

            if analytics:
                story.append(Paragraph("Analytics Summary", styles['Heading2']))
                # For simplicity include a few top-level keys
                try:
                    if isinstance(analytics, dict):
                        # Pretty print some keys
                        for key, val in (analytics.get('analytics', {}) if 'analytics' in analytics else analytics).items():
                            story.append(Paragraph(f"{key}: {val}", styles['Normal']))
                except EXPORT_RENDER_ERRORS as exc:
                    self.logger.warning(
                        "export_user_pdf_analytics_render_failed",
                        exc_info=True,
                        user_id=user_id,
                        error=str(exc),
                    )
                    story.append(Paragraph("Unable to render analytics details.", styles['Normal']))

            doc.build(story)

            timestamp = datetime.now(UTC).strftime('%Y%m%d_%H%M%S')
            filename = f'community-brief-user-{user_id}-{timestamp}.pdf'

            return {
                'status': 'success',
                'file_path': temp_file.name,
                'filename': filename,
                'content_type': 'application/pdf'
            }

        except EXPORT_SERVICE_ERRORS as e:
            self.logger.error(
                "export_user_pdf_failed",
                exc_info=True,
                user_id=user_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {'status': 'error', 'message': str(e)}

    async def export_system_analytics_csv(
        self,
        days: int = 30,
        business_unit_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Export system analytics over the given number of days as a CSV file.
        
        This method:
        1. Fetches analytics records from the analytics service
        2. Batch-fetches user emails, category names, and subcategory names
        3. Writes all records to a CSV file with resolved names
        
        Args:
            days: Number of days to include in the export (default: 30)
            business_unit_ids: Optional business-unit filter to enforce during export
            
        Returns:
            Dict with status, file_path, filename, and content_type on success,
            or status and message on error
        """
        try:
            # 1. Fetch analytics records
            analytics = await self.analytics_service.get_system_analytics(
                days=days,
                business_unit_ids=business_unit_ids,
            )
            records = analytics.get('analytics', {}).get('records', []) if isinstance(analytics, dict) else []
            
            # 2. Collect unique IDs for batch lookups
            user_ids: Set[str] = {r.get('user_id') for r in records if r.get('user_id')}
            category_ids: Set[str] = {r.get('prompt_category_id') for r in records if r.get('prompt_category_id')}
            subcategory_ids: Set[str] = {r.get('prompt_subcategory_id') for r in records if r.get('prompt_subcategory_id')}
            
            # 3. Batch fetch all lookup data concurrently
            users_map, categories_map, subcategories_map = await self._batch_fetch_export_lookups(
                user_ids=user_ids,
                category_ids=category_ids,
                subcategory_ids=subcategory_ids,
            )
            
            # 4. Write CSV file
            return await self._write_system_analytics_csv(
                records=records,
                users_map=users_map,
                categories_map=categories_map,
                subcategories_map=subcategories_map,
            )
            
        except EXPORT_SERVICE_ERRORS as e:
            self.logger.error(
                "export_system_analytics_csv_failed",
                exc_info=True,
                days=days,
                business_unit_ids=business_unit_ids,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {'status': 'error', 'message': str(e)}

    async def _batch_fetch_export_lookups(
        self,
        *,
        user_ids: Set[str],
        category_ids: Set[str],
        subcategory_ids: Set[str],
    ) -> tuple[Dict[str, str], Dict[str, str], Dict[str, Dict[str, Any]]]:
        """Batch fetch all lookup data needed for the export.
        
        Returns:
            Tuple of (users_map, categories_map, subcategories_map)
            - users_map: user_id -> email
            - categories_map: category_id -> category_name  
            - subcategories_map: subcategory_id -> full subcategory document
        """
        users_map: Dict[str, str] = {}
        categories_map: Dict[str, str] = {}
        subcategories_map: Dict[str, Dict[str, Any]] = {}
        
        # Fetch users concurrently
        if user_ids:
            user_tasks = {uid: asyncio.create_task(self.user_repository.get_by_id(uid)) for uid in user_ids}
            for uid, task in user_tasks.items():
                try:
                    user = await task
                    users_map[uid] = user.get('email', '') if user else ''
                except EXPORT_SERVICE_ERRORS as exc:
                    self.logger.warning(
                        "export_lookup_user_fetch_failed",
                        exc_info=True,
                        user_id=uid,
                        error=str(exc),
                    )
                    users_map[uid] = ''
        
        # Fetch categories and subcategories using PromptService if available
        if self.prompt_service:
            # Fetch categories by ID using PromptService's cached method
            if category_ids:
                try:
                    categories_result = await self.prompt_service.get_categories_by_ids(list(category_ids))
                    for cat_id, cat_doc in categories_result.items():
                        categories_map[cat_id] = cat_doc.get('name', '') if cat_doc else ''
                except EXPORT_SERVICE_ERRORS as e:
                    self.logger.warning(
                        "export_lookup_categories_fetch_failed",
                        category_count=len(category_ids),
                        error=str(e),
                        error_type=type(e).__name__,
                    )
            
            # Fetch subcategories - use point reads for each ID (most efficient for known IDs)
            if subcategory_ids:
                subcat_tasks = {
                    sid: asyncio.create_task(self.prompt_service.get_subcategory(sid)) 
                    for sid in subcategory_ids
                }
                for sid, task in subcat_tasks.items():
                    try:
                        subcat_doc = await task
                        if subcat_doc:
                            subcategories_map[sid] = subcat_doc
                            # Also populate category map from subcategory's category_id if not already fetched
                            subcat_cat_id = subcat_doc.get('category_id')
                            if subcat_cat_id and subcat_cat_id not in categories_map:
                                cat_doc = await self.prompt_service.get_category(subcat_cat_id)
                                if cat_doc:
                                    categories_map[subcat_cat_id] = cat_doc.get('name', '')
                    except EXPORT_SERVICE_ERRORS as exc:
                        self.logger.warning(
                            "export_lookup_subcategory_fetch_failed",
                            exc_info=True,
                            subcategory_id=sid,
                            error=str(exc),
                        )
        
        return users_map, categories_map, subcategories_map

    async def export_prompts_csv(self, *, days: int = 30, business_unit_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """Export subcategory usage leaderboard as CSV."""
        try:
            end_time = datetime.now(UTC)
            start_time = end_time - timedelta(days=days)

            allowed_prompt_category_ids: Set[str] = set()
            if business_unit_ids:
                allowed_prompt_category_ids = set(
                    await resolve_prompt_category_ids_for_business_units(
                        self.prompt_repository,
                        business_unit_ids,
                        self.logger,
                    )
                )

            try:
                analytics_items = await self.analytics_repository.list_prompt_usage_records(
                    start_time_iso=start_time.isoformat(),
                    end_time_iso=end_time.isoformat(),
                    prompt_category_ids=(
                        sorted(allowed_prompt_category_ids)
                        if business_unit_ids
                        else None
                    ),
                )
            except EXPORT_SERVICE_ERRORS as exc:
                self.logger.warning(
                    "export_prompts_analytics_fetch_failed",
                    exc_info=True,
                    days=days,
                    error=str(exc),
                )
                analytics_items = []

            # Fetch subcategory names
            try:
                subcat_map = await self.prompt_export_repository.get_subcategory_name_map()
            except EXPORT_SERVICE_ERRORS as exc:
                self.logger.warning(
                    "export_prompts_metadata_fetch_failed",
                    exc_info=True,
                    error=str(exc),
                )
                subcat_map = {}

            usage_counts = {}
            for item in analytics_items:
                sid = item.get("prompt_subcategory_id")
                if sid:
                    usage_counts[sid] = usage_counts.get(sid, 0) + 1

            prompt_list = [
                {"rank": rank, "name": subcat_map.get(subcat_id, subcat_id), "count": count}
                for rank, (subcat_id, count) in enumerate(sorted(usage_counts.items(), key=lambda x: x[1], reverse=True), start=1)
            ]

            csv_content = io.StringIO()
            writer = csv.writer(csv_content, quoting=csv.QUOTE_ALL)
            writer.writerow(["Rank", "Prompt Name", "Total Jobs"])
            for item in prompt_list:
                writer.writerow([item["rank"], item["name"], item["count"]])

            output = csv_content.getvalue()
            csv_content.close()

            # Write to temp file
            temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, newline='', encoding='utf-8')
            temp_file.write(output)
            temp_file.close()

            timestamp = datetime.now(UTC).strftime('%Y%m%d_%H%M%S')
            filename = f'prompts-{timestamp}.csv'
            return {'status': 'success', 'file_path': temp_file.name, 'filename': filename, 'content_type': 'text/csv'}
        except EXPORT_SERVICE_ERRORS as e:
            self.logger.error(
                "export_prompts_csv_failed",
                exc_info=True,
                days=days,
                business_unit_ids=business_unit_ids,
                error=str(e),
                error_type=type(e).__name__,
            )
            return {'status': 'error', 'message': str(e)}

    async def _write_system_analytics_csv(
        self,
        *,
        records: List[Dict[str, Any]],
        users_map: Dict[str, str],
        categories_map: Dict[str, str],
        subcategories_map: Dict[str, Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Write analytics records to a CSV file.
        
        Args:
            records: List of analytics records
            users_map: Mapping of user_id to email
            categories_map: Mapping of category_id to category name
            subcategories_map: Mapping of subcategory_id to full subcategory document
            
        Returns:
            Dict with file metadata on success
        """
        headers = [
            'job_id',
            'user_id', 
            'user_email',
            'timestamp',
            'minutes',
            'file_name',
            'prompt_name',
            'category_name',
        ]
        
        temp_file = tempfile.NamedTemporaryFile(
            mode='w', 
            suffix='.csv', 
            delete=False, 
            newline='', 
            encoding='utf-8'
        )
        writer = csv.writer(temp_file)
        writer.writerow(headers)
        
        for record in records:
            job_id = record.get('job_id') or record.get('id') or ''
            user_id = record.get('user_id') or ''
            user_email = users_map.get(user_id, '')
            timestamp = record.get('timestamp') or ''
            
            # Calculate minutes from available duration fields
            minutes = self._get_duration_minutes(record)
            
            file_name = record.get('file_name') or ''
            
            # Resolve prompt and category names
            prompt_name, category_name = self._resolve_prompt_and_category_names(
                record=record,
                categories_map=categories_map,
                subcategories_map=subcategories_map,
            )
            
            writer.writerow([
                job_id,
                user_id,
                user_email,
                timestamp,
                minutes if minutes is not None else '',
                file_name,
                prompt_name,
                category_name,
            ])
        
        temp_file.close()
        
        timestamp_str = datetime.now(UTC).strftime('%Y%m%d_%H%M%S')
        filename = f'system-analytics-{timestamp_str}.csv'
        
        return {
            'status': 'success',
            'file_path': temp_file.name,
            'filename': filename,
            'content_type': 'text/csv'
        }

    def _get_duration_minutes(self, record: Dict[str, Any]) -> Optional[float]:
        """Extract duration in minutes from a record.
        
        Tries audio_duration_minutes first, then calculates from audio_duration_seconds.
        """
        minutes = record.get('audio_duration_minutes')
        if minutes is not None:
            try:
                return float(minutes)
            except (TypeError, ValueError):
                pass
        
        seconds = record.get('audio_duration_seconds')
        if seconds is not None:
            try:
                return float(seconds) / 60.0
            except (TypeError, ValueError):
                pass
        
        return None

    def _resolve_prompt_and_category_names(
        self,
        *,
        record: Dict[str, Any],
        categories_map: Dict[str, str],
        subcategories_map: Dict[str, Dict[str, Any]],
    ) -> tuple[str, str]:
        """Resolve prompt name and category name from a record.
        
        The prompt_name is the subcategory's name field.
        The category_name comes from the category_id (either from record or subcategory).
        
        Args:
            record: Analytics record with prompt_category_id and prompt_subcategory_id
            categories_map: Mapping of category_id to category name
            subcategories_map: Mapping of subcategory_id to full subcategory document
            
        Returns:
            Tuple of (prompt_name, category_name)
        """
        prompt_name = ''
        category_name = ''
        
        subcat_id = record.get('prompt_subcategory_id')
        cat_id = record.get('prompt_category_id')
        
        # Get subcategory document and extract name
        if subcat_id and subcat_id in subcategories_map:
            subcat_doc = subcategories_map[subcat_id]
            prompt_name = subcat_doc.get('name', '')
            
            # If no category_id in record, try to get it from subcategory
            if not cat_id:
                cat_id = subcat_doc.get('category_id')
        
        # Get category name
        if cat_id and cat_id in categories_map:
            category_name = categories_map[cat_id]
        
        return prompt_name, category_name
