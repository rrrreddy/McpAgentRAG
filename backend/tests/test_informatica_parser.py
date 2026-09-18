from app.informatica.lineage_graph import build_networkx_graph, trace_upstream
from app.informatica.parser import parse_mapping_file, parse_workflow_file
from app.paths import sample_data_dir

SAMPLES_DIR = sample_data_dir() / "informatica_exports"


def test_parse_mapping_extracts_transformations_and_connectors():
    mapping = parse_mapping_file(str(SAMPLES_DIR / "M_LOAD_ACCOUNTS_mapping.xml"))

    assert mapping.name == "M_LOAD_ACCOUNTS"
    assert set(mapping.transformations) == {"SQ_ACCOUNTS_SRC", "EXP_CALC_BALANCE", "ACCOUNTS_TGT"}
    assert len(mapping.connectors) == 8

    exp = mapping.transformations["EXP_CALC_BALANCE"]
    balance_port = next(p for p in exp.ports if p.name == "OUT_BALANCE")
    assert balance_port.expression == "ROUND(IN_RAW_BALANCE, 2)"


def test_lineage_graph_traces_target_field_to_source():
    mapping = parse_mapping_file(str(SAMPLES_DIR / "M_LOAD_ACCOUNTS_mapping.xml"))
    graph = build_networkx_graph(mapping)

    paths = trace_upstream(graph, "ACCOUNTS_TGT.account_balance")
    assert len(paths) == 1
    path = paths[0]
    assert path[0] == "SQ_ACCOUNTS_SRC.RAW_BALANCE"
    assert path[-1] == "ACCOUNTS_TGT.account_balance"
    assert "EXP_CALC_BALANCE.IN_RAW_BALANCE" in path
    assert "EXP_CALC_BALANCE.OUT_BALANCE" in path


def test_lineage_graph_classifies_node_types():
    mapping = parse_mapping_file(str(SAMPLES_DIR / "M_LOAD_ACCOUNTS_mapping.xml"))
    graph = build_networkx_graph(mapping)

    assert graph.in_degree("SQ_ACCOUNTS_SRC.RAW_BALANCE") == 0  # source (root)
    assert graph.out_degree("ACCOUNTS_TGT.account_balance") == 0  # target (leaf)


def test_parse_workflow_extracts_session_order_and_load_type():
    workflow = parse_workflow_file(str(SAMPLES_DIR / "WF_LOAD_ACCOUNTS_workflow.xml"))

    assert workflow.name == "WF_LOAD_ACCOUNTS"
    assert workflow.execution_order == ["S_M_LOAD_CUSTOMERS", "S_M_LOAD_ACCOUNTS"]

    accounts_session = next(s for s in workflow.sessions if s.session_name == "S_M_LOAD_ACCOUNTS")
    assert accounts_session.mapping_name == "M_LOAD_ACCOUNTS"
    assert accounts_session.load_type == "INCREMENTAL"
