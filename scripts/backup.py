import argparse
import sqlite3
from datetime import datetime
from pathlib import Path

parser = argparse.ArgumentParser(description="Создать согласованную резервную копию SQLite")
parser.add_argument("--database", default="data/store.db")
parser.add_argument("--output", default="data/backups")
args = parser.parse_args()
source = Path(args.database).resolve()
if not source.is_file():
    raise SystemExit("База данных не найдена")
folder = Path(args.output)
folder.mkdir(parents=True, exist_ok=True)
target = folder / f"store-{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}.db"
with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as src:
    with sqlite3.connect(target) as dst:
        src.backup(dst)
target.chmod(0o600)
print(f"Резервная копия: {target}")
