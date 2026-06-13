"""End-to-end student flow against the API with the model stubbed."""
from __future__ import annotations

ADMIN = {"X-Admin-Password": "change-me"}


def _create_run(client):
    r = client.post("/api/admin/runs", json={"run_number": 1}, headers=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["join_code"]


def test_admin_requires_password(client):
    assert client.post("/api/admin/runs", json={"run_number": 1}).status_code == 401


def test_full_flow(client):
    join_code = _create_run(client)

    # Join
    r = client.post("/api/join", json={"join_code": join_code})
    assert r.status_code == 200, r.text
    state = r.json()
    pid = state["participant_id"]
    assert state["phase"] == "joined"
    assert state["scenario"]["title"]

    # Consent -> scenario
    r = client.post(f"/api/participants/{pid}/consent")
    assert r.json()["phase"] == "scenario"

    # Pre-rating triggers assignment (condition is NOT exposed to the student)
    r = client.post(
        f"/api/participants/{pid}/rating?phase=pre",
        json={"score": 8, "rationale": "The team respected the family."},
    )
    assert r.status_code == 200, r.text
    assert r.json()["phase"] == "chatting"
    assert "condition" not in r.json()

    # Cannot finish before the minimum number of messages
    early = client.post(
        f"/api/participants/{pid}/rating?phase=post",
        json={"score": 5, "rationale": "x", "change_report": "maybe"},
    )
    assert early.status_code == 409

    # Send the minimum messages (model stubbed)
    for i in range(3):
        r = client.post(f"/api/participants/{pid}/messages", json={"content": f"msg {i}"})
        assert r.status_code == 200
        assert "another angle" in r.text

    # Transcript persisted: 3 student + 3 ai
    msgs = client.get(f"/api/participants/{pid}/messages").json()
    assert len(msgs) == 6
    assert [m["role"] for m in msgs] == ["student", "ai"] * 3

    # Post-rating
    r = client.post(
        f"/api/participants/{pid}/rating?phase=post",
        json={"score": 4, "rationale": "Changed my mind.", "change_report": "Yes, a lot."},
    )
    assert r.status_code == 200, r.text
    assert r.json()["phase"] == "post"

    # Debrief reveals condition + shift
    d = client.get(f"/api/participants/{pid}/debrief").json()
    assert d["pre_score"] == 8 and d["post_score"] == 4 and d["shift"] == -4
    assert d["condition"] in ("pro", "anti", "control")

    # Results + export reflect the participant
    results = client.get("/api/admin/results", headers=ADMIN).json()
    assert results["total_participants"] == 1
    assert results["completed"] == 1

    csv_text = client.get("/api/admin/export.csv", headers=ADMIN).text
    assert "participant_id" in csv_text
    dump = client.get("/api/admin/export.json", headers=ADMIN).json()
    assert dump["participants"][0]["resolved_system_prompt"]
    assert len(dump["participants"][0]["transcript"]) == 6


def test_resume_returns_current_state(client):
    join_code = _create_run(client)
    pid = client.post("/api/join", json={"join_code": join_code}).json()["participant_id"]
    client.post(f"/api/participants/{pid}/consent")
    client.post(
        f"/api/participants/{pid}/rating?phase=pre",
        json={"score": 3, "rationale": "Disagree."},
    )
    # A fresh GET (simulating a refresh) reflects the chatting phase + pre score.
    state = client.get(f"/api/participants/{pid}").json()
    assert state["phase"] == "chatting"
    assert state["pre_score"] == 3
