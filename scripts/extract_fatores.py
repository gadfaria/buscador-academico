#!/usr/bin/env python3
"""Extract the BD_Fatores sheet from the .xlsm into server/data/fatores.json.

Usage: pip install openpyxl && python3 scripts/extract_fatores.py "BUSCAd.xlsm"
"""
import json
import sys
from pathlib import Path

import openpyxl

rows = openpyxl.load_workbook(sys.argv[1], read_only=True)["BD_Fatores"].iter_rows(min_row=2, values_only=True)
data = [list(row[:7]) for row in rows if row[1] or row[2]]
target = Path(__file__).parent.parent / "server" / "data" / "fatores.json"
target.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(data)} periódicos em {target}")
