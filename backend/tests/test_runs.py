"""Run management: server-side auto-numbering, participant_count, deletion."""
from __future__ import annotations

ADMIN = {"X-Admin-Password": "change-me"}


def _create(client, **body):
    r = client.post("/api/admin/runs", json=body, headers=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()


def test_auto_numbering_assigns_next_number(client):
    # No run_number supplied -> server assigns max+1, starting at 1.
    assert _create(client)["run_number"] == 1
    assert _create(client)["run_number"] == 2
    # An explicit number is honored...
    assert _create(client, run_number=5)["run_number"] == 5
    # ...and the next auto number is max+1 over everything that exists.
    assert _create(client)["run_number"] == 6


def test_new_run_has_zero_participant_count(client):
    run = _create(client)
    assert run["participant_count"] == 0


def test_list_runs_reports_participant_count(client):
    run = _create(client)
    client.post("/api/join", json={"join_code": run["join_code"]})
    runs = client.get("/api/admin/runs", headers=ADMIN).json()
    mine = next(r for r in runs if r["id"] == run["id"])
    assert mine["participant_count"] == 1


def test_delete_missing_run_is_404(client):
    assert client.delete("/api/admin/runs/nope", headers=ADMIN).status_code == 404


def test_delete_requires_password(client):
    run = _create(client)
    assert client.delete(f"/api/admin/runs/{run['id']}").status_code == 401


def test_delete_run_cascades_all_data(client):
    run = _create(client)
    pid = client.post("/api/join", json={"join_code": run["join_code"]}).json()[
        "participant_id"
    ]
    client.post(f"/api/participants/{pid}/consent")
    client.post(
        f"/api/participants/{pid}/rating?phase=pre",
        json={"score": 7, "rationale": "Lean toward disclosure."},
    )
    client.post(f"/api/participants/{pid}/messages", json={"content": "hello"})

    # Sanity: the participant's data is present before deletion.
    assert client.get("/api/admin/results", headers=ADMIN).json()["total_participants"] == 1

    # Delete -> 204, run gone, and all participant data is gone with it.
    assert client.delete(f"/api/admin/runs/{run['id']}", headers=ADMIN).status_code == 204
    assert all(r["id"] != run["id"] for r in client.get("/api/admin/runs", headers=ADMIN).json())
    assert client.get("/api/admin/results", headers=ADMIN).json()["total_participants"] == 0
    assert client.get("/api/admin/points", headers=ADMIN).json() == []
    # The orphaned participant is unreachable too.
    assert client.get(f"/api/participants/{pid}").status_code == 404
