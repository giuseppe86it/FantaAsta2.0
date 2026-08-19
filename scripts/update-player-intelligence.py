#!/usr/bin/env python3
"""FantaAsta2.0 alpha 3.1 — genera player-intelligence.json da API-Football.

Nessuno scraping e nessun CAPTCHA: il job interroga l'API ufficiale API-SPORTS
(API-Football v3) usando la chiave salvata come GitHub Actions Secret.

Per restare comodi anche nel piano gratuito (100 richieste/giorno), il job
scarica di default le ultime due stagioni complete di Serie A. L'endpoint
/players restituisce 20 giocatori per pagina e il job segue automaticamente
la paginazione.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "player-intelligence.json"
SCHEMA = 1
API_BASE = "https://v3.football.api-sports.io"
API_KEY = os.environ.get("APISPORTS_KEY", "").strip()
LEAGUE_ID = int(os.environ.get("FA2_PI_LEAGUE_ID", "135"))  # Serie A Italia
MIN_VALID_PLAYERS = int(os.environ.get("FA2_PI_MIN_PLAYERS", "120"))
# Al 19/08/2026: 2025/26 e 2024/25 sono le due stagioni complete più recenti.
SEASONS = [int(x.strip()) for x in os.environ.get("FA2_PI_SEASONS", "2025,2024").split(",") if x.strip()]
SEASON_WEIGHTS = {season: max(0.42, 1.0 - i * 0.28) for i, season in enumerate(SEASONS)}
MAX_REQUESTS = int(os.environ.get("FA2_PI_MAX_REQUESTS", "90"))
REQUEST_DELAY = float(os.environ.get("FA2_PI_REQUEST_DELAY", "6.2"))
REQUEST_COUNT = 0


def norm_text(value: Any) -> str:
    s = unicodedata.normalize("NFD", str(value or ""))
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")


def normalize_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", norm_text(value).lower())


def token_key(value: Any) -> str:
    tokens = re.sub(r"[^a-z0-9]+", " ", norm_text(value).lower()).split()
    return "|".join(sorted(tokens))


def num(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace("%", "").replace(",", ".").strip())
    except Exception:
        return None


def safe_div(a: float | None, b: float | None, scale: float = 1.0) -> float | None:
    if a is None or b in (None, 0):
        return None
    return a / b * scale


def round_or_none(v: float | None, digits: int = 3) -> float | None:
    return None if v is None or not math.isfinite(v) else round(v, digits)


def season_label(start: int) -> str:
    return f"{start}/{str(start + 1)[-2:]}"


def api_get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    global REQUEST_COUNT
    if not API_KEY:
        raise RuntimeError("Secret APISPORTS_KEY mancante")
    if REQUEST_COUNT >= MAX_REQUESTS:
        raise RuntimeError(f"Limite di sicurezza raggiunto ({MAX_REQUESTS} richieste)")
    query = urllib.parse.urlencode(params)
    url = f"{API_BASE}{path}?{query}"
    req = urllib.request.Request(url, headers={
        "x-apisports-key": API_KEY,
        "Accept": "application/json",
        "User-Agent": "FantaAsta2.0/alpha3.1",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:1200]
        raise RuntimeError(f"API HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Errore rete API: {exc}") from exc
    REQUEST_COUNT += 1
    errors = payload.get("errors")
    if errors and errors != [] and errors != {}:
        raise RuntimeError(f"API-Football: {errors}")
    if REQUEST_DELAY:
        time.sleep(REQUEST_DELAY)
    return payload


def coverage_check(season: int) -> dict[str, Any]:
    data = api_get("/leagues", {"id": LEAGUE_ID, "season": season})
    rows = data.get("response") or []
    if not rows:
        return {"available": False, "coverage": {}}
    coverage = ((rows[0].get("seasons") or [{}])[-1].get("coverage") or {})
    return {"available": True, "coverage": coverage}


def fetch_season(season: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    first = api_get("/players", {"league": LEAGUE_ID, "season": season, "page": 1})
    paging = first.get("paging") or {}
    total_pages = int(paging.get("total") or 1)
    rows = list(first.get("response") or [])
    for page in range(2, total_pages + 1):
        data = api_get("/players", {"league": LEAGUE_ID, "season": season, "page": page})
        rows.extend(data.get("response") or [])
    return rows, {"rows": len(rows), "pages": total_pages}


def pick_league_stats(item: dict[str, Any]) -> dict[str, Any]:
    stats = item.get("statistics") or []
    for st in stats:
        if int(((st.get("league") or {}).get("id") or 0)) == LEAGUE_ID:
            return st
    return stats[0] if stats else {}


def position_group(pos: str) -> str:
    p = str(pos or "").lower()
    if "goal" in p or p in {"g", "gk"}:
        return "GK"
    if "def" in p:
        return "DIF"
    if "mid" in p:
        return "CEN"
    if "att" in p or "forward" in p:
        return "ATT"
    return "MOV"


def extract_stats(item: dict[str, Any], season: int) -> dict[str, Any] | None:
    player = item.get("player") or {}
    st = pick_league_stats(item)
    games = st.get("games") or {}
    shots = st.get("shots") or {}
    goals = st.get("goals") or {}
    passes = st.get("passes") or {}
    tackles = st.get("tackles") or {}
    duels = st.get("duels") or {}
    dribbles = st.get("dribbles") or {}
    fouls = st.get("fouls") or {}
    cards = st.get("cards") or {}
    penalty = st.get("penalty") or {}
    team = st.get("team") or {}
    name = str(player.get("name") or "").strip()
    if not name:
        return None
    minutes = num(games.get("minutes")) or 0.0
    n90 = minutes / 90 if minutes else 0.0
    apps = num(games.get("appearences"))
    starts = num(games.get("lineups"))
    rating = num(games.get("rating"))
    goals_total = num(goals.get("total")) or 0.0
    assists = num(goals.get("assists")) or 0.0
    shots_total = num(shots.get("total"))
    shots_on = num(shots.get("on"))
    key_passes = num(passes.get("key"))
    passes_total = num(passes.get("total"))
    pass_accuracy = num(passes.get("accuracy"))
    tackles_total = num(tackles.get("total"))
    interceptions = num(tackles.get("interceptions"))
    duels_total = num(duels.get("total"))
    duels_won = num(duels.get("won"))
    dribbles_success = num(dribbles.get("success"))
    fouls_committed = num(fouls.get("committed"))
    yellows = num(cards.get("yellow")) or 0.0
    yellow_red = num(cards.get("yellowred")) or 0.0
    reds = num(cards.get("red")) or 0.0
    pen_scored = num(penalty.get("scored")) or 0.0
    pen_missed = num(penalty.get("missed")) or 0.0
    pen_saved = num(penalty.get("saved")) or 0.0
    saves = num(goals.get("saves"))
    conceded = num(goals.get("conceded"))
    save_pct = None
    if saves is not None and conceded is not None and saves + conceded > 0:
        save_pct = saves / (saves + conceded) * 100
    birth = player.get("birth") or {}
    firstname = str(player.get("firstname") or "").strip()
    lastname = str(player.get("lastname") or "").strip()
    aliases = [x for x in {
        name,
        f"{firstname} {lastname}".strip(),
        f"{lastname} {firstname}".strip(),
        lastname,
    } if x]
    return {
        "apiId": player.get("id"),
        "name": name,
        "aliases": sorted(aliases),
        "team": team.get("name") or "",
        "teamId": team.get("id"),
        "position": games.get("position") or "",
        "positionGroup": position_group(games.get("position") or ""),
        "season": season,
        "seasonLabel": season_label(season),
        "age": player.get("age"),
        "birthDate": birth.get("date"),
        "nationality": player.get("nationality"),
        "injured": bool(player.get("injured")),
        "photo": player.get("photo"),
        "minutes": round_or_none(minutes, 0),
        "apps": apps,
        "starts": starts,
        "rating": rating,
        "goals": goals_total,
        "assists": assists,
        "xg": None,
        "xa": None,
        "ga90": round_or_none(safe_div(goals_total + assists, n90), 3) if n90 else None,
        "npxgXa90": None,
        "shots90": round_or_none(safe_div(shots_total, n90), 3) if n90 else None,
        "shotsOn90": round_or_none(safe_div(shots_on, n90), 3) if n90 else None,
        "keyPasses90": round_or_none(safe_div(key_passes, n90), 3) if n90 else None,
        "passes90": round_or_none(safe_div(passes_total, n90), 3) if n90 else None,
        "passAccuracy": pass_accuracy,
        "tacklesInterceptions90": round_or_none(safe_div((tackles_total or 0) + (interceptions or 0), n90), 3) if n90 and (tackles_total is not None or interceptions is not None) else None,
        "duelsWonPct": round_or_none(safe_div(duels_won, duels_total, 100), 2),
        "dribbles90": round_or_none(safe_div(dribbles_success, n90), 3) if n90 else None,
        "foulsCommitted90": round_or_none(safe_div(fouls_committed, n90), 3) if n90 else None,
        "cards90": round_or_none(safe_div(yellows + 1.5 * yellow_red + 2 * reds, n90), 3) if n90 else None,
        "penaltiesScored": pen_scored,
        "penaltiesMissed": pen_missed,
        "penaltiesSaved": pen_saved,
        "saves90": round_or_none(safe_div(saves, n90), 3) if n90 else None,
        "savePct": round_or_none(save_pct, 1),
        "cleanSheetPct": None,
    }


def percentile(values: list[float], value: float | None, inverse: bool = False) -> float | None:
    if value is None:
        return None
    clean = sorted(v for v in values if v is not None and math.isfinite(v))
    if len(clean) < 4:
        return 50.0
    below = sum(1 for v in clean if v < value)
    equal = sum(1 for v in clean if v == value)
    pct = (below + 0.5 * equal) / len(clean) * 100
    return 100 - pct if inverse else pct


def season_score(stats: dict[str, Any], peers: list[dict[str, Any]]) -> float:
    def pct(field: str, inv: bool = False) -> float | None:
        vals = [num(x.get(field)) for x in peers]
        return percentile([v for v in vals if v is not None], num(stats.get(field)), inv)
    minutes = num(stats.get("minutes")) or 0
    reliability = min(100.0, math.sqrt(minutes / 2600) * 100) if minutes > 0 else 0
    group = stats.get("positionGroup") or "MOV"
    rating_pct = pct("rating")
    if group == "GK":
        metrics = [(rating_pct, .30), (pct("savePct"), .28), (pct("saves90"), .16), (pct("penaltiesSaved"), .08), (reliability, .18)]
    elif group == "DIF":
        metrics = [(rating_pct, .24), (pct("tacklesInterceptions90"), .22), (pct("duelsWonPct"), .13), (pct("keyPasses90"), .07), (pct("cards90", True), .08), (pct("ga90"), .05), (reliability, .21)]
    elif group == "CEN":
        metrics = [(rating_pct, .24), (pct("ga90"), .17), (pct("keyPasses90"), .15), (pct("tacklesInterceptions90"), .12), (pct("duelsWonPct"), .08), (pct("passAccuracy"), .05), (pct("cards90", True), .05), (reliability, .14)]
    else:
        metrics = [(rating_pct, .24), (pct("ga90"), .24), (pct("shots90"), .10), (pct("shotsOn90"), .10), (pct("keyPasses90"), .08), (pct("dribbles90"), .06), (pct("penaltiesScored"), .04), (pct("cards90", True), .02), (reliability, .12)]
    present = [(v, w) for v, w in metrics if v is not None]
    if not present:
        return round(reliability, 1)
    sw = sum(w for _, w in present)
    return round(sum(v * w for v, w in present) / sw, 1)


def weighted_metric(seasons: list[dict[str, Any]], field: str) -> float | None:
    vals: list[tuple[float, float]] = []
    for s in seasons:
        v = num(s.get(field))
        if v is None:
            continue
        rec = SEASON_WEIGHTS.get(int(s["season"]), .45)
        min_factor = min(1.0, max(.25, (num(s.get("minutes")) or 0) / 1800))
        vals.append((v, rec * min_factor))
    if not vals:
        return None
    sw = sum(w for _, w in vals)
    return round(sum(v * w for v, w in vals) / sw, 4) if sw else None


def build_payload(rows_by_season: dict[int, list[dict[str, Any]]], source_status: dict[str, Any]) -> dict[str, Any]:
    season_stats_all: dict[int, list[dict[str, Any]]] = {}
    for season, rows in rows_by_season.items():
        extracted = []
        for row in rows:
            stats = extract_stats(row, season)
            if stats:
                extracted.append(stats)
        season_stats_all[season] = extracted

    player_seasons: dict[str, list[dict[str, Any]]] = defaultdict(list)
    identities: dict[str, dict[str, Any]] = {}
    for season, season_stats in season_stats_all.items():
        pools: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for x in season_stats:
            pools[x["positionGroup"]].append(x)
            if x["positionGroup"] != "GK":
                pools["MOV"].append(x)
        for x in season_stats:
            peers = pools.get(x["positionGroup"]) or pools.get("MOV") or season_stats
            x["score"] = season_score(x, peers)
            key = normalize_name(x["name"])
            if not key:
                continue
            player_seasons[key].append(x)
            identities[key] = {
                "apiId": x.get("apiId"), "name": x["name"], "aliases": x.get("aliases") or [x["name"]],
                "team": x.get("team", ""), "positionGroup": x.get("positionGroup", "MOV"),
            }

    weighted_fields = [
        "minutes", "starts", "rating", "goals", "assists", "ga90", "shots90", "shotsOn90",
        "keyPasses90", "passes90", "passAccuracy", "tacklesInterceptions90", "duelsWonPct",
        "dribbles90", "foulsCommitted90", "cards90", "penaltiesScored", "penaltiesMissed",
        "penaltiesSaved", "saves90", "savePct"
    ]
    players: dict[str, Any] = {}
    for key, seasons in player_seasons.items():
        seasons.sort(key=lambda x: int(x["season"]), reverse=True)
        latest = dict(seasons[0])
        weighted = {field: weighted_metric(seasons, field) for field in weighted_fields}
        weighted.update({"xg": None, "xa": None, "npxgXa90": None})
        score_vals = []
        for s in seasons:
            w = SEASON_WEIGHTS.get(int(s["season"]), .45) * min(1.0, max(.30, (num(s.get("minutes")) or 0) / 1800))
            score_vals.append((num(s.get("score")) or 0, w))
        sw = sum(w for _, w in score_vals)
        score = sum(v * w for v, w in score_vals) / sw if sw else 0
        historic_minutes = sum((num(s.get("minutes")) or 0) * SEASON_WEIGHTS.get(int(s["season"]), .45) for s in seasons)
        reliability = min(100.0, 30 + math.sqrt(max(0, historic_minutes) / 4300) * 70)
        trend = 0.0
        if len(seasons) >= 2:
            trend = (num(seasons[0].get("score")) or 0) - (num(seasons[1].get("score")) or 0)
        ident = identities[key]
        aliases = sorted(set(ident.get("aliases") or [ident["name"]]))
        players[key] = {
            "key": key,
            "apiId": ident.get("apiId"),
            "tokenKey": token_key(ident["name"]),
            "aliases": aliases,
            "aliasTokenKeys": sorted(set(token_key(a) for a in aliases if a)),
            "name": ident["name"],
            "team": ident["team"],
            "positionGroup": ident["positionGroup"],
            "score": round(score, 1),
            "reliability": round(reliability, 1),
            "trend": round(trend, 1),
            "latest": latest,
            "weighted": weighted,
            "seasons": seasons[:3],
            "sources": ["API-Football"],
        }

    return {
        "schema": SCHEMA,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourceName": "API-Football / API-Sports",
        "players": players,
        "meta": {
            "players": len(players),
            "requestsUsed": REQUEST_COUNT,
            "leagueId": LEAGUE_ID,
            "seasonsAttempted": [season_label(x) for x in SEASONS],
            "seasonsLoaded": [season_label(x) for x in sorted(rows_by_season, reverse=True)],
            "sources": {
                "apiFootball": "active",
                "fantacalcio": "live-lineups-existing-feed",
                "fbref": "disabled-captcha",
                "sportmonks": "optional-future",
                "sofascore": "planned",
            },
            "sourceStatus": source_status,
        },
    }


def read_previous() -> dict[str, Any] | None:
    try:
        return json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else None
    except Exception:
        return None


def main() -> int:
    if not API_KEY:
        print("ERRORE: manca il GitHub Actions Secret APISPORTS_KEY.", file=sys.stderr)
        print("Crea un account gratuito API-Football e salva la chiave in Settings > Secrets and variables > Actions.", file=sys.stderr)
        return 2
    rows_by_season: dict[int, list[dict[str, Any]]] = {}
    status: dict[str, Any] = {}
    for season in SEASONS:
        label = season_label(season)
        try:
            cov = coverage_check(season)
            rows, details = fetch_season(season)
            details["coverage"] = cov.get("coverage", {})
            status[label] = details
            if rows:
                rows_by_season[season] = rows
            print(f"[{label}] {len(rows)} righe in {details['pages']} pagine")
        except Exception as exc:
            status[label] = {"error": str(exc)}
            print(f"[{label}] FALLITA: {exc}", file=sys.stderr)
            # Se una stagione fallisce per quota/API, non bruciare altre chiamate inutilmente.
            if "Limite" in str(exc) or "rate" in str(exc).lower() or "429" in str(exc):
                break

    payload = build_payload(rows_by_season, status)
    previous = read_previous()
    new_count = int(payload["meta"]["players"])
    old_count = int((previous or {}).get("meta", {}).get("players", 0) or 0)
    if new_count < MIN_VALID_PLAYERS:
        msg = f"Snapshot Player Intelligence incompleto: {new_count} giocatori (< {MIN_VALID_PLAYERS})."
        if previous and old_count >= MIN_VALID_PLAYERS:
            print(msg + f" Mantengo il feed precedente ({old_count}).")
            return 0
        print(msg + " Nessun feed precedente valido: salvo comunque per diagnostica.", file=sys.stderr)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Player Intelligence: {new_count} giocatori; richieste API usate: {REQUEST_COUNT}; stagioni {payload['meta']['seasonsLoaded']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
