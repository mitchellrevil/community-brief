# backend_app/tests/common
# Shared testing utilities, fakes, factories, and emulator fixtures.
#
# This package provides:
# - fakes.py: In-memory fakes for CosmosDB and Blob Storage
# - factories.py: Test data factories for jobs, users, prompts
# - emulators.py: Docker-based emulator fixtures (Azurite, Cosmos Emulator)

from .fakes import InMemoryCosmosFake, InMemoryBlobFake
from .factories import (
    job_factory,
    user_factory,
    prompt_factory,
    create_test_user,
    create_test_job,
)

__all__ = [
    "InMemoryCosmosFake",
    "InMemoryBlobFake",
    "job_factory",
    "user_factory",
    "prompt_factory",
    "create_test_user",
    "create_test_job",
]
