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
    for i in range(5):
        r = client.post(f"/api/participants/{pid}/messages", json={"content": f"msg {i}"})
        assert r.status_code == 200
        assert "another angle" in r.text

    # Transcript persisted: 5 student + 5 ai
    msgs = client.get(f"/api/participants/{pid}/messages").json()
    assert len(msgs) == 10
    assert [m["role"] for m in msgs] == ["student", "ai"] * 5

    # Post-rating completes the study (no on-screen debrief; facilitator debriefs live)
    r = client.post(
        f"/api/participants/{pid}/rating?phase=post",
        json={"score": 4, "rationale": "Changed my mind.", "change_report": "Yes, a lot."},
    )
    assert r.status_code == 200, r.text
    assert r.json()["phase"] == "done"

    # No student-facing debrief endpoint exists (would leak the condition)
    assert client.get(f"/api/participants/{pid}/debrief").status_code == 404

    # Results + export reflect the participant
    results = client.get("/api/admin/results", headers=ADMIN).json()
    assert results["total_participants"] == 1
    assert results["completed"] == 1

    csv_text = client.get("/api/admin/export.csv", headers=ADMIN).text
    assert "participant_id" in csv_text
    dump = client.get("/api/admin/export.json", headers=ADMIN).json()
    p0 = dump["participants"][0]
    assert p0["resolved_system_prompt"]
    assert len(p0["transcript"]) == 10
    # Condition + shift are available to the facilitator via export
    assert p0["condition"] in ("pro", "anti", "control")
    assert p0["pre_score"] == 8 and p0["post_score"] == 4 and p0["shift"] == -4

    # Opinion-graph points endpoint returns this completed participant
    points = client.get("/api/admin/points", headers=ADMIN).json()
    assert len(points) == 1
    assert points[0]["pre"] == 8 and points[0]["post"] == 4
    assert points[0]["condition"] in ("pro", "anti", "control")
    assert points[0]["run_number"] == 1


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
    # pre_rationale is exposed so the client can seed it as the first chat message.
    assert state["pre_rationale"] == "Disagree."
