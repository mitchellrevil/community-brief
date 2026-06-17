from pydantic import BaseModel

from ..models.permissions import PermissionLevel


class UserPermissionUpdateRequest(BaseModel):
    permission: PermissionLevel
