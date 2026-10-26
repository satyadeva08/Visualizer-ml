from generation.text_generator import TextGenerator

g = TextGenerator()


def signs(*labels):
    return [{"label": l, "confidence": None} for l in labels]


def test_empty_gives_empty_text():
    assert g.generate([])["text"] == ""


def test_single_sign_uses_lexicon():
    r = g.generate(signs("THANK_YOU"))
    assert r["text"] == "Thank you" and r["method"] == "single_sign"


def test_unknown_single_label_is_not_invented():
    assert g.generate(signs("ZEBRA_CROSSING"))["text"] == "Zebra Crossing"


def test_safe_template_adds_only_function_words():
    r = g.generate(signs("I", "WANT", "WATER"))
    assert r["text"] == "I want water." and r["method"] == "template"
    assert "water" in r["emphasis"]


def test_unknown_combination_falls_back_to_listing():
    r = g.generate(signs("HELLO", "WATER"))
    assert r["text"] == "Recognized signs: HELLO, WATER" and r["method"] == "fallback_list"


def test_labels_are_normalised():
    assert g.generate(signs("i", "want", "water"))["text"] == "I want water."


def test_backwards_compatible_helper():
    assert g.signs_to_text(signs("YES")) == "Yes"


def test_multiword_single_sign_emphasis_is_split_into_words():
    # the frontend matches emphasis word-by-word, so "Thank you" must give two entries
    assert g.generate(signs("THANK_YOU"))["emphasis"] == ["thank", "you"]
