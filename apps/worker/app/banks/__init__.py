from . import chase, generic

REGISTRY = [chase]


def detect_bank(text):
    for bank in REGISTRY:
        if bank.matches(text):
            return bank
    return generic
