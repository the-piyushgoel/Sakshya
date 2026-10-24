from uuid import NAMESPACE_URL, uuid5


def bank_id(code: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"sakshya:bank:{code}"))


def stable_id(kind: str, value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"sakshya:{kind}:{value}"))
