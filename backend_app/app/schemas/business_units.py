"""Business unit API schemas."""

from datetime import datetime
from typing import Optional, Union

from pydantic import BaseModel, Field, field_validator


class BusinessUnitBase(BaseModel):
    name: str = Field(..., description="Business unit name")
    description: Optional[str] = Field(None, description="Optional business unit description")


class BusinessUnitCreate(BusinessUnitBase):
    pass


class BusinessUnitUpdate(BaseModel):
    name: Optional[str] = Field(None, description="Updated business unit name")
    description: Optional[str] = Field(None, description="Updated description")


class BusinessUnitResponse(BusinessUnitBase):
    id: str = Field(..., description="Business unit ID")
    is_business_unit: bool = Field(True, description="Always true for business units")
    parent_category_id: Optional[str] = Field(None, description="Always None for top-level business units")
    created_at: int = Field(..., description="Creation timestamp in epoch milliseconds")
    updated_at: int = Field(..., description="Last update timestamp in epoch milliseconds")

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def coerce_timestamps(cls, value: Union[int, str]) -> int:
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            try:
                return int(float(value))
            except ValueError:
                return int(datetime.fromisoformat(value).timestamp() * 1000)
        raise ValueError("Invalid timestamp type")


class BusinessUnitListResponse(BaseModel):
    business_units: list[BusinessUnitResponse] = Field(..., description="Business units for this page")
    total: int = Field(..., description="Total number of business units")
    limit: int = Field(..., description="Page size limit")
    offset: int = Field(..., description="Number of items skipped")
    has_more: bool = Field(..., description="Whether more pages exist")


class UserBusinessUnitAssignment(BaseModel):
    user_id: str = Field(..., description="User ID to assign")
    business_unit_ids: Optional[list[str]] = Field(None, description="Business unit IDs to assign")


class UserBusinessUnitAssignmentResponse(BaseModel):
    user_id: str = Field(..., description="User ID")
    business_unit_ids: list[str] = Field(default_factory=list, description="Assigned business unit IDs")
    business_unit_names: list[str] = Field(default_factory=list, description="Assigned business unit names")
    success: bool = Field(..., description="Whether assignment was successful")
    message: str = Field(..., description="Success or error message")


class BusinessUnitStats(BaseModel):
    business_unit_id: str = Field(..., description="Business unit ID")
    business_unit_name: str = Field(..., description="Business unit name")
    total_users: int = Field(0, description="Total users assigned to this business unit")
    total_editors: int = Field(0, description="Number of editors assigned to this business unit")
    total_categories: int = Field(0, description="Number of categories under this business unit")
    total_subcategories: int = Field(0, description="Number of subcategories under this business unit")
    total_prompts: int = Field(0, description="Number of prompts under this business unit")


class BulkUserUpdate(BaseModel):
    user_ids: list[str] = Field(..., description="User IDs to update")
    permission: Optional[str] = Field(None, description="New permission level")
    business_unit_ids: Optional[list[str]] = Field(None, description="Business unit IDs to assign")
    add_business_units: Optional[list[str]] = Field(None, description="Business unit IDs to add")
    remove_business_units: Optional[list[str]] = Field(None, description="Business unit IDs to remove")


class BulkUserUpdateResponse(BaseModel):
    success_count: int = Field(..., description="Number of users successfully updated")
    failed_count: int = Field(..., description="Number of users that failed to update")
    updated_user_ids: list[str] = Field(..., description="Successfully updated user IDs")
    failed_updates: list[dict[str, str]] = Field(default_factory=list, description="Failed updates")
    message: str = Field(..., description="Summary message")
