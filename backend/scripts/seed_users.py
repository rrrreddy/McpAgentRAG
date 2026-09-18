"""Seed demo users spanning every role/entitlement combination exercised
by the golden dataset and the README's walkthrough.

Run inside the backend container: `python -m scripts.seed_users`
"""
from __future__ import annotations

import asyncio

from app.auth.security import hash_password
from app.db.models import User
from app.db.session import SessionLocal
from sqlalchemy import select

DEMO_USERS = [
    {
        "email": "admin@bank.example",
        "password": "AdminPass123!",
        "display_name": "Priya Nandan (Admin)",
        "role": "admin",
        "security_groups": [
            "DATA-POLICY-READ", "CUSTOMER-DATA-READ", "ACCOUNT-DATA-READ", "PII-UNMASK",
            "REGION-ALL", "FINANCE-METRICS-READ", "RISK-METRICS-READ", "HR-METRICS-READ",
        ],
    },
    {
        "email": "steward@bank.example",
        "password": "StewardPass123!",
        "display_name": "Tomas Herrera (Data Steward)",
        "role": "data_steward",
        "security_groups": [
            "DATA-POLICY-READ", "CUSTOMER-DATA-READ", "ACCOUNT-DATA-READ",
            "REGION-NORTHEAST", "REGION-SOUTHEAST", "FINANCE-METRICS-READ", "RISK-METRICS-READ",
        ],
    },
    {
        "email": "analyst.northeast@bank.example",
        "password": "AnalystPass123!",
        "display_name": "Grace Kim (NE Analyst)",
        "role": "analyst",
        "security_groups": ["DATA-POLICY-READ", "CUSTOMER-DATA-READ", "ACCOUNT-DATA-READ", "REGION-NORTHEAST", "FINANCE-METRICS-READ"],
    },
    {
        "email": "analyst.limited@bank.example",
        "password": "AnalystPass123!",
        "display_name": "Samuel Osei (No Entitlements — for testing denials)",
        "role": "analyst",
        "security_groups": [],
    },
]


async def seed() -> None:
    async with SessionLocal() as session:
        for spec in DEMO_USERS:
            existing = await session.execute(select(User).where(User.email == spec["email"]))
            if existing.scalar_one_or_none() is not None:
                print(f"skip (exists): {spec['email']}")
                continue
            session.add(
                User(
                    email=spec["email"],
                    hashed_password=hash_password(spec["password"]),
                    display_name=spec["display_name"],
                    role=spec["role"],
                    security_groups=spec["security_groups"],
                )
            )
            print(f"created: {spec['email']} (role={spec['role']}, groups={spec['security_groups']})")
        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed())
    print("\nDemo credentials (change these — they are public in this repo):")
    for spec in DEMO_USERS:
        print(f"  {spec['email']}  /  {spec['password']}")
