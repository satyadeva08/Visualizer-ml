# =============================================================================
# VISUALISER — ml-service/generation/text_generator.py
#
# Sign labels -> text. DETERMINISTIC and GROUNDED: no language model.
#
# Rules (so the generator can never "invent meaning"):
#   1. One sign          -> its display text from LEXICON (or the label itself,
#                           title-cased, if the lexicon has no entry).
#   2. Known sequence    -> an exact SAFE_TEMPLATE. A template may only add
#                           function words (I, am, a ...) around the signs. It
#                           may not add facts, feelings or new content words.
#   3. Anything else     -> "Recognized signs: A, B" (nothing is guessed).
#
# The result also says HOW the text was produced (`method`) and which words come
# from recognised signs (`emphasis`) so the UI can animate them more strongly.
#
# Why not an LLM first? Latency, an extra dependency, and the risk of fluent but
# wrong sentences. With a small vocabulary a lookup is 100% explainable.
# =============================================================================

import re

# label -> display text. Add a line here when you add a sign to the vocabulary.
LEXICON = {
    "HELLO": "Hello", "THANK_YOU": "Thank you", "THANKS": "Thanks",
    "YES": "Yes", "NO": "No", "PLEASE": "Please", "HELP": "Help",
    "GOOD": "Good", "BAD": "Bad", "I": "I", "ME": "Me", "YOU": "You",
    "WE": "We", "NAME": "Name", "WATER": "Water", "FOOD": "Food",
    "MORE": "More", "STOP": "Stop", "GO": "Go", "SORRY": "Sorry",
    "WELCOME": "Welcome", "WANT": "Want", "LOVE": "Love", "HOME": "Home",
    "FRIEND": "Friend", "FAMILY": "Family", "SCHOOL": "School", "WORK": "Work",
}

# exact label sequence -> sentence. Only function words may be added.
SAFE_TEMPLATES: dict[tuple[str, ...], str] = {
    ("I", "WANT", "WATER"): "I want water.",
    ("I", "WANT", "FOOD"): "I want food.",
    ("I", "NEED", "HELP"): "I need help.",
    ("I", "LOVE", "YOU"): "I love you.",
    ("I", "GOOD"): "I am good.",
    ("I", "BAD"): "I am bad.",
    ("I", "SORRY"): "I am sorry.",
    ("PLEASE", "HELP"): "Please help.",
    ("YES", "PLEASE"): "Yes, please.",
    ("NO", "THANK_YOU"): "No, thank you.",
    ("THANK", "YOU"): "Thank you.",
    ("HELLO", "FRIEND"): "Hello, friend.",
    ("GO", "HOME"): "Go home.",
}


def _norm(label: str) -> str:
    return re.sub(r"\s+", "_", label.strip().upper())


def display(label: str) -> str:
    key = _norm(label)
    return LEXICON.get(key, key.replace("_", " ").title())


class TextGenerator:
    def generate(self, signs: list[dict]) -> dict:
        """signs: [{"label": str, ...}] -> {"text", "method", "emphasis"}"""
        labels = tuple(_norm(s["label"]) for s in signs if s.get("label"))
        if not labels:
            return {"text": "", "method": "none", "emphasis": []}

        if len(labels) == 1:
            text = display(labels[0])
            return {"text": text, "method": "single_sign", "emphasis": text.lower().split()}

        if labels in SAFE_TEMPLATES:
            text = SAFE_TEMPLATES[labels]
            sign_words = {w.lower() for l in labels for w in display(l).split()}
            words = [w.strip(".,!?").lower() for w in text.split()]
            emphasis = [w for w in words if w in sign_words]
            return {"text": text, "method": "template", "emphasis": emphasis}

        text = "Recognized signs: " + ", ".join(labels)
        return {"text": text, "method": "fallback_list", "emphasis": []}

    def signs_to_text(self, signs: list[dict]) -> str:
        """Backwards-compatible helper returning only the text."""
        return self.generate(signs)["text"]
