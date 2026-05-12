import requests
import time

GITHUB_TOKEN = "your_github_pat"
HEADERS = {"Authorization": f"token {GITHUB_TOKEN}"}

def search_perf_prs(query="repo:vercel/next.js label:performance is:merged"):
    url = f"https://api.github.com/search/issues?q={query}"
    response = requests.get(url, headers=HEADERS).json()
    
    for item in response.get('items', []):
        pr_url = item['pull_request']['url']
        # Fetch the PR details to get the 'patch' or 'diff'
        pr_data = requests.get(pr_url, headers=HEADERS).json()
        print(f"PR Title: {item['title']}")
        print(f"Patch URL: {pr_data['patch_url']}") 
        # You would then download the patch and format it for your SFT dataset
        time.sleep(1) # Respect rate limits

search_perf_prs()