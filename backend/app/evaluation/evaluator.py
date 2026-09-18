"""The AI quality gate (D9): runs the golden dataset through the real
agent graph (same code path as production) and scores routing accuracy,
groundedness (citation presence when required), and — the metric the spec
explicitly warns not to deprioritize — authorization correctness.

Run as: `python -m app.evaluation.evaluator` from the backend container
(needs Postgres/Redis/MCP servers reachable, same as the API itself).
Intended to run in CI against a staging stack before promoting a release;
exits non-zero if the pass rate drops below --min-pass-rate.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path

from app.agents.graph import get_agent_graph
from app.auth.deps import CurrentUser

GOLDEN_DATASET_PATH = Path(__file__).parent / "golden_dataset.json"


@dataclass
class EvalResult:
    id: str
    question: str
    passed: bool
    reasons: list[str]
    actual_route: str
    actual_confidence: float
    had_citations: bool


def _load_dataset() -> list[dict]:
    return json.loads(GOLDEN_DATASET_PATH.read_text())


def _score_case(case: dict, final_state: dict) -> EvalResult:
    reasons: list[str] = []
    actual_route = final_state.get("route", "unknown")
    citations = final_state.get("citations", [])
    confidence = final_state.get("confidence", 0.0)
    answer = final_state.get("answer", "")

    if case["should_be_authorized"] is False:
        # Authorization correctness is checked FIRST and weighted hardest —
        # per D9's WATCH OUT, a fluent leaked answer is worse than an
        # incomplete one, so a wrong "allow" here fails the case outright
        # regardless of anything else.
        denied = actual_route in ("denied",) or not citations or "can't answer" in answer.lower() or "not authorized" in answer.lower()
        if not denied:
            reasons.append("AUTHORIZATION FAILURE: expected denial but got citations/answer as if authorized")
    else:
        if case["expected_route"] not in (actual_route, "clarify") and actual_route != case["expected_route"]:
            reasons.append(f"routing mismatch: expected '{case['expected_route']}', got '{actual_route}'")
        if case.get("requires_citation") and not citations:
            reasons.append("groundedness failure: expected at least one citation, got none")
        if case.get("expected_source_type") and citations:
            source_types = {c.get("source_type") for c in citations}
            if case["expected_source_type"] not in source_types:
                reasons.append(f"citation source_type mismatch: expected '{case['expected_source_type']}', got {source_types}")

    return EvalResult(
        id=case["id"], question=case["question"], passed=not reasons, reasons=reasons,
        actual_route=actual_route, actual_confidence=confidence, had_citations=bool(citations),
    )


async def run_evaluation() -> list[EvalResult]:
    graph = get_agent_graph()
    dataset = _load_dataset()
    results: list[EvalResult] = []

    for case in dataset:
        user = CurrentUser(id="00000000-0000-0000-0000-000000000000", email="eval@internal", role=case["user_role"], security_groups=case["user_security_groups"])
        initial_state = {"question": case["question"], "user": user, "recent_turns": [], "correlation_id": f"eval-{case['id']}"}
        try:
            final_state = await graph.ainvoke(initial_state)
        except Exception as exc:  # noqa: BLE001
            results.append(EvalResult(id=case["id"], question=case["question"], passed=False, reasons=[f"exception: {exc}"], actual_route="error", actual_confidence=0.0, had_citations=False))
            continue
        results.append(_score_case(case, final_state))

    return results


def print_report(results: list[EvalResult]) -> float:
    passed = sum(1 for r in results if r.passed)
    total = len(results)
    pass_rate = passed / total if total else 0.0

    print(f"\n{'ID':<10}{'PASS':<6}{'ROUTE':<12}{'CONF':<6}CASE")
    print("-" * 80)
    for r in results:
        print(f"{r.id:<10}{'PASS' if r.passed else 'FAIL':<6}{r.actual_route:<12}{r.actual_confidence:<6.2f}{r.question[:50]}")
        for reason in r.reasons:
            print(f"           -> {reason}")

    print("-" * 80)
    print(f"Pass rate: {passed}/{total} ({pass_rate:.1%})\n")
    return pass_rate


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the golden-dataset evaluation gate")
    parser.add_argument("--min-pass-rate", type=float, default=0.8)
    args = parser.parse_args()

    results = asyncio.run(run_evaluation())
    pass_rate = print_report(results)
    if pass_rate < args.min_pass_rate:
        print(f"FAILED quality gate: {pass_rate:.1%} < required {args.min_pass_rate:.1%}")
        sys.exit(1)
    print("Quality gate passed.")


if __name__ == "__main__":
    main()
