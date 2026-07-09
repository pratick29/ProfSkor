def get_role_weights(role: str):
    role = role.lower()

    if "ai/ml" in role or "aiml" in role:
        return {"github": 0.50, "leetcode": 0.20, "linkedin": 0.30}

    if "sde" in role or "backend" in role:
        return {"github": 0.35, "leetcode": 0.45, "linkedin": 0.20}

    if "data" in role:
        return {"github": 0.45, "leetcode": 0.15, "linkedin": 0.40}

    # default fallback
    return {"github": 0.40, "leetcode": 0.30, "linkedin": 0.30}
