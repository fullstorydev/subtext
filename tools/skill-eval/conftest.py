"""Pytest config: make lib/ importable regardless of invocation cwd.

Pytest auto-loads the nearest conftest.py and runs it before collection,
so tests can `from lib.detect_trigger import ...` without packaging.
"""

import sys
from pathlib import Path

HERE = Path(__file__).parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
