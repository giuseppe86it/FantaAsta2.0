#!/usr/bin/env python3
"""FantaAsta2.0 alpha 3 — genera player-intelligence.json.

Fonte attiva iniziale: FBref, tramite soccerdata.
Il job prova le ultime tre stagioni di Serie A, normalizza i dati e costruisce
un punteggio storico per giocatore. Se il nuovo snapshot è evidentemente
incompleto, conserva il feed buono precedente.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import pandas as pd
    import soccerdata as sd
except Exception as exc:  # pragma: no cover
    print(f"Dipendenze mancanti: {exc}", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "player-intelligence.json"
CACHE_DIR = ROOT / ".cache" / "soccerdata"
SCHEMA = 1
LEAGUE = "ITA-Serie A"
MIN_VALID_PLAYERS = int(os.environ.get("FA2_PI_MIN_PLAYERS", "120"))
SEASON_START = int(os.environ.get("FA2_SEASON_START", "2026"))
SEASONS = [SEASON_START, SEASON_START - 1, SEASON_START - 2]
SEASON_WEIGHTS = {SEASONS[0]: 1.0, SEASONS[1]: 0.72, SEASONS[2]: 0.48}
STAT_TYPES = ["standard", "shooting", "passing", "defense", "misc", "keeper"]


def norm_text(value: Any) -> str:
    s = unicodedata.normalize("NFD", str(value or ""))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return s


def normalize_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", norm_text(value).lower())


def token_key(value: Any) -> str:
    tokens = re.sub(r"[^a-z0-9]+", " ", norm_text(value).lower()).split()
    return "|".join(sorted(tokens))


def colkey(value: Any) -> str:
    s = norm_text(value).lower().replace("%", " pct ")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return re.sub(r"_+", "_", s)


def flatten_df(df: pd.DataFrame) -> pd.DataFrame:
    out = df.reset_index()
    if isinstance(out.columns, pd.MultiIndex):
        cols = []
        for tup in out.columns:
            parts = [str(x).strip() for x in tup if str(x).strip() and not str(x).startswith("Unnamed")]
            cols.append(colkey("_".join(parts)))
        out.columns = cols
    else:
        out.columns = [colkey(c) for c in out.columns]
    # Duplicati possibili dopo flattening: rendili unici.
    seen: dict[str, int] = {}
    unique = []
    for c in out.columns:
        n = seen.get(c, 0)
        seen[c] = n + 1
        unique.append(c if n == 0 else f"{c}_{n+1}")
    out.columns = unique
    return out


def num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    try:
        s = str(value).replace(",", ".").strip()
        if not s or s in {"-", "—", "nan", "None"}:
            return None
        return float(s)
    except Exception:
        return None


def first_value(row: dict[str, Any], candidates: list[str]) -> Any:
    keys = list(row.keys())
    # Prima exact/endswith, poi contains: riduce collisioni.
    for cand in candidates:
        ck = colkey(cand)
        for k in keys:
            if k == ck or k.endswith("_" + ck):
                v = row.get(k)
                if v is not None and str(v) not in {"nan", "None", ""}:
                    return v
    for cand in candidates:
        ck = colkey(cand)
        for k in keys:
            if ck in k:
                v = row.get(k)
                if v is not None and str(v) not in {"nan", "None", ""}:
                    return v
    return None


def metric(row: dict[str, Any], candidates: list[str]) -> float | None:
    return num(first_value(row, candidates))


def text_metric(row: dict[str, Any], candidates: list[str]) -> str:
    v = first_value(row, candidates)
    return "" if v is None else str(v).strip()


def season_label(start: int) -> str:
    return f"{start}/{str(start + 1)[-2:]}"


def scrape_season(start_year: int) -> tuple[list[dict[str, Any]], list[str]]:
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    loaded_types: list[str] = []
    reader = sd.FBref(
        leagues=[LEAGUE],
        seasons=[start_year],
        no_cache=True,
        data_dir=CACHE_DIR / str(start_year),
    )
    for stat_type in STAT_TYPES:
        try:
            df = reader.read_player_season_stats(stat_type=stat_type)
            if df is None or df.empty:
                continue
            f = flatten_df(df)
            loaded_types.append(stat_type)
            for _, series in f.iterrows():
                row = series.to_dict()
                player = text_metric(row, ["player", "players_player"])
                team = text_metric(row, ["team", "squad"])
                if not player:
                    continue
                key = (normalize_name(player), norm_text(team).lower())
                bucket = merged.setdefault(key, {"player": player, "team": team})
                for k, v in row.items():
                    if v is None:
                        continue
                    try:
                        if pd.isna(v):
                            continue
                    except Exception:
                        pass
                    # Mantieni il prefisso del tipo per evitare collisioni.
                    bucket[f"{stat_type}_{k}"] = v
        except Exception as exc:
            print(f"[{season_label(start_year)}] {stat_type}: {exc}", file=sys.stderr)
    return list(merged.values()), loaded_types


def extract_stats(row: dict[str, Any], start_year: int) -> dict[str, Any]:
    minutes = metric(row, ["playing_time_min", "min", "minutes"])
    apps = metric(row, ["playing_time_mp", "mp", "matches"])
    starts = metric(row, ["playing_time_starts", "starts"])
    goals = metric(row, ["performance_gls", "gls", "goals"])
    assists = metric(row, ["performance_ast", "ast", "assists"])
    xg = metric(row, ["expected_xg", "xg"])
    xa = metric(row, ["expected_xag", "xag", "xa"])
    npxg = metric(row, ["expected_npxg", "npxg"])
    npxg_xa90 = metric(row, ["per_90_minutes_npxg_xag", "npxg_xag_per90", "npxg_xa_per90"])
    ga90 = metric(row, ["per_90_minutes_g_a", "g_a_per90", "goals_assists_per90"])
    shots90 = metric(row, ["standard_sh_90", "sh_90", "shots_per90"])
    key_passes = metric(row, ["kp", "key_passes"])
    tackles = metric(row, ["tkl", "tackles"])
    interceptions = metric(row, ["int", "interceptions"])
    yellows = metric(row, ["performance_crdy", "crdy", "yellow_cards"])
    reds = metric(row, ["performance_crdr", "crdr", "red_cards"])
    save_pct = metric(row, ["performance_save_pct", "save_pct"])
    clean_sheet_pct = metric(row, ["performance_cs_pct", "cs_pct", "clean_sheet_pct"])
    position = text_metric(row, ["pos", "position"])
    nineties = (minutes or 0) / 90 if minutes else metric(row, ["playing_time_90s", "90s"])
    if not nineties:
        nineties = 0
    if ga90 is None and nineties > 0:
        ga90 = ((goals or 0) + (assists or 0)) / nineties
    if npxg_xa90 is None and nineties > 0:
        npxg_xa90 = ((npxg if npxg is not None else xg or 0) + (xa or 0)) / nineties
    key_passes90 = (key_passes / nineties) if key_passes is not None and nineties > 0 else None
    tackles_interceptions90 = ((tackles or 0) + (interceptions or 0)) / nineties if nineties > 0 and (tackles is not None or interceptions is not None) else None
    cards90 = ((yellows or 0) + 2 * (reds or 0)) / nineties if nineties > 0 and (yellows is not None or reds is not None) else None
    return {
        "season": start_year,
        "seasonLabel": season_label(start_year),
        "position": position,
        "minutes": minutes,
        "apps": apps,
        "starts": starts,
        "goals": goals,
        "assists": assists,
        "xg": xg,
        "xa": xa,
        "ga90": ga90,
        "npxgXa90": npxg_xa90,
        "shots90": shots90,
        "keyPasses90": key_passes90,
        "tacklesInterceptions90": tackles_interceptions90,
        "cards90": cards90,
        "savePct": save_pct,
        "cleanSheetPct": clean_sheet_pct,
    }


def position_group(pos: str) -> str:
    p = str(pos or "").upper()
    if "GK" in p:
        return "GK"
    if "FW" in p:
        return "ATT"
    if "DF" in p and "MF" not in p:
        return "DIF"
    if "MF" in p:
        return "CEN"
    return "MOV"


def percentile(values: list[float], value: float | None, inverse: bool = False) -> float | None:
    if value is None or not values:
        return None
    clean = sorted(v for v in values if v is not None and math.isfinite(v))
    if len(clean) < 3:
        return 50.0
    below = sum(1 for v in clean if v < value)
    equal = sum(1 for v in clean if v == value)
    pct = (below + 0.5 * equal) / len(clean) * 100
    return 100 - pct if inverse else pct


def season_score(stats: dict[str, Any], pools: dict[str, list[dict[str, Any]]]) -> float:
    group = position_group(stats.get("position", ""))
    peers = pools.get(group) or pools.get("MOV") or []
    def pct(field: str, inv: bool = False) -> float | None:
        vals = [num(x.get(field)) for x in peers]
        vals = [x for x in vals if x is not None]
        return percentile(vals, num(stats.get(field)), inv)
    minutes = num(stats.get("minutes")) or 0
    reliability = min(100.0, math.sqrt(minutes / 2600) * 100) if minutes > 0 else 0
    if group == "GK":
        metrics = [(pct("savePct"), .38), (pct("cleanSheetPct"), .32), (reliability, .30)]
    elif group == "DIF":
        metrics = [(pct("npxgXa90"), .13), (pct("keyPasses90"), .12), (pct("tacklesInterceptions90"), .28), (pct("cards90", True), .09), (reliability, .38)]
    elif group == "CEN":
        metrics = [(pct("npxgXa90"), .23), (pct("ga90"), .13), (pct("keyPasses90"), .22), (pct("tacklesInterceptions90"), .14), (pct("cards90", True), .06), (reliability, .22)]
    else:
        metrics = [(pct("npxgXa90"), .34), (pct("ga90"), .22), (pct("shots90"), .13), (pct("keyPasses90"), .11), (pct("cards90", True), .04), (reliability, .16)]
    present = [(v, w) for v, w in metrics if v is not None]
    if not present:
        return round(reliability, 1)
    total_w = sum(w for _, w in present)
    return round(sum(v * w for v, w in present) / total_w, 1)


def weighted_metric(seasons: list[dict[str, Any]], field: str) -> float | None:
    vals = []
    for s in seasons:
        v = num(s.get(field))
        if v is None:
            continue
        rec = SEASON_WEIGHTS.get(int(s["season"]), .4)
        min_factor = min(1.0, max(.25, (num(s.get("minutes")) or 0) / 1800))
        vals.append((v, rec * min_factor))
    if not vals:
        return None
    sw = sum(w for _, w in vals)
    return sum(v * w for v, w in vals) / sw if sw else None


def build_payload(rows_by_season: dict[int, list[dict[str, Any]]], source_status: dict[str, Any]) -> dict[str, Any]:
    player_seasons: dict[str, list[dict[str, Any]]] = defaultdict(list)
    identities: dict[str, dict[str, Any]] = {}
    # Prima estrazione.
    season_stats_all: dict[int, list[dict[str, Any]]] = {}
    for season, rows in rows_by_season.items():
        season_stats = []
        for row in rows:
            name = row.get("player", "")
            if not name:
                continue
            stats = extract_stats(row, season)
            stats["name"] = name
            stats["team"] = row.get("team", "")
            stats["positionGroup"] = position_group(stats.get("position", ""))
            season_stats.append(stats)
        season_stats_all[season] = season_stats
    # Pool percentili per stagione/posizione.
    for season, season_stats in season_stats_all.items():
        pools: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for x in season_stats:
            pools[x["positionGroup"]].append(x)
            if x["positionGroup"] != "GK":
                pools["MOV"].append(x)
        for x in season_stats:
            x["score"] = season_score(x, pools)
            key = normalize_name(x["name"])
            if not key:
                continue
            player_seasons[key].append(x)
            identities[key] = {"name": x["name"], "team": x.get("team", ""), "positionGroup": x["positionGroup"]}
    players = {}
    for key, seasons in player_seasons.items():
        seasons.sort(key=lambda x: int(x["season"]), reverse=True)
        latest = dict(seasons[0])
        weighted = {field: weighted_metric(seasons, field) for field in [
            "minutes", "starts", "goals", "assists", "xg", "xa", "ga90", "npxgXa90",
            "shots90", "keyPasses90", "tacklesInterceptions90", "cards90", "savePct", "cleanSheetPct"
        ]}
        score_vals = []
        for s in seasons:
            w = SEASON_WEIGHTS.get(int(s["season"]), .4) * min(1.0, max(.30, (num(s.get("minutes")) or 0) / 1800))
            score_vals.append((num(s.get("score")) or 0, w))
        sw = sum(w for _, w in score_vals)
        score = sum(v * w for v, w in score_vals) / sw if sw else 0
        latest_minutes = num(latest.get("minutes")) or 0
        historic_minutes = sum((num(s.get("minutes")) or 0) * SEASON_WEIGHTS.get(int(s["season"]), .4) for s in seasons)
        reliability = min(100.0, 34 + math.sqrt(max(0, historic_minutes) / 4500) * 66)
        trend = 0.0
        if len(seasons) >= 2:
            trend = (num(seasons[0].get("score")) or 0) - (num(seasons[1].get("score")) or 0)
        ident = identities[key]
        players[key] = {
            "key": key,
            "tokenKey": token_key(ident["name"]),
            "name": ident["name"],
            "team": ident["team"],
            "positionGroup": ident["positionGroup"],
            "score": round(score, 1),
            "reliability": round(reliability, 1),
            "trend": round(trend, 1),
            "latest": latest,
            "weighted": weighted,
            "seasons": seasons[:3],
            "sources": ["FBref"],
        }
    return {
        "schema": SCHEMA,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourceName": "FBref via soccerdata",
        "players": players,
        "meta": {
            "players": len(players),
            "seasonsAttempted": [season_label(x) for x in SEASONS],
            "seasonsLoaded": [season_label(x) for x in sorted(rows_by_season, reverse=True)],
            "sources": {
                "fbref": "active",
                "fantacalcio": "live-lineups-existing-feed",
                "sofascore": "planned",
                "whoscored": "planned",
                "transfermarkt": "planned",
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
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    rows_by_season: dict[int, list[dict[str, Any]]] = {}
    status: dict[str, Any] = {}
    for season in SEASONS:
        try:
            rows, types = scrape_season(season)
            status[season_label(season)] = {"rows": len(rows), "statTypes": types}
            if rows:
                rows_by_season[season] = rows
        except Exception as exc:
            status[season_label(season)] = {"error": str(exc)}
            print(f"Stagione {season_label(season)} fallita: {exc}", file=sys.stderr)
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
    print(f"Player Intelligence: {new_count} giocatori; stagioni {payload['meta']['seasonsLoaded']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
