"""
Audit Configuration - Central definition of audit endpoints and rules

This module defines which endpoints should be audited and their corresponding event types.
Having this in one place eliminates duplicate code and ensures consistency.
"""

from typing import Dict, Set

# Endpoints that should create audit logs (ONLY security-critical actions)
# Format: (path, method) -> event_type or path -> event_type for all methods
AUDIT_ENDPOINTS: Dict[str, str] = {
    # Authentication events
    '/api/v1/auth/login': 'user_login',
    '/api/v1/auth/logout': 'user_logout',
    
    # Password changes
    '/api/v1/auth/change-password': 'password_change',
    '/api/v1/auth/users/*/password': 'password_change',
    
    # Permission and  changes (CRITICAL)
    '/api/v1/auth/users/*/permission': 'permission_change',
    '/api/v1/auth/permissions/grant': 'permission_grant',
    '/api/v1/auth/permissions/revoke': 'permission_revoke',
    
    # User management (creating/deleting users) - distinguish by method
    '/api/v1/auth/register': 'user_registered',
    '/api/v1/auth/users/*/delete': 'user_deleted',
    
    # Job sharing (security-relevant as it affects access control)
    '/api/v1/jobs/*/share': 'job_shared',
    '/api/v1/jobs/*/unshare': 'job_unshared',
    
    # System administration (high-privilege actions)
    '/api/v1/admin/*': 'admin_action',
    '/api/v1/system/*': 'system_action',
}

# Method-specific audit endpoints: (path, method) -> event_type
METHOD_SPECIFIC_AUDIT_ENDPOINTS = {
    ('/api/v1/auth/users', 'POST'): 'user_created',  # Only POST to create user should be audited
    ('/api/v1/auth/users/*', 'DELETE'): 'user_deleted',  # DELETE to delete specific user
}

# Endpoints that are sensitive and need detailed logging
SENSITIVE_ENDPOINTS: Set[str] = {
    '/api/v1/auth/permissions',
    '/api/v1/admin'
}

# Session configuration
DEFAULT_SESSION_TIMEOUT_MINUTES = 15
DEFAULT_HEARTBEAT_INTERVAL_MINUTES = 5
