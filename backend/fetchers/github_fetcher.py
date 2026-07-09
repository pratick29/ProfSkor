import requests
from typing import Tuple, Optional, List, Dict

GITHUB_API = "https://api.github.com"


def fetch_github_user(username: str, timeout: int = 10) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Fetch GitHub user profile data.
    
    Returns:
        Tuple of (user_data, error_message)
    """
    url = f"{GITHUB_API}/users/{username}"
    
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "ProfSkor-App"
    }
    
    try:
        res = requests.get(url, headers=headers, timeout=timeout)
        
        if res.status_code == 404:
            return None, f"GitHub user '{username}' not found"
        elif res.status_code == 403:
            return None, "GitHub API rate limit exceeded. Please try again later."
        elif res.status_code != 200:
            return None, f"GitHub API error: {res.status_code}"
            
        return res.json(), None
        
    except requests.exceptions.Timeout:
        return None, "Request timeout: GitHub API took too long to respond"
    except requests.exceptions.RequestException as e:
        return None, f"Network error: {str(e)}"
    except Exception as e:
        return None, f"Unexpected error: {str(e)}"


def fetch_github_repos(username: str, max_repos: int = 100, timeout: int = 15) -> Tuple[Optional[List[Dict]], Optional[str]]:
    """
    Fetch GitHub repositories for a user.
    
    Returns:
        Tuple of (repos_list, error_message)
    """
    url = f"{GITHUB_API}/users/{username}/repos?per_page=100&sort=updated"
    
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "ProfSkor-App"
    }
    
    try:
        res = requests.get(url, headers=headers, timeout=timeout)
        
        if res.status_code == 404:
            return None, f"GitHub user '{username}' not found"
        elif res.status_code == 403:
            return None, "GitHub API rate limit exceeded. Please try again later."
        elif res.status_code != 200:
            return None, f"Could not fetch repos: {res.status_code}"
            
        repos = res.json()[:max_repos]
        return repos, None
        
    except requests.exceptions.Timeout:
        return None, "Request timeout: GitHub API took too long to respond"
    except requests.exceptions.RequestException as e:
        return None, f"Network error: {str(e)}"
    except Exception as e:
        return None, f"Unexpected error: {str(e)}"
