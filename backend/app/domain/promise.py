"""Promise-to-pay lifecycle: open -> kept | broken. Closed states are final."""

_ALLOWED = {"open": {"kept", "broken"}, "kept": set(), "broken": set()}


class IllegalTransition(Exception):
    pass


def next_state(current: str, target: str) -> str:
    if target not in _ALLOWED.get(current, set()):
        raise IllegalTransition(f"{current} -> {target} is not allowed")
    return target
