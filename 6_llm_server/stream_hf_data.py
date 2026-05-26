import json
import os
import re
import time
from datasets import load_dataset
from openai import OpenAI
from tqdm import tqdm

# --- CONFIGURATION ---
HF_TOKEN = "your_hf_token"
GITHUB_OUTPUT_FILE = "/abr/coss41/shared_workspace/liang_workspace/data/human_stack_gold_sft.jsonl"
TARGET_SAMPLES = 5000

client = OpenAI(base_url="http://127.0.0.1:8000/v1", api_key="sk-local")
TEACHER_MODEL = "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct"

# High-density performance regex
PERF_KEYWORDS = re.compile(
    r"("
    r"useMemo|useCallback|Suspense|dynamic|getServerSideProps|getStaticProps|"  # Core Framework
    r"LCP|CLS|INP|FID|FCP|TTFB|CWV|CoreWebVitals|"                           # Metrics
    r"IntersectionObserver|MutationObserver|PerformanceObserver|"             # Browser APIs
    r"requestIdleCallback|requestAnimationFrame|WebWorker|SharedWorker|"      # Threading
    r"priority|fetchpriority|prefetch|preload|preconnect|"                   # Network
    r"next/image|next/font|next/script|next/dynamic|"                        # Next.js Specific
    r"memo|debounce|throttle|virtualized|windowing|shimmer|skeleton|"         # UX Optimization
    r"hydration|resumability|serialization|streaming"                         # Modern Patterns
    r")", re.IGNORECASE
)

# --- THE GOLD GATE LOGIC ---

def triage_code_quality(raw_code):
    """
    Stage 1: A lightweight check to see if the code is worth the Teacher's full effort.
    """
    triage_prompt = f"System: You are a code auditor. Answer ONLY 'YES' or 'NO'.\nUser: Is the following TypeScript code complex enough to contain a meaningful web performance architectural flaw?\n\n{raw_code[:2000]}"
    try:
        response = client.chat.completions.create(
            model=TEACHER_MODEL,
            messages=[{"role": "user", "content": triage_prompt}],
            max_tokens=5,
            temperature=0.0
        )
        return "YES" in response.choices[0].message.content.upper()
    except:
        return False

def transform_stack_to_sft(raw_code, file_path):
    """
    Stage 2: Full Principal SRE Analysis.
    """
    prompt = f"""
    Act as a Principal Web Performance SRE. 
    Analyze this real-world TypeScript/Next.js file: {file_path}

    CRITICAL INSTRUCTION:
    Find a bottleneck that would be caught by Swetrix (Field Data) but missed by Lighthouse (Lab Data).
    If the code is 'clean', regress it into a version that causes a Main Thread block or a Layout Shift.

    OUTPUT:
    Return a JSON object with:
    "user_prompt": "Diagnose the performance regression in this component.",
    "assistant_response": "<think>Engine-level analysis (V8/CSSOM)</think><patch>Full file fix</patch>"

    CODE:
    {raw_code}
    """
    try:
        response = client.chat.completions.create(
            model=TEACHER_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3, # Slightly higher for more diverse reasoning
            max_tokens=3000
        )
        # Assuming your previous robust extract_json is defined
        return extract_json(response.choices[0].message.content)
    except:
        return None

# --- MAIN EXECUTION ---

print(f"🚀 Initializing Gold-Tier Stream...")
ds = load_dataset("bigcode/the-stack-v2", data_dir="data/typescript", split="train", streaming=True, token=HF_TOKEN)

count = 0
pbar = tqdm(total=TARGET_SAMPLES)

with open(GITHUB_OUTPUT_FILE, "a", encoding="utf-8") as f:
    for example in ds:
        if count >= TARGET_SAMPLES: break

        content = example['content']
        
        # 1. Structural Filter (Minimum 1.5KB, Maximum 20KB for context limits)
        if 1500 < len(content) < 20000:
            
            # 2. Keyword Density Filter
            if len(PERF_KEYWORDS.findall(content)) >= 2:
                
                # 3. Triage Gate (The Compute Saver)
                if triage_code_quality(content):
                    
                    # 4. Final Transformation
                    sft_pair = transform_stack_to_sft(content, example.get('path', 'component.tsx'))
                    
                    if sft_pair:
                        final_entry = {
                            "conversations": [
                                {"from": "user", "value": sft_pair["user_prompt"] + f"\n\n```tsx\n{content}\n```"},
                                {"from": "assistant", "value": sft_pair["assistant_response"]}
                            ]
                        }
                        f.write(json.dumps(final_entry) + "\n")
                        f.flush()
                        count += 1
                        pbar.update(1)

print(f"✅ Gold Dataset complete.")