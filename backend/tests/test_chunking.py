from app.rag.chunking import split_text


def test_split_text_respects_chunk_size_bound():
    text = "sentence one. " * 200
    chunks = split_text(text, chunk_size=200, chunk_overlap=40)
    assert all(len(c.text) <= 200 + 40 for c in chunks)  # small slack for boundary joins
    assert len(chunks) > 1


def test_split_text_rejects_bad_overlap():
    import pytest

    with pytest.raises(ValueError):
        split_text("hello", chunk_size=100, chunk_overlap=100)


def test_split_text_empty_input():
    assert split_text("", chunk_size=100, chunk_overlap=10) == []
