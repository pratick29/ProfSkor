import streamlit as st

from fetchers.github_fetcher import fetch_github_user, fetch_github_repos
from core.scoring import github_score

from fetchers.leetcode_fetcher import fetch_leetcode_user
from core.leetcode_scoring import leetcode_score

st.set_page_config(page_title="Career Profile Score", page_icon="🚀", layout="centered")

st.title("🚀 Career Profile Score")
st.caption("Combined scoring (GitHub + LeetCode + LinkedIn manual) — Out of 100")

st.divider()

# Inputs
github_username = st.text_input("GitHub Username", placeholder="e.g. torvalds")
leetcode_username = st.text_input("LeetCode Username", placeholder="e.g. john_doe")

st.subheader("🔗 LinkedIn (Manual for MVP)")
has_headline = st.checkbox("✅ Has a strong headline")
has_about = st.checkbox("✅ Has About section")
has_projects = st.checkbox("✅ Has projects / featured section")
posts_weekly = st.selectbox("Posting frequency", ["0 per week", "1 per week", "2-3 per week", "4+ per week"])

st.divider()


def linkedin_manual_score():
    score = 0
    if has_headline: score += 25
    if has_about: score += 30
    if has_projects: score += 25

    if posts_weekly == "0 per week":
        score += 5
    elif posts_weekly == "1 per week":
        score += 10
    elif posts_weekly == "2-3 per week":
        score += 15
    else:
        score += 20

    return min(score, 100)


if st.button("Generate Full Profile Score ✅"):

    if not github_username.strip() and not leetcode_username.strip():
        st.error("Enter at least GitHub or LeetCode username.")
        st.stop()

    github_s, github_break, github_sug = 0, {}, []
    leet_s, leet_break, leet_sug = 0, {}, []
    leet_meta = {}
    linkedin_s = linkedin_manual_score()

    # GitHub
    if github_username.strip():
        with st.spinner("Fetching GitHub profile..."):
            user, err = fetch_github_user(github_username.strip())
            if err:
                st.warning(err)
            else:
                repos, err2 = fetch_github_repos(github_username.strip())
                if err2:
                    st.warning(err2)
                else:
                    github_s, github_break, github_sug = github_score(user, repos)

    # LeetCode
    if leetcode_username.strip():
        with st.spinner("Fetching LeetCode profile..."):
            leet_user, err = fetch_leetcode_user(leetcode_username.strip())
            if err:
                st.warning(err)
            else:
                leet_s, leet_break, leet_sug, leet_meta = leetcode_score(leet_user)

    # Weights (AI/ML-friendly)
    weights = {
        "github": 0.50,
        "leetcode": 0.20,
        "linkedin": 0.30
    }

    overall = round(
        github_s * weights["github"] +
        leet_s * weights["leetcode"] +
        linkedin_s * weights["linkedin"]
    )

    st.success(f"🏆 Overall Score: **{overall}/100**")

    st.subheader("📊 Platform Scores")
    st.write(f"💻 GitHub Score: **{github_s}/100**")
    st.write(f"🧩 LeetCode Score: **{leet_s}/100**")
    st.write(f"💼 LinkedIn Score (manual): **{linkedin_s}/100**")

    st.divider()

    # Suggestions combined
    st.subheader("✅ Improvement Suggestions")
    combined_suggestions = []

    combined_suggestions += [f"(GitHub) {x}" for x in github_sug]
    combined_suggestions += [f"(LeetCode) {x}" for x in leet_sug]

    if linkedin_s < 70:
        combined_suggestions.append("(LinkedIn) Add Featured/Projects + start weekly posting (+10 to +20)")

    if combined_suggestions:
        for s in combined_suggestions[:12]:
            st.write("•", s)
    else:
        st.write("You are already strong — keep building 🔥")

    st.divider()

    # Breakdown
    st.subheader("🔍 Breakdown")
    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown("### 💻 GitHub")
        if github_break:
            for k, v in github_break.items():
                st.write(f"**{k}:** {v}")

    with col2:
        st.markdown("### 🧩 LeetCode")
        if leet_break:
            for k, v in leet_break.items():
                st.write(f"**{k}:** {v}")
            if leet_meta:
                st.caption(f"Solved: {leet_meta['total']} | Easy: {leet_meta['easy']} | Medium: {leet_meta['medium']} | Hard: {leet_meta['hard']}")

    with col3:
        st.markdown("### 💼 LinkedIn")
        st.write("Manual Score")
        st.write(f"**Total:** {linkedin_s}/100")
