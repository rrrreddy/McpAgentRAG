import os

# Ensure Settings() can construct without a real .env during unit tests.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("ANTHROPIC_API_KEY", "")
os.environ.setdefault("MCP_SHARED_SECRET", "test-mcp-secret")
