import re
from typing import Tuple, Optional

def strip_vtt_tags(line: str) -> str:
    """Remove VTT formatting tags from a line."""
    return re.sub(r'<[^>]+>', '', line)

def extract_vtt_speaker(line: str, current_speaker: Optional[str] = None) -> Tuple[Optional[str], str]:
    """Extract speaker name from a VTT line, if present."""
    voice = re.search(r"<v(?:\.[^\s>]+)*\s+([^>]+)>", line, re.IGNORECASE)
    if voice:
        return voice.group(1).strip(), line[voice.end():].strip()
    return None, line
