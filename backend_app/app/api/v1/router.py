from fastapi import APIRouter

from .routes.admin_announcements import router as admin_announcements_router
from .routes.admin_jobs import router as admin_jobs_router
from .routes.analytics import router as analytics_router
from .routes.announcements import router as announcements_router
from .routes.auth import router as auth_router
from .routes.business_units import router as business_units_router
from .routes.job_analysis import router as job_analysis_router
from .routes.job_sharing import router as job_sharing_router
from .routes.jobs import router as jobs_router
from .routes.permissions import router as permissions_router
from .routes.prompts import router as prompts_router
from .routes.streaming import router as streaming_router
from .routes.uploads import router as uploads_router
from .routes.users import router as users_router


router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(permissions_router)
router.include_router(users_router)
router.include_router(prompts_router)
router.include_router(business_units_router)
router.include_router(job_sharing_router)
router.include_router(jobs_router)
router.include_router(job_analysis_router)
router.include_router(uploads_router)
router.include_router(streaming_router)
router.include_router(analytics_router)
router.include_router(announcements_router)
router.include_router(admin_jobs_router)
router.include_router(admin_announcements_router)
