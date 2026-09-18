"""Parse the sample PowerCenter XML exports and persist their decoded
lineage into the queryable store lineage-mcp reads from (D7.2/D7.3).

Run inside the backend container: `python -m scripts.parse_informatica_samples`
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from app.db.session import SessionLocal
from app.informatica.lineage_graph import persist_mapping_lineage, persist_workflow
from app.informatica.parser import parse_mapping_file, parse_workflow_file
from app.paths import sample_data_dir

EXPORTS_DIR = sample_data_dir() / "informatica_exports"

MAPPING_FILES = ["M_LOAD_ACCOUNTS_mapping.xml", "M_LOAD_CUSTOMERS_mapping.xml"]
WORKFLOW_FILES = ["WF_LOAD_ACCOUNTS_workflow.xml"]


async def main() -> None:
    async with SessionLocal() as session:
        for filename in MAPPING_FILES:
            path = EXPORTS_DIR / filename
            mapping = parse_mapping_file(str(path))
            await persist_mapping_lineage(session, mapping)
            print(f"persisted lineage for mapping '{mapping.name}': "
                  f"{len(mapping.transformations)} transformations, {len(mapping.connectors)} connectors")

        for filename in WORKFLOW_FILES:
            path = EXPORTS_DIR / filename
            workflow = parse_workflow_file(str(path))
            await persist_workflow(session, workflow)
            print(f"persisted workflow '{workflow.name}': sessions={[s.session_name for s in workflow.sessions]}, "
                  f"execution_order={workflow.execution_order}")


if __name__ == "__main__":
    asyncio.run(main())
